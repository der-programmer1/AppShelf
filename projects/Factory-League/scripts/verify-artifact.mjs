import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
const script=await readFile('dist/server/index.js','utf8');assert.ok(!script.includes('/__test/'));
const config=JSON.parse(await readFile('dist/.openai/hosting.json','utf8'));assert.equal(config.d1,'DB');assert.equal(config.static,undefined);
const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'production-artifact-check'}});
try{
 const db=await mf.getD1Database('DB');for(const file of(await readdir('drizzle')).filter(file=>file.endsWith('.sql')).sort())for(const statement of(await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
 const health=await mf.dispatchFetch('https://factory.test/health');assert.equal(health.status,200);assert.equal((await health.json()).storage,'D1');
 const assets=JSON.parse(await readFile('.runtime/assets.json','utf8'));for(const[path,asset]of Object.entries(assets)){
  const response=await mf.dispatchFetch('https://factory.test'+path);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),asset.type);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(asset.body,'base64'));
 }
 const signup=await mf.dispatchFetch('https://factory.test/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'ArtifactCheck',password:'a-temporary-test-password'})});assert.equal(signup.status,200);assert.match(signup.headers.get('set-cookie'),/__Host-fl_session=.*Secure/);
 assert.equal((await mf.dispatchFetch('https://factory.test/__test/time',{method:'POST'})).status,404);
 console.log('Compiled production Worker verified: D1, signup, secure cookie, all embedded asset bytes and no test controls.');
}finally{await mf.dispose();}
