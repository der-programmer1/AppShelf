import Database from "better-sqlite3";
import{existsSync,mkdirSync}from"node:fs";
import{dirname,resolve}from"node:path";
const source=process.argv[2],destination=process.argv[3];
if(!source||!destination)throw new Error("Usage: npm run restore -- backup.sqlite NEW-database.sqlite");
const target=resolve(destination);
if(!existsSync(source))throw new Error("Backup file not found.");
if(existsSync(target))throw new Error("The destination must be a new file. Live databases are never overwritten.");
mkdirSync(dirname(target),{recursive:true});
const input=new Database(resolve(source),{readonly:true});
try{if(input.pragma("integrity_check",{simple:true})!=="ok")throw new Error("The backup failed the SQLite integrity check.");input.prepare("SELECT id FROM accounts LIMIT 1").get();await input.backup(target);}finally{input.close();}
const restored=new Database(target);
try{restored.exec("DELETE FROM sessions;");if(restored.pragma("integrity_check",{simple:true})!=="ok")throw new Error("Restored database integrity check failed.");}finally{restored.close();}
console.log(`Restored safely to ${target}. Sessions were invalidated. Set DATABASE_PATH to this new file and restart the service.`);
