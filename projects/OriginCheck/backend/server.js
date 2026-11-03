import https from 'node:https';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {ApiError,finalizeResult,publicHttpsUrl,SOCIAL_MESSAGE} from './contracts.js';
import {IMAGE_LIMIT,VIDEO_LIMIT,sniffMime,validateFile,inspectMetadata,sampleTimes} from './media.js';
import {createOpenAIProvider} from './provider.js';
import {fetchPublicImage,isSocial,guardPublicLink} from './security.js';

const ALLOWED_ORIGIN='https://der-programmer1.github.io';
const int=(value,fallback,min,max)=>{if(value===undefined||value==='')return fallback;const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error('Ungültige numerische Backend-Konfiguration.');return n;};
export function makeRateLimiter(limit=10,now=Date.now){
  let minute=-1,total=0;const clients=new Map();
  return ip=>{const slot=Math.floor(now()/60000);if(slot!==minute){minute=slot;total=0;clients.clear();}
    const used=clients.get(ip)||0;if(total>=limit||used>=limit)return false;
    total++;clients.set(ip,used+1);return true;};
}
export function parseContext(raw) {
  if(!raw)return {kind:'image'};
  let context;
  try{if(raw.length>4096)throw Error();context=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));}catch{throw new ApiError(400,'invalid_context','Ungültige technische Kontextdaten.');}
  if(context.kind==='image')return {kind:'image'};
  if(context.kind!=='video_contact_sheet'||!Number.isSafeInteger(context.originalBytes)||context.originalBytes<=0||context.originalBytes>VIDEO_LIMIT||!Number.isFinite(context.durationSeconds)||context.durationSeconds<=0||context.durationSeconds>180||!Array.isArray(context.frameTimes)||context.frameTimes.length!==6||!context.frameTimes.every((t,i)=>Number.isFinite(t)&&t>=0&&t<context.durationSeconds&&(i===0||t>context.frameTimes[i-1])))throw new ApiError(400,'invalid_video_context','Der Kontaktbogen benötigt sechs verschiedene Zeitpunkte und ein Video mit höchstens 200 MB / 180 Sekunden.');
  const expected=sampleTimes(context.durationSeconds);
  if(context.frameTimes.some((t,i)=>Math.abs(t-expected[i])>0.02))throw new ApiError(400,'invalid_video_context','Die sechs Zeitpunkte müssen das Video gleichmäßig abdecken.');
  return {kind:'video_contact_sheet',originalBytes:context.originalBytes,durationSeconds:context.durationSeconds,frameTimes:context.frameTimes};
}
async function readBody(req,max,signal){
  const chunks=[];let size=0;
  try{
    if(Number(req.headers['content-length'])>max)throw new ApiError(413,'file_too_large','Die Upload-Grenze wurde überschritten.');
    const abort=()=>req.destroy();signal.addEventListener('abort',abort,{once:true});
    try{for await(const chunk of req){size+=chunk.length;if(size>max)throw new ApiError(413,'file_too_large','Die Upload-Grenze wurde überschritten.');chunks.push(chunk);}}finally{signal.removeEventListener('abort',abort);}
    if(signal.aborted)throw new ApiError(504,'timeout','Die Verarbeitung hat zu lange gedauert.');
    if(size===0)throw new ApiError(400,'empty_upload','Bitte eine Datei auswählen.');
    return Buffer.concat(chunks);
  }finally{for(const chunk of chunks)chunk.fill(0);}
}
export function createHandler(options={}) {
  const configured=options.provider?true:Boolean(process.env.OPENAI_API_KEY);
  const provider=options.provider||createOpenAIProvider();
  const fetchImage=options.fetchImage||fetchPublicImage;
  const maxBytes=int(options.maxUploadBytes??process.env.MAX_UPLOAD_BYTES,IMAGE_LIMIT,1,IMAGE_LIMIT);
  const limit=int(options.rateLimit??process.env.RATE_LIMIT_PER_MINUTE,10,1,1000);
  const timeoutMs=int(options.timeoutMs??process.env.REQUEST_TIMEOUT_MS,45000,20,120000);
  const rate=makeRateLimiter(limit,options.now||Date.now);
  let inflight=0;
  return async(req,res)=>{
    const origin=req.headers.origin;
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000','Vary':'Origin'};
    if(origin===ALLOWED_ORIGIN)Object.assign(headers,{'Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-OriginCheck-Consent, X-OriginCheck-Context','Access-Control-Max-Age':'600'});
    const send=(status,value)=>{if(!res.headersSent&&!res.destroyed)res.writeHead(status,headers).end(JSON.stringify(value));};
    if(!req.socket.encrypted){send(426,{error:{code:'https_required',message:'Dieses Backend akzeptiert ausschließlich HTTPS.'}});return;}
    if(origin && origin!==ALLOWED_ORIGIN){send(403,{error:{code:'origin_not_allowed',message:'Dieser Browser-Ursprung ist nicht freigegeben.'}});return;}
    const path=(req.url||'').split('?')[0];
    if(!['/health','/v1/analyze','/v1/analyze-link'].includes(path)){send(404,{error:{code:'not_found',message:'Endpunkt nicht gefunden.'}});return;}
    if(req.method==='OPTIONS'){res.writeHead(204,headers).end();return;}
    if(req.method==='GET'&&path==='/health'){send(configured?200:503,{status:configured?'ready':'not_configured',providerConfigured:configured,providerConnectivity:'not_tested',version:'0.1.0',...(!configured?{error:{code:'backend_not_configured',message:'Analyse-Backend nicht konfiguriert'}}:{})});return;}
    if(req.method!=='POST'||path==='/health'){send(405,{error:{code:'method_not_allowed',message:'Methode nicht erlaubt.'}});return;}
    if(!rate(req.socket.remoteAddress||'unknown')){headers['Retry-After']='60';send(429,{error:{code:'rate_limited',message:'Zu viele Anfragen. Bitte nach einer Minute erneut versuchen.'}});return;}
    if(req.headers['x-origincheck-consent']!=='yes'){send(400,{error:{code:'consent_required',message:'Vor der Übertragung ist eine ausdrückliche Zustimmung erforderlich.'}});return;}
    if(inflight>=2){send(429,{error:{code:'busy',message:'Das Backend verarbeitet gerade andere Anfragen. Bitte später erneut versuchen.'}});return;}
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const onClose=()=>{if(!res.writableEnded)controller.abort();};res.on('close',onClose);
    let bytes;inflight++;
    try{
      let mime,context;
      if(path==='/v1/analyze-link'){
        if(String(req.headers['content-type']).split(';')[0]!=='application/json')throw new ApiError(415,'invalid_mime','Für Links ist JSON erforderlich.');
        const raw=await readBody(req,4096,controller.signal);
        let body;try{body=JSON.parse(raw.toString('utf8'));}catch{throw new ApiError(400,'invalid_json','Ungültige Link-Anfrage.');}finally{raw.fill(0);}
        const {url}=guardPublicLink(typeof body.url==='string'?body.url:'');
        if(isSocial(url.hostname))throw new ApiError(422,'unsupported_social_link',SOCIAL_MESSAGE);
        // Reject literal private addresses even without a configured provider; no request is made.
        if(!configured)throw new ApiError(503,'backend_not_configured','Analyse-Backend nicht konfiguriert');
        const media=await fetchImage(url.href,{signal:controller.signal,maxBytes});bytes=media.bytes;mime=media.mime;context={kind:'image'};
      }else{
        if(!configured)throw new ApiError(503,'backend_not_configured','Analyse-Backend nicht konfiguriert');
        mime=String(req.headers['content-type']||'').split(';')[0].toLowerCase();
        if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new ApiError(415,'invalid_mime','Das Backend akzeptiert JPEG-, PNG- oder WebP-Bilddaten, bei Videos einen JPEG-Kontaktbogen.');
        context=parseContext(req.headers['x-origincheck-context']);
        if(context.kind==='video_contact_sheet'&&mime!=='image/jpeg')throw new ApiError(415,'invalid_mime','Ein Video-Kontaktbogen muss JPEG sein.');
        bytes=await readBody(req,maxBytes,controller.signal);
      }
      try{validateFile(mime,bytes.length,bytes);}catch(error){throw new ApiError(415,'invalid_media',error.message);}
      const metadata=inspectMetadata(bytes);
      if(metadata.dimensions&&(metadata.dimensions.width<=0||metadata.dimensions.height<=0||metadata.dimensions.width*metadata.dimensions.height>100000000))throw new ApiError(413,'image_dimensions','Die Bildabmessungen sind ungültig oder zu groß.');
      const abort=new Promise((_,reject)=>{if(controller.signal.aborted)reject(new ApiError(504,'timeout','Die Verarbeitung hat zu lange gedauert.'));else controller.signal.addEventListener('abort',()=>reject(new ApiError(504,'timeout','Die Verarbeitung hat zu lange gedauert.')),{once:true});});
      const answer=await Promise.race([provider({bytes,mime,context},controller.signal),abort]);
      send(200,finalizeResult(answer,metadata.signals,context));
    }catch(error){
      const safe=controller.signal.aborted?new ApiError(504,'timeout','Die Verarbeitung hat zu lange gedauert.'):error instanceof ApiError?error:new ApiError(502,'analysis_failed','Die Analyse ist fehlgeschlagen. Es wird kein Ergebnis erfunden.');
      send(safe.status,{error:{code:safe.code,message:safe.message}});
    }finally{clearTimeout(timer);res.removeListener('close',onClose);bytes?.fill(0);inflight--;}
  };
}
export function startServer(){
  const cert=process.env.TLS_CERT_FILE,key=process.env.TLS_KEY_FILE;
  if(!cert||!key)throw new Error('Für HTTPS sind TLS_CERT_FILE und TLS_KEY_FILE erforderlich.');
  const server=https.createServer({cert:fs.readFileSync(cert),key:fs.readFileSync(key),minVersion:'TLSv1.2',maxHeaderSize:16384},createHandler());
  server.requestTimeout=60000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxConnections=100;
  const port=int(process.env.PORT,8443,1,65535);server.listen(port,process.env.BIND_HOST||'127.0.0.1',()=>console.log('OriginCheck HTTPS-Service gestartet. Medien und Zugangsdaten werden nicht protokolliert.'));
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{startServer();}catch{console.error('OriginCheck konnte nicht starten. TLS-Pfade und Konfiguration prüfen; keine geheimen Werte ausgeben.');process.exitCode=1;}}
