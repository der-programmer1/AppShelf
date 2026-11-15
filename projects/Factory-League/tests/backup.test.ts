import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {testRuntime} from '../scripts/test-runtime';
const run=promisify(execFile);
test('backup restore validates data, preserves purchases and starts without old sessions',async()=>{
 const r=await testRuntime(),restored=await testRuntime({migrate:false}),folder=await mkdtemp(join(tmpdir(),'factory-restore-'));
 try{
  await r.time(1000);const account=await r.call('/api/auth/register',{name:'Builder',password:'a-factory-test-password'});await r.time(11000);await r.call('/api/actions',{type:'upgrade',lineId:'metal',station:1,requestId:randomUUID()},account.cookie);
  const backup=await r.call('/api/admin/backup',undefined,undefined,{Authorization:'Bearer test-only-backup-token'}),json=join(folder,'backup.json'),sql=join(folder,'restored.sql');await writeFile(json,JSON.stringify(backup.body));
  await run(process.execPath,['scripts/backup-to-sql.mjs',json,sql]);
  const source=await readFile(sql,'utf8');assert.ok(!source.includes('DELETE FROM'));
  for(const statement of source.split(';').map(value=>value.trim()).filter(Boolean))await restored.db.prepare(statement).run();
  assert.equal((await restored.db.prepare('SELECT count(*) AS n FROM sessions').first<any>()).n,0);
  await restored.time(11000);const logged=await restored.call('/api/auth/login',{name:'Builder',password:'a-factory-test-password'});assert.equal(logged.status,200);assert.equal(logged.body.state.coins,'2');assert.equal(logged.body.state.lines[0].levels[1],2);
  await assert.rejects(()=>run(process.execPath,['scripts/backup-to-sql.mjs',json,sql]));
  const malformed=join(folder,'invalid.json');await writeFile(malformed,JSON.stringify({...backup.body,accounts:[{...backup.body.accounts[0],name:'bad; DROP TABLE players'}]}));await assert.rejects(()=>run(process.execPath,['scripts/backup-to-sql.mjs',malformed,join(folder,'bad.sql')]));
 }finally{await r.close();await restored.close();await rm(folder,{recursive:true,force:true});}
});
