import { createApp } from "./app.js";
const {app}=await createApp({databasePath:process.env.DATABASE_PATH??"data/factory-league.sqlite",backupToken:process.env.BACKUP_TOKEN,origin:process.env.APP_ORIGIN??process.env.RENDER_EXTERNAL_URL,logger:true});
await app.listen({port:Number(process.env.PORT??3001),host:"0.0.0.0"});
for(const signal of ["SIGINT","SIGTERM"]as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
