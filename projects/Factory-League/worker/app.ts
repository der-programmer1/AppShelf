import {createHash,timingSafeEqual} from 'node:crypto';
import {GameError,GameStore} from './game-store';
import {AccountStore} from './accounts';
import {VERSION,type GameAction} from '../shared/game';

export type Assets=Record<string,{body:string;type:string}>;
export type Env={DB:D1Database;PASSWORD_PEPPER:string;BACKUP_TOKEN?:string};
type Options={now?:()=>number;secureCookies?:boolean;assets?:Assets};
const badInput=()=>new GameError('invalid_request','Bitte überprüfe deine Eingabe.');
function fields(body:Record<string,unknown>,allowed:string[],required=allowed){if(Object.keys(body).some(key=>!allowed.includes(key))||required.some(key=>!(key in body)))throw badInput();}
function name(value:unknown):asserts value is string{if(typeof value!=='string'||!/^[A-Za-z0-9_]{3,20}$/.test(value))throw badInput();}
function password(value:unknown,min=10):asserts value is string{if(typeof value!=='string'||value.length<min||value.length>128)throw badInput();}
async function bodyOf(request:Request){if(!request.headers.get('content-type')?.split(';')[0].trim().toLowerCase().endsWith('application/json'))throw new GameError('invalid_request','Bitte sende deine Anfrage als JSON.',415);if(Number(request.headers.get('content-length'))>8192)throw new GameError('request_too_large','Die Anfrage ist zu groß.',413);const raw=await request.text();if(new TextEncoder().encode(raw).length>8192)throw new GameError('request_too_large','Die Anfrage ist zu groß.',413);try{const value:unknown=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value!=='object')throw badInput();return value as Record<string,unknown>;}catch{throw badInput();}}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function createWorker(options:Options={}){
  const now=options.now??Date.now,secure=options.secureCookies??true,cookieName=secure?'__Host-fl_session':'fl_session',cookieSuffix=`; Path=/; HttpOnly; SameSite=Lax${secure?'; Secure':''}`;
  const recent=new Map<string,{count:number;until:number}>();let cleanupAt=0;
  const cookie=(token:string)=>`${cookieName}=${token}; Max-Age=2592000${cookieSuffix}`;
  const tokenOf=(request:Request)=>(request.headers.get('cookie')??'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const json=(value:unknown,status=200,headers?:HeadersInit)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...Object.fromEntries(new Headers(headers))}});
  async function limit(db:D1Database,key:string,max:number,window:number,time:number){
    const bucket=Math.floor(time/window),result=await db.prepare('INSERT INTO limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(hash(key+':'+bucket),time+window*2,max).first();
    if(!result)throw new GameError('rate_limited','Einen Moment bitte. Versuche es später noch einmal.',429);
  }
  async function handle(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url),path=url.pathname,time=now();
    if(path==='/health'){
      try{await env.DB.prepare('SELECT id FROM accounts LIMIT 1').first();return json({status:'ok',database:'ok',authentication:'local',storage:'D1',version:VERSION});}
      catch{return json({status:'unavailable',database:'unavailable'},503);}
    }
    if(!path.startsWith('/api/')){
      if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'not_found',message:'Diese Seite wurde nicht gefunden.'},404);
      const asset=options.assets?.[path]??(!/\.[a-z0-9]+$/i.test(path)?options.assets?.['/index.html']:undefined);
      if(!asset)return json({error:'not_found',message:'Diese Seite wurde nicht gefunden.'},404);
      const bytes=Uint8Array.from(atob(asset.body),char=>char.charCodeAt(0));
      return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':asset.type.startsWith('text/html')?'no-cache':path.startsWith('/assets/')?'public,max-age=31536000,immutable':'public,max-age=86400'}});
    }
    const address=request.headers.get('cf-connecting-ip')??'unknown',ipKey=hash(address);
    const recentKey=ipKey+':'+Math.floor(time/60000),entry=recent.get(recentKey)??{count:0,until:time+120000};entry.count++;recent.set(recentKey,entry);
    if(recent.size>1000)for(const[key,value]of recent)if(value.until<time)recent.delete(key);
    if(entry.count>600)throw new GameError('rate_limited','Einen Moment bitte. Versuche es gleich erneut.',429);
    if(recent.size>10000)recent.clear();
    if(time>cleanupAt){cleanupAt=time+3600000;ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM limits WHERE expires_at<?').bind(time),env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(time),env.DB.prepare('DELETE FROM actions WHERE created_at<?').bind(time-7*86400000),
    ]).catch(()=>{}));}
    if(['POST','PUT','DELETE','PATCH'].includes(request.method)){
      if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.has('origin')&&request.headers.get('origin')!==url.origin))throw new GameError('invalid_origin','Diese Anfrage stammt nicht von Factory League.',403);
    }
    const game=new GameStore(env.DB),accounts=new AccountStore(env.DB,game,env.PASSWORD_PEPPER),token=tokenOf(request);
    if(request.method==='GET'){
      if(path==='/api/config')return json({version:VERSION,authentication:'username-password',storage:'D1'});
      if(path==='/api/auth/session')return json({user:await accounts.session(token,time)});
      if(path==='/api/leaderboard'){
        const page=Number(url.searchParams.get('page')??1);if(!Number.isInteger(page)||page<1||page>1000000)throw badInput();
        return json(await game.leaderboard(time,page,(await accounts.session(token,time))?.id));
      }
      if(path.startsWith('/api/players/')){const id=path.slice('/api/players/'.length);if(id.length>50||id.includes('/'))throw badInput();return json(await game.profile(id,time));}
      if(path==='/api/admin/backup'){
        if(!env.BACKUP_TOKEN)throw new GameError('backup_unavailable','Backups sind noch nicht konfiguriert.',503);
        const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
        if(!timingSafeEqual(Buffer.from(hash(supplied),'hex'),Buffer.from(hash(env.BACKUP_TOKEN),'hex')))throw new GameError('forbidden','Kein Zugriff.',403);
        await limit(env.DB,'backup:'+ipKey,3,3600000,time);
        const exported=await env.DB.batch([
          env.DB.prepare('SELECT * FROM accounts'),env.DB.prepare('SELECT * FROM players'),env.DB.prepare('SELECT * FROM actions'),
        ]);
        return json({format:'factory-league-backup',version:2,createdAt:new Date(time).toISOString(),accounts:exported[0].results,players:exported[1].results,actions:exported[2].results},200,{'Content-Disposition':'attachment; filename="factory-league-backup.json"'});
      }
    }
    if(request.method==='POST'){
      const body=await bodyOf(request);
      if(path==='/api/auth/register'||path==='/api/auth/login'||path==='/api/auth/recover'){
        fields(body,path.endsWith('recover')?['name','password','recoveryCode']:['name','password']);name(body.name);password(body.password,path.endsWith('login')?1:10);
        const mode=path.split('/').pop()!;
        await limit(env.DB,mode+':ip:'+ipKey,mode==='register'?20:mode==='login'?10:5,mode==='login'?60000:3600000,time);
        if(mode!=='register')await limit(env.DB,mode+':name:'+body.name.toLowerCase(),mode==='login'?20:5,mode==='login'?900000:3600000,time);
        let result;
        if(mode==='register')result=await accounts.register(body.name,body.password,time);
        else if(mode==='login')result=await accounts.login(body.name,body.password,time);
        else{if(typeof body.recoveryCode!=='string'||body.recoveryCode.length<10||body.recoveryCode.length>150)throw badInput();result=await accounts.recover(body.name,body.recoveryCode,body.password,time);}
        const{token:createdToken,...publicResult}=result;return json(publicResult,200,{'Set-Cookie':cookie(createdToken)});
      }
      if(path==='/api/auth/logout'){fields(body,[]);await accounts.logout(token);return json({ok:true},200,{'Set-Cookie':`${cookieName}=; Max-Age=0${cookieSuffix}`});}
      const user=await accounts.session(token,time);if(!user)throw new GameError('authentication_required','Deine Sitzung ist abgelaufen. Bitte melde dich an.',401);
      if(path==='/api/sync'){fields(body,[]);return json(await game.sync(user.id,time));}
      if(path==='/api/profile'){fields(body,['name']);name(body.name);return json(await game.snapshot(user.id,time));}
      if(path==='/api/actions'){
        const upgrade=body.type==='upgrade';fields(body,upgrade?['type','lineId','station','requestId']:['type','lineId','requestId']);
        if((!upgrade&&body.type!=='unlockLine')||!['metal','electronics','robotics'].includes(String(body.lineId))||(!upgrade&&body.lineId==='metal')||typeof body.requestId!=='string'||body.requestId.length<16||body.requestId.length>80||(upgrade&&![0,1,2].includes(body.station as number)))throw badInput();
        await limit(env.DB,'actions:'+user.id,120,60000,time);return json(await game.act(user.id,body as GameAction,time));
      }
    }
    return json({error:'not_found',message:'Diese Seite wurde nicht gefunden.'},404);
  }
  return{async fetch(request:Request,env:Env,ctx:ExecutionContext){
    let response:Response;
    try{response=await handle(request,env,ctx);}catch(error){
      if(error instanceof GameError)response=json({error:error.code,message:error.message},error.status);
      else{console.error('Factory League request failed:',error instanceof Error?error.message:'Unexpected error');response=json({error:'internal_error',message:'Das hat gerade nicht geklappt. Bitte versuche es erneut.'},500);}
    }
    const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(secure)headers.set('Strict-Transport-Security','max-age=31536000');
    return new Response(response.body,{status:response.status,headers});
  }};
}
