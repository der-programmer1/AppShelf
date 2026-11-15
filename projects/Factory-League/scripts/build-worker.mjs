import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir,cp,rm} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),client=path.join(root,'dist/client');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const assets={};
for(const file of await readdir(client,{recursive:true,withFileTypes:true})){if(!file.isFile())continue;const absolute=path.join(file.parentPath,file.name),relative=path.relative(client,absolute).split(path.sep).join('/');assets['/'+relative]={body:(await readFile(absolute)).toString('base64'),type:types[path.extname(file.name)]??'application/octet-stream'};}
await mkdir('.runtime',{recursive:true});await writeFile('.runtime/assets.json',JSON.stringify(assets));
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['worker/index.ts'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'neutral',target:'es2022',minify:true,external:['node:*'],plugins:[{name:'embedded-static-assets',setup(b){b.onResolve({filter:/^virtual:static-assets$/},()=>({path:'assets',namespace:'embedded'}));b.onLoad({filter:/.*/,namespace:'embedded'},()=>({contents:JSON.stringify(assets),loader:'json'}));}}]});
await rm('dist/.openai',{recursive:true,force:true});await mkdir('dist/.openai',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'factory-league',main:'index.js',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],no_bundle:true,d1_databases:[{binding:'DB',database_name:'factory-league',database_id:'00000000-0000-4000-8000-000000000000'}]}));
console.log(`Worker built with ${Object.keys(assets).length} embedded assets and D1 migrations.`);
