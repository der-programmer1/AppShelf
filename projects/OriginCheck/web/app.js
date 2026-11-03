import {VERDICTS,BANDS,backendUrl,publicHttpsUrl,SOCIAL_MESSAGE} from './contracts.js';
import {IMAGE_LIMIT,VIDEO_LIMIT,validateFile,inspectMetadata,sampleTimes} from './media-core.js';
export const HISTORY_KEY='origincheck.history.v1',BACKEND_KEY='origincheck.backend.v1';
export function isSocialLink(raw){try{const h=new URL(raw).hostname;return ['instagram.com','facebook.com','fb.watch','tiktok.com','youtube.com','youtu.be','x.com','twitter.com','threads.net','threads.com','linkedin.com','snapchat.com','reddit.com','vimeo.com','pinterest.com'].some(d=>h===d||h.endsWith('.'+d));}catch{return false;}}
export function validateResult(value){
  if(!value||value.schemaVersion!==1||value.providerStatus!=='ok'||!Object.hasOwn(VERDICTS,value.verdict)||!BANDS.includes(value.confidenceBand)||typeof value.summary!=='string'||value.summary.length>2000||!value.summary.trim()||!Array.isArray(value.signals)||value.signals.length>30||!value.signals.every(s=>s&&typeof s.title==='string'&&s.title.length<=160&&['vorhanden','nicht gefunden','unklar'].includes(s.status)&&typeof s.explanation==='string'&&s.explanation.length<=1000)||!Array.isArray(value.limitations)||!value.limitations.every(x=>typeof x==='string'&&x.length<=1000)||value.limitations.length<1||value.limitations.length>25||typeof value.analyzedAt!=='string'||!Number.isFinite(Date.parse(value.analyzedAt)))throw new Error('Das Backend lieferte kein gültiges Ergebnis. Es wird keine Einschätzung angezeigt.');
  return value;
}
function abortError(){return new DOMException('Abgebrochen','AbortError');}
function mediaEvent(element,kind,signal,timeout=15000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>end(new Error('Das Medienformat konnte nicht rechtzeitig gelesen werden.')),timeout);
    const ok=()=>end(),bad=()=>end(new Error('Dieses Medienformat wird im Browser nicht decodiert. Bitte als JPEG oder MP4 exportieren.')),cancel=()=>end(abortError());
    function end(error){clearTimeout(timer);element.removeEventListener(kind,ok);element.removeEventListener('error',bad);signal?.removeEventListener('abort',cancel);error?reject(error):resolve();}
    element.addEventListener(kind,ok,{once:true});element.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  });
}
async function jpeg(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Der Browser konnte kein JPEG erzeugen.')),'image/jpeg',0.88));}
export async function prepareFile(file,{signal,onProgress=()=>{}}={}){
  if(file.size>VIDEO_LIMIT||file.size<=0)throw new Error('Die Datei ist leer oder größer als 200 MB.');
  const head=new Uint8Array(await file.slice(0,2*1024*1024).arrayBuffer());
  if(signal?.aborted)throw abortError();
  const info=validateFile(file.type,file.size,head),metadata=inspectMetadata(head);
  if(metadata.dimensions&&(metadata.dimensions.width<=0||metadata.dimensions.height<=0||metadata.dimensions.width*metadata.dimensions.height>100000000))throw new Error('Die Bildabmessungen sind ungültig oder größer als 100 Megapixel.');
  const url=URL.createObjectURL(file);let media;
  try{
    if(!info.isVideo){
      media=new Image();const loaded=mediaEvent(media,'load',signal);media.src=url;await loaded;
      if(!media.naturalWidth||media.naturalWidth*media.naturalHeight>100000000)throw new Error('Die Bildabmessungen werden nicht unterstützt.');
      const scale=Math.min(1,2048/Math.max(media.naturalWidth,media.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(media.naturalWidth*scale));canvas.height=Math.max(1,Math.round(media.naturalHeight*scale));
      canvas.getContext('2d').drawImage(media,0,0,canvas.width,canvas.height);
      onProgress('Bild lokal geprüft und als JPEG vorbereitet. Noch kein Upload.');
      const blob=await jpeg(canvas);if(signal?.aborted)throw abortError();
      return {blob,context:{kind:'image'},signals:metadata.signals,note:'Für die Cloud wird ein verkleinertes JPEG ohne Original-EXIF erzeugt. Animierte Bilder werden als Standbild behandelt.',size:file.size,mime:info.mime};
    }
    media=document.createElement('video');media.preload='auto';media.muted=true;media.playsInline=true;media.setAttribute('webkit-playsinline','');media.setAttribute('aria-hidden','true');media.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';document.body.append(media);
    const loaded=mediaEvent(media,'loadedmetadata',signal);media.src=url;media.load();await loaded;
    const times=sampleTimes(media.duration);
    if(!media.videoWidth||!media.videoHeight||media.videoWidth*media.videoHeight>100000000)throw new Error('Die Videoabmessungen werden nicht unterstützt.');
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=660;const ctx=canvas.getContext('2d');ctx.fillStyle='#12283c';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<times.length;i++){
      if(signal?.aborted)throw abortError();onProgress(`Video lokal: Frame ${i+1} von 6 wird gelesen. Noch kein Upload.`);
      const seeked=mediaEvent(media,'seeked',signal);media.currentTime=times[i];await seeked;
      if(media.readyState<2)await mediaEvent(media,'loadeddata',signal);
      const x=(i%3)*512,y=Math.floor(i/3)*330,scale=Math.min(512/media.videoWidth,288/media.videoHeight),w=media.videoWidth*scale,h=media.videoHeight*scale;
      ctx.drawImage(media,x+(512-w)/2,y+(288-h)/2,w,h);ctx.fillStyle='#e9f2f5';ctx.font='18px sans-serif';ctx.fillText(`Frame ${i+1} · ${times[i].toFixed(2)} s`,x+12,y+315);
    }
    const blob=await jpeg(canvas);if(signal?.aborted)throw abortError();
    return {blob,context:{kind:'video_contact_sheet',originalBytes:file.size,durationSeconds:media.duration,frameTimes:times},signals:[...metadata.signals,{title:'Video-Container',status:'vorhanden',explanation:`Browser meldet ${media.videoWidth} × ${media.videoHeight} Pixel und ${media.duration.toFixed(2)} Sekunden; sechs verschiedene Zeitpunkte decodiert.`}],note:'Nur sechs gleichmäßig verteilte Standbilder werden übertragen. Kein durchgängiger Bewegungsverlauf, kein Ton, keine vollständige temporale Videoprüfung.',size:file.size,mime:info.mime};
  }finally{
    if(media instanceof HTMLVideoElement){media.pause();media.removeAttribute('src');media.load();media.remove();}else if(media)media.src='';
    URL.revokeObjectURL(url);
  }
}
export async function requestAnalysis({base,prepared,link,consent,signal,fetcher=fetch}){
  if(consent!==true)throw new Error('Bitte der aktuellen Übertragung ausdrücklich zustimmen.');
  const endpoint=backendUrl(base);
  const health=await fetcher(endpoint+'/health',{method:'GET',signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  if(!health.ok){let data;try{data=await health.json();}catch{}throw new Error(data?.error?.code==='backend_not_configured'?'Analyse-Backend nicht konfiguriert':'Das Backend ist nicht bereit. Bitte später erneut versuchen.');}
  const headers={'X-OriginCheck-Consent':'yes'};let path,body;
  if(prepared){headers['Content-Type']='image/jpeg';headers['X-OriginCheck-Context']=btoa(JSON.stringify(prepared.context)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');path='/v1/analyze';body=prepared.blob;if(body.size>IMAGE_LIMIT)throw new Error('Der vorbereitete Upload ist zu groß.');}
  else{const url=publicHttpsUrl(link);if(isSocialLink(url.href))throw new Error(SOCIAL_MESSAGE);headers['Content-Type']='application/json';path='/v1/analyze-link';body=JSON.stringify({url:url.href});}
  const response=await fetcher(endpoint+path,{method:'POST',headers,body,signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  const raw=await response.text();if(raw.length>256*1024)throw new Error('Die Backend-Antwort ist zu groß.');
  let result;try{result=JSON.parse(raw);}catch{throw new Error('Das Backend lieferte keine gültige JSON-Antwort.');}
  if(!response.ok){const code=result?.error?.code;if(code==='backend_not_configured')throw new Error('Analyse-Backend nicht konfiguriert');throw new Error(typeof result?.error?.message==='string'?result.error.message.slice(0,1000):`Backend-Fehler (${response.status}).`);}
  return validateResult(result);
}
function boot(){
  const $=id=>document.getElementById(id),show=(id,value)=>$(id).hidden=!value;
  const create=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  let selected=null,current=null,previewUrl=null,active=null,ttl=null,busy=false,generation=0,history=[];
  try{$('backend').value=localStorage.getItem(BACKEND_KEY)||'';const saved=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(Array.isArray(saved))history=saved.slice(0,50).filter(x=>{try{return typeof x.id==='string'&&!!validateResult(x.result);}catch{return false;}});}catch{}
  function error(message){$('error').textContent=message;show('error',!!message);}
  function backendStatus(){try{backendUrl($('backend').value);$('backend-status').textContent='Adresse eingetragen. Erreichbarkeit und Anbieterzugang werden erst bei einer Analyse geprüft.';}catch{$('backend-status').textContent='Analyse-Backend nicht konfiguriert';}}
  function update(){show('offline',!navigator.onLine);let valid=!!selected;try{valid=valid||!!publicHttpsUrl($('link').value)&&!isSocialLink($('link').value);}catch{}$('analyze').disabled=busy||!valid||!$('consent').checked;$('consent').disabled=busy;$('file').disabled=busy;show('cancel',busy||!!selected);}
  function clearSelection(){generation++;active?.abort();active=null;clearTimeout(ttl);selected=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('preview').removeAttribute('src');show('preview',false);show('local',false);$('file').value='';$('file-name').textContent='Noch keine Datei ausgewählt.';$('consent').checked=false;busy=false;update();}
  function signals(target,values){target.replaceChildren();for(const s of values){const li=create('li');li.append(create('strong',`${s.title} · ${s.status}`),create('span',s.explanation));target.append(li);}}
  function renderResult(value){current=validateResult(value);$('verdict').textContent=VERDICTS[value.verdict];$('confidence').textContent=`Vertrauensband: ${value.confidenceBand} · qualitativ`;$('summary').textContent=value.summary;signals($('result-signals'),value.signals);$('limitations').replaceChildren(...value.limitations.map(s=>create('li',s)));$('analyzed-at').textContent='Analysiert: '+new Date(value.analyzedAt).toLocaleString('de-DE');show('result',true);}
  function persist(next){localStorage.setItem(HISTORY_KEY,JSON.stringify(next));history=next;renderHistory();}
  function renderHistory(){$('history').replaceChildren();show('history-empty',history.length===0);for(const item of history){const li=create('li');li.append(create('strong',VERDICTS[item.result.verdict]),create('p',new Date(item.result.analyzedAt).toLocaleString('de-DE')));const open=create('button','Ergebnis öffnen','secondary'),remove=create('button','Dieses Ergebnis löschen','secondary');open.type=remove.type='button';open.addEventListener('click',()=>{renderResult(item.result);$('result').scrollIntoView({behavior:'smooth',block:'start'});});remove.addEventListener('click',()=>{try{persist(history.filter(x=>x.id!==item.id));}catch{error('Der Browser konnte das gespeicherte Ergebnis nicht löschen.');}});li.append(open,remove);$('history').append(li);}}
  $('save-backend').addEventListener('click',()=>{try{const value=backendUrl($('backend').value);$('backend').value=value;try{localStorage.setItem(BACKEND_KEY,value);}catch{error('Die Adresse kann in diesem Browser nur für die aktuelle Sitzung verwendet werden.');}backendStatus();}catch(e){error(e.message);}});
  $('backend').addEventListener('input',()=>{$('consent').checked=false;backendStatus();update();});
  $('file').addEventListener('change',async()=>{const file=$('file').files?.[0];clearSelection();if(!file)return;$('link').value='';current=null;show('result',false);error('');active=new AbortController();const ticket=generation;busy=true;$('file-name').textContent=file.name;$('progress').textContent='Datei wird ausschließlich lokal geprüft …';update();
    try{const result=await prepareFile(file,{signal:active.signal,onProgress:message=>{$('progress').textContent=message;}});if(ticket!==generation)return;selected=result;previewUrl=URL.createObjectURL(result.blob);$('preview').src=previewUrl;show('preview',true);signals($('local-signals'),result.signals);$('sampling-note').textContent=result.note;show('local',true);$('progress').textContent='Lokale Vorbereitung abgeschlossen. Noch keine Cloud-Analyse.';ttl=setTimeout(()=>{clearSelection();$('progress').textContent='Temporäre Dateidaten nach zehn Minuten gelöscht. Bitte erneut auswählen.';},10*60*1000);}
    catch(e){if(ticket===generation){if(e.name!=='AbortError')error(e.message);clearSelection();}}finally{if(ticket===generation){busy=false;active=null;update();}}
  });
  $('link').addEventListener('input',()=>{if(selected||busy)clearSelection();$('consent').checked=false;current=null;show('result',false);error('');if(isSocialLink($('link').value))error(SOCIAL_MESSAGE);$('progress').textContent='Der Link wird erst nach Zustimmung an das Backend gesendet.';update();});
  $('consent').addEventListener('change',update);
  $('clear-file').addEventListener('click',()=>{clearSelection();$('progress').textContent='Temporäre Dateidaten gelöscht.';});
  $('cancel').addEventListener('click',()=>{clearSelection();$('progress').textContent='Abgebrochen. Temporäre Daten gelöscht.';});
  $('analyze').addEventListener('click',async()=>{if(busy)return;try{backendUrl($('backend').value);}catch{error('Analyse-Backend nicht konfiguriert');return;}if(!$('consent').checked){error('Bitte zuerst der aktuellen Übertragung zustimmen.');return;}const media=selected,link=$('link').value,consent=$('consent').checked,ticket=generation,controller=new AbortController();busy=true;active=controller;$('progress').textContent='Übertragung und vorsichtige Analyse laufen …';error('');show('result',false);update();const timer=setTimeout(()=>controller.abort(),50000);
    try{const value=await requestAnalysis({base:$('backend').value,prepared:media,link,consent,signal:controller.signal});if(ticket!==generation)return;renderResult(value);$('progress').textContent='Analyse abgeschlossen. Ergebnis noch nicht gespeichert.';}
    catch(e){if(ticket!==generation)return;error(e.name==='AbortError'?'Analyse abgebrochen oder Zeitlimit erreicht. Es wurde kein Ergebnis erzeugt.':e instanceof TypeError?'Backend nicht erreichbar. Internet, HTTPS-Adresse und CORS-Konfiguration prüfen.':e.message);$('progress').textContent='Keine Herkunftseinschätzung verfügbar.';}
    finally{clearTimeout(timer);if(ticket===generation)clearSelection();}
  });
  $('save-result').addEventListener('click',()=>{if(!current)return;try{persist([{id:crypto.randomUUID(),result:current},...history].slice(0,50));$('progress').textContent='Dieses Ergebnis wurde ausdrücklich lokal gespeichert.';}catch{error('Der Browser konnte das Ergebnis nicht speichern.');}});
  $('delete-result').addEventListener('click',()=>{current=null;show('result',false);});
  $('clear-history').addEventListener('click',()=>{try{localStorage.removeItem(HISTORY_KEY);history=[];renderHistory();}catch{error('Der Browser konnte die Historie nicht löschen.');}});
  window.addEventListener('online',update);window.addEventListener('offline',update);
  window.addEventListener('pagehide',clearSelection);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearSelection();$('progress').textContent='Beim Verlassen wurden temporäre Medien entfernt und laufende Anfragen abgebrochen.';}});
  backendStatus();renderHistory();update();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{ $('backend-status').append(document.createTextNode(' Offline-Shell konnte nicht installiert werden.')); });
}
if(typeof document!=='undefined')boot();
