/** Local E2E fixture only. This file is never compiled into the production server. */
import {createApp} from "../server/app.js";
if(process.env.NODE_ENV!=="test")throw new Error("The E2E fixture requires NODE_ENV=test.");
let offset=0;
const{app,store}=await createApp({databasePath:":memory:",now:()=>Date.now()+offset,origin:"http://127.0.0.1:4173",secureCookies:false});
app.post<{Body:{milliseconds:number}}>("/__test/time",async request=>{offset+=request.body.milliseconds;return{ok:true};});
app.post("/__test/reset",async()=>{store.db.exec("DELETE FROM actions; DELETE FROM players; DELETE FROM sessions; DELETE FROM accounts;");offset=0;return{ok:true};});
await app.listen({host:"127.0.0.1",port:4173});
for(const signal of ["SIGTERM","SIGINT"]as const)process.once(signal,()=>void app.close().then(()=>process.exit(0)));
