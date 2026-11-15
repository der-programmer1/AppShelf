import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import cookie from "@fastify/cookie";
import type {FastifyRequest} from "fastify";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { existsSync, createReadStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { GameStore, GameError } from "./store.js";
import { AccountStore, type PublicUser } from "./accounts.js";
import { VERSION, type GameAction } from "../shared/game.js";

type Authenticate=(request:FastifyRequest)=>Promise<{uid:string}>;
export type AppOptions={databasePath?:string;authenticate?:Authenticate;now?:()=>number;backupToken?:string;staticRoot?:string;logger?:boolean;secureCookies?:boolean;origin?:string};
export async function createApp(options:AppOptions={}){
  const store=new GameStore(options.databasePath??"data/factory-league.sqlite"),now=options.now??Date.now;
  const app=Fastify({logger:options.logger??false,trustProxy:(_address:string,hop:number)=>hop<1,bodyLimit:8192,requestTimeout:15000,ajv:{customOptions:{removeAdditional:false}}});
  const accounts=new AccountStore(store.db,store);await accounts.ready;
  const secureCookies=options.secureCookies??process.env.NODE_ENV==="production",cookieName=secureCookies?"__Host-fl_session":"fl_session";
  const cookieOptions={httpOnly:true,secure:secureCookies,sameSite:"lax" as const,path:"/",maxAge:30*86400};
  await app.register(cookie);
  const requireActor:Authenticate=options.authenticate??(async request=>{const user=accounts.session(request.cookies[cookieName],now());if(!user)throw new GameError("authentication_required","Deine Sitzung ist abgelaufen. Bitte melde dich an.",401);return{uid:user.id};});
  const optionalActor=async(request:Parameters<Authenticate>[0])=>{try{return await requireActor(request);}catch(error){if(error instanceof GameError&&(error.status===401||error.status===403))return undefined;throw error;}};
  await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:"],fontSrc:["'self'"],connectSrc:["'self'"],frameSrc:["'none'"],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"],upgradeInsecureRequests:secureCookies?[]:null}}});
  await app.register(rateLimit,{max:600,timeWindow:"1 minute",allowList:request=>!request.url.startsWith("/api/")});
  app.addHook("onSend",async(request,reply,payload)=>{if(request.url.startsWith("/api/"))reply.header("Cache-Control","no-store");return payload;});
  app.addHook("onRequest",async(request)=>{
    if(!["POST","PUT","DELETE","PATCH"].includes(request.method)||!request.url.startsWith("/api/"))return;
    if(request.headers["sec-fetch-site"]==="cross-site")throw new GameError("invalid_origin","Diese Anfrage stammt nicht von Factory League.",403);
    const origin=request.headers.origin;
    if(origin){let valid=false;try{const incoming=new URL(origin);valid=options.origin?incoming.origin===new URL(options.origin).origin:incoming.host===request.headers.host&&(!secureCookies||incoming.protocol==="https:");}catch{/* Malformed origins fail closed. */}if(!valid)throw new GameError("invalid_origin","Diese Anfrage stammt nicht von Factory League.",403);}
  });
  app.get("/health",async()=>{store.db.prepare("SELECT 1").get();return{status:"ok",database:"ok",authentication:"local",version:VERSION};});
  app.get("/api/config",async()=>({version:VERSION,authentication:"username-password"}));
  const nameSchema={type:"string",minLength:3,maxLength:20,pattern:"^[A-Za-z0-9_]+$"},passwordSchema={type:"string",minLength:10,maxLength:128};
  app.get("/api/auth/session",async request=>({user:accounts.session(request.cookies[cookieName],now())}));
  app.post<{Body:{name:string;password:string}}>("/api/auth/register",{config:{rateLimit:{max:20,timeWindow:"1 hour"}},schema:{body:{type:"object",additionalProperties:false,required:["name","password"],properties:{name:nameSchema,password:passwordSchema}}}},async(request,reply)=>{
    const{token,...result}=await accounts.register(request.body.name,request.body.password,now());reply.setCookie(cookieName,token,cookieOptions);return result;
  });
  app.post<{Body:{name:string;password:string}}>("/api/auth/login",{config:{rateLimit:{max:10,timeWindow:"1 minute"}},schema:{body:{type:"object",additionalProperties:false,required:["name","password"],properties:{name:nameSchema,password:{type:"string",minLength:1,maxLength:128}}}}},async(request,reply)=>{
    const{token,...result}=await accounts.login(request.body.name,request.body.password,now());reply.setCookie(cookieName,token,cookieOptions);return result;
  });
  app.post("/api/auth/logout",{schema:{body:{type:"object",additionalProperties:false}}},async(request,reply)=>{accounts.logout(request.cookies[cookieName]);reply.clearCookie(cookieName,{httpOnly:true,secure:secureCookies,sameSite:"lax",path:"/"});return{ok:true};});
  app.post<{Body:{name:string;recoveryCode:string;password:string}}>("/api/auth/recover",{config:{rateLimit:{max:5,timeWindow:"1 hour"}},schema:{body:{type:"object",additionalProperties:false,required:["name","recoveryCode","password"],properties:{name:nameSchema,password:passwordSchema,recoveryCode:{type:"string",minLength:10,maxLength:150}}}}},async(request,reply)=>{
    const{token,...result}=await accounts.recover(request.body.name,request.body.recoveryCode,request.body.password,now());reply.setCookie(cookieName,token,cookieOptions);return result;
  });
  app.post<{Body:{name:string}}>("/api/profile",{schema:{body:{type:"object",additionalProperties:false,required:["name"],properties:{name:{type:"string",minLength:3,maxLength:20,pattern:"^[A-Za-z0-9_]+$"}}}}},async request=>{const actor=await requireActor(request);return store.create(actor.uid,request.body.name,now());});
  app.post("/api/sync",{schema:{body:{type:"object",additionalProperties:false}}},async request=>{const actor=await requireActor(request);return store.sync(actor.uid,now());});
  app.post<{Body:GameAction}>("/api/actions",{schema:{body:{oneOf:[
    {type:"object",additionalProperties:false,required:["type","lineId","station","requestId"],properties:{type:{const:"upgrade"},lineId:{enum:["metal","electronics","robotics"]},station:{type:"integer",minimum:0,maximum:2},requestId:{type:"string",minLength:16,maxLength:80}}},
    {type:"object",additionalProperties:false,required:["type","lineId","requestId"],properties:{type:{const:"unlockLine"},lineId:{enum:["electronics","robotics"]},requestId:{type:"string",minLength:16,maxLength:80}}},
  ]}}},async request=>{const actor=await requireActor(request);return store.act(actor.uid,request.body,now());});
  app.get<{Querystring:{page?:number}}>("/api/leaderboard",{schema:{querystring:{type:"object",properties:{page:{type:"integer",minimum:1,maximum:1000000}}}}},async request=>{const actor=await optionalActor(request);return store.leaderboard(now(),request.query.page??1,actor?.uid);});
  app.get<{Params:{id:string}}>("/api/players/:id",{schema:{params:{type:"object",properties:{id:{type:"string",maxLength:50}},required:["id"]}}},async request=>store.profile(request.params.id,now()));
  app.get("/api/admin/backup",{config:{rateLimit:{max:3,timeWindow:"1 hour"}}},async(request,reply)=>{
    if(!options.backupToken)throw new GameError("backup_unavailable","Backups sind noch nicht konfiguriert.",503);
    const supplied=request.headers.authorization?.replace(/^Bearer /,"")??"";
    const hash=(text:string)=>createHash("sha256").update(text).digest();
    if(!timingSafeEqual(hash(supplied),hash(options.backupToken)))throw new GameError("forbidden","Kein Zugriff.",403);
    const folder=resolve(dirname(options.databasePath??"data/factory-league.sqlite"),"backups");await mkdir(folder,{recursive:true});
    const path=resolve(folder,`export-${randomUUID()}.sqlite`);await store.db.backup(path);
    const stream=createReadStream(path);stream.on("close",()=>void unlink(path).catch(()=>{}));
    return reply.header("Content-Type","application/vnd.sqlite3").header("Content-Disposition",'attachment; filename="factory-league.sqlite"').send(stream);
  });
  const staticRoot=options.staticRoot??resolve("dist/client");
  if(existsSync(staticRoot)){
    await app.register(staticFiles,{root:staticRoot,prefix:"/",maxAge:"1h",setHeaders:(response,path)=>{if(path.endsWith("index.html"))response.setHeader("Cache-Control","no-cache");}});
    app.setNotFoundHandler(async(request,reply)=>{if(request.url.startsWith("/api/")||request.method!=="GET"||/\.[a-z0-9]+(?:\?|$)/i.test(request.url))return reply.status(404).send({error:"not_found",message:"Diese Seite wurde nicht gefunden."});return reply.header("Cache-Control","no-cache").sendFile("index.html");});
  }
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof GameError)return reply.status(error.status).send({error:error.code,message:error.message});
    const problem=error as {validation?:unknown;statusCode?:number;message?:string};
    if(problem.validation)return reply.status(400).send({error:"invalid_request",message:"Bitte überprüfe deine Eingabe."});
    if(problem.statusCode===429)return reply.status(429).send({error:"rate_limited",message:"Einen Moment bitte. Versuche es gleich noch einmal."});
    request.log.error({message:problem.message??"Unexpected error"},"Request failed");
    return reply.status(500).send({error:"internal_error",message:"Das hat gerade nicht geklappt. Bitte versuche es erneut."});
  });
  app.addHook("onClose",async()=>store.close());
  return{app,store,accounts};
}
