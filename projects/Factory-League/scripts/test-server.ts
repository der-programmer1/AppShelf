import {createServer} from 'node:http';
import {testRuntime} from './test-runtime';
if(process.env.NODE_ENV!=='test')throw new Error('E2E server requires NODE_ENV=test.');
const runtime=await testRuntime({secure:false});
const server=createServer(async(request,response)=>{
  try{
    const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
    const body=Buffer.concat(chunks),headers=new Headers();for(const[key,value]of Object.entries(request.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
    const result=await runtime.mf.dispatchFetch('http://127.0.0.1:4173'+request.url,{method:request.method,headers:Object.fromEntries(headers),body:body.length?body:undefined});
    response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
  }catch{response.writeHead(500).end();}
});
server.listen(4173,'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT']as const)process.once(signal,()=>{server.close(()=>void runtime.close().then(()=>process.exit(0)));});
