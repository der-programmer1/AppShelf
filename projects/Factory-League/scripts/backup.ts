import Database from "better-sqlite3";
import {existsSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
const source=resolve(process.argv[2]??process.env.DATABASE_PATH??"data/factory-league.sqlite"),target=resolve(process.argv[3]??`.runtime/backups/factory-${Date.now()}.sqlite`);
if(!existsSync(source))throw new Error("Source database does not exist.");
if(existsSync(target))throw new Error("The backup destination already exists; choose a new file.");
mkdirSync(dirname(target),{recursive:true});
const db=new Database(source,{readonly:true});
try{await db.backup(target);console.log(`Consistent SQLite backup: ${target}`);}finally{db.close();}
