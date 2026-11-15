import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {readFile,readdir} from 'node:fs/promises';
let bundled:string|undefined;
export async function testRuntime(options:{persist?:string;migrate?:boolean;secure?:boolean}={}){
  if(!bundled){
    const assets=await readFile('.runtime/assets.json','utf8').catch(()=>'{}');
    const result=await build({entryPoints:['scripts/test-worker.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',write:false,external:['node:*'],plugins:[{name:'test-assets',setup(b){b.onResolve({filter:/^virtual:static-assets$/},()=>({path:'assets',namespace:'embedded'}));b.onLoad({filter:/.*/,namespace:'embedded'},()=>({contents:assets,loader:'json'}));}}]});bundled=result.outputFiles[0].text;
  }
  const mf=new Miniflare({modules:true,script:bundled,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'factory-league-tests'},d1Persist:options.persist??false,bindings:{BACKUP_TOKEN:'test-only-backup-token',PASSWORD_PEPPER:'test-only-password-pepper-with-more-than-32-characters',TEST_SECURE:options.secure??true}});
  const db=await mf.getD1Database('DB');
  if(options.migrate!==false){
    const files=(await readdir('drizzle')).filter(file=>file.endsWith('.sql')).sort();
    for(const file of files){const sql=await readFile('drizzle/'+file,'utf8');for(const statement of sql.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();}
  }
  async function call(path:string,body?:unknown,cookie?:string,headers:Record<string,string>={}){
    const response=await mf.dispatchFetch('https://factory.test'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return{response,status:response.status,body:await response.json() as any,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  return{mf,db,call,close:()=>mf.dispose(),time:async(absolute:number)=>{await call('/__test/time',{absolute});}};
}
