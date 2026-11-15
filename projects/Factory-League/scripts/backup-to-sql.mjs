import {readFile,writeFile,readdir} from 'node:fs/promises';
const[source,destination]=process.argv.slice(2);if(!source||!destination)throw new Error('Usage: node scripts/backup-to-sql.mjs BACKUP.json NEW.sql');
const raw=await readFile(source);if(raw.length>64*1024*1024)throw new Error('Backup exceeds 64 MiB.');const backup=JSON.parse(raw.toString());
if(backup.format!=='factory-league-backup'||backup.version!==2)throw new Error('Unsupported backup.');
const columns={accounts:['id','name','name_key','password_hash','recovery_hash','created_at','auth_version'],players:['id','auth_uid','name','created_at','coins','lifetime_value','rate_micros','remainder','settled_at','last_active_at','levels_json','revision','last_mutation'],actions:['player_id','request_id','payload','response','created_at']};
const integers=new Set(['created_at','auth_version','settled_at','last_active_at','revision']);
const decimals=new Set(['coins','lifetime_value','rate_micros','remainder']);
const ids={accounts:new Set(),players:new Set(),actions:new Set()};
for(const[table,keys]of Object.entries(columns)){
 const rows=backup[table];if(!Array.isArray(rows)||rows.length>100000)throw new Error('Invalid backup table: '+table);
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==keys.length||keys.some(key=>!(key in row)))throw new Error('Invalid row schema: '+table);
  for(const key of keys){const value=row[key];if(integers.has(key)){if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid integer: '+key);}else if(typeof value!=='string'||value.length>65536)throw new Error('Invalid text: '+key);if(decimals.has(key)&&!/^\d{1,100}$/.test(value))throw new Error('Invalid credit value.');}
  const id=table==='actions'?row.player_id+':'+row.request_id:row.id;if(ids[table].has(id))throw new Error('Duplicate record.');ids[table].add(id);
  if(table==='accounts'&&(!/^[A-Za-z0-9_]{3,20}$/.test(row.name)||row.name_key!==row.name.toLowerCase()||!/^pbkdf2-sha256-peppered\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(row.password_hash)||!/^[a-f0-9]{64}$/.test(row.recovery_hash)||row.auth_version<1))throw new Error('Invalid account.');
  if(table==='players'){
   if(!ids.accounts.has(row.auth_uid)||row.revision<1)throw new Error('Invalid player reference.');
   const levels=JSON.parse(row.levels_json);if(!levels||Object.keys(levels).sort().join(',')!=='electronics,metal,robotics')throw new Error('Invalid factory.');
   for(const line of ['metal','electronics','robotics']){const values=levels[line];if(!Array.isArray(values)||values.length!==3||values.some(value=>!Number.isInteger(value)||value<0||value>100)||(line==='metal'&&values.some(value=>value===0))||(values.some(value=>value===0)&&values.some(value=>value>0)))throw new Error('Invalid levels.');}
  }
  if(table==='actions'){if(!ids.players.has(row.player_id)||row.request_id.length<16||row.request_id.length>80)throw new Error('Invalid action reference.');JSON.parse(row.payload);JSON.parse(row.response);}
 }
}
const names=new Set();for(const account of backup.accounts){if(names.has(account.name_key))throw new Error('Duplicate account name.');names.add(account.name_key);}
const playerOwners=new Set();for(const player of backup.players){if(playerOwners.has(player.auth_uid))throw new Error('Duplicate player.');playerOwners.add(player.auth_uid);}
if(playerOwners.size!==ids.accounts.size)throw new Error('An account is missing its factory.');
const statements=[];for(const filename of(await readdir(new URL('../drizzle/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())statements.push(...(await readFile(new URL('../drizzle/'+filename,import.meta.url),'utf8')).split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean));
const quote=value=>typeof value==='number'?String(value):"'"+value.replaceAll("'","''")+"'";
let output=statements.join('\n')+'\n';for(const[table,keys]of Object.entries(columns))for(const row of backup[table])output+=`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(key=>quote(row[key])).join(',')});\n`;
await writeFile(destination,output,{flag:'wx',mode:0o600});console.log('Validated restore SQL for a NEW empty D1 database:',destination);
