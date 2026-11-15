// Test-only entrypoint. Never included in the production Worker build.
import assets from 'virtual:static-assets';
import {createWorker,type Env} from '../worker/app';
let offset=0,fixed=0;
const clock=()=>fixed||Date.now()+offset;
const secure=createWorker({now:clock,assets}),local=createWorker({now:clock,assets,secureCookies:false});
export default{async fetch(request:Request,env:Env&{TEST_SECURE?:boolean},ctx:ExecutionContext){
  const url=new URL(request.url);
  if(url.pathname==='/__test/time'&&request.method==='POST'){const body=await request.json() as {milliseconds?:number;absolute?:number};if(body.absolute!==undefined)fixed=body.absolute;else offset+=body.milliseconds??0;return Response.json({ok:true});}
  if(url.pathname==='/__test/reset'&&request.method==='POST'){
    await env.DB.batch(['actions','sessions','players','accounts','limits'].map(table=>env.DB.prepare('DELETE FROM '+table)));offset=0;fixed=0;return Response.json({ok:true});
  }
  return(env.TEST_SECURE?secure:local).fetch(request,env,ctx);
}};
