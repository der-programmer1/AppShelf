import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testRuntime} from '../scripts/test-runtime';
const password='factory-test-password-123';
const upgrade=(requestId=randomUUID(),station=1)=>({type:'upgrade',lineId:'metal',station,requestId});
test('D1 accounts store only password/recovery/session hashes and use secure cookies',async()=>{
  const r=await testRuntime();try{
    const registered=await r.call('/api/auth/register',{name:'Patrice',password});assert.equal(registered.status,200);assert.match(registered.body.recoveryCode,/^FL-/);assert.equal(registered.body.token,undefined);
    const cookie=registered.response.headers.get('set-cookie')!;assert.match(cookie,/__Host-fl_session=/);for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(cookie.includes(flag));
    const account=await r.db.prepare('SELECT * FROM accounts').first<any>();assert.match(account.password_hash,/^pbkdf2-sha256-peppered\$100000\$/);assert.ok(!JSON.stringify(account).includes(password));assert.ok(!JSON.stringify(account).includes(registered.body.recoveryCode));
    const session=await r.db.prepare('SELECT token_hash FROM sessions').first<any>();assert.notEqual(session.token_hash,registered.cookie?.split('=')[1]);
    assert.equal((await r.call('/api/auth/login',{name:'pAtRiCe',password})).status,200);assert.equal((await r.call('/api/auth/register',{name:'patrice',password})).status,409);
    assert.equal((await r.call('/api/auth/login',{name:'Patrice',password:'wrong'})).status,401);
    await r.call('/api/auth/logout',{},registered.cookie);assert.equal((await r.call('/api/auth/session',undefined,registered.cookie)).body.user,null);
  }finally{await r.close();}
});
test('separate accounts share a server-ranked leaderboard and expose no private account fields',async()=>{
  const r=await testRuntime();try{
    await r.time(1000);const a=await r.call('/api/auth/register',{name:'Alpha',password});await r.time(2000);const b=await r.call('/api/auth/register',{name:'Beta',password});
    await r.time(12000);assert.equal((await r.call('/api/sync',{},a.cookie)).body.coins,'11');assert.equal((await r.call('/api/sync',{},b.cookie)).body.coins,'10');
    await r.call('/api/actions',upgrade(),b.cookie);await r.time(32000);
    const board=(await r.call('/api/leaderboard',undefined,b.cookie)).body;assert.equal(board.players[0].name,'Beta');assert.equal(board.me.rank,1);assert.equal(board.total,2);
    const profile=await r.call('/api/players/'+b.body.state.player.id);assert.equal(profile.status,200);assert.equal(profile.body.player.name,'Beta');
    for(const value of [password,a.body.recoveryCode,b.body.user.id,'password_hash','recovery_hash','token_hash','coins'])assert.ok(!JSON.stringify(profile.body).includes(value));
  }finally{await r.close();}
});
test('simultaneous retries charge once; a reused request ID cannot change the purchase',async()=>{
  const r=await testRuntime();try{
    await r.time(1000);const a=await r.call('/api/auth/register',{name:'Builder',password});await r.time(11000);const action=upgrade();
    const results=await Promise.all(Array.from({length:10},()=>r.call('/api/actions',action,a.cookie)));
    for(const result of results){assert.equal(result.status,200);assert.equal(result.body.coins,'2');assert.equal(result.body.lifetimeValue,'10');assert.equal(result.body.lines[0].levels[1],2);}
    assert.equal((await r.db.prepare('SELECT count(*) AS n FROM actions').first<any>()).n,1);
    assert.equal((await r.call('/api/actions',{...action,station:0},a.cookie)).status,409);
    const state=(await r.call('/api/sync',{},a.cookie)).body;assert.equal(state.coins,'2');assert.equal(state.lines[0].levels[1],2);
  }finally{await r.close();}
});
test('concurrent purchases cannot overspend and failures leave the accrual cursor intact',async()=>{
  const r=await testRuntime();try{
    await r.time(1000);const a=await r.call('/api/auth/register',{name:'Builder',password});await r.time(8000);
    assert.equal((await r.call('/api/actions',upgrade(),a.cookie)).status,400);assert.equal((await r.db.prepare('SELECT settled_at FROM players').first<any>()).settled_at,1000);
    await r.time(9000);const results=await Promise.all([r.call('/api/actions',upgrade(),a.cookie),r.call('/api/actions',upgrade(),a.cookie)]);assert.deepEqual(results.map(result=>result.status).sort(),[200,400]);
    const state=(await r.call('/api/sync',{},a.cookie)).body;assert.equal(state.coins,'0');assert.equal(state.lifetimeValue,'8');assert.equal(state.lines[0].levels[1],2);
  }finally{await r.close();}
});
test('offline production caps at 24 hours once, resumes, and unlocks complete production lines',async()=>{
  const r=await testRuntime();try{
    await r.time(1000);const a=await r.call('/api/auth/register',{name:'Builder',password});
    assert.equal((await r.call('/api/actions',{type:'unlockLine',lineId:'electronics',requestId:randomUUID()},a.cookie)).status,400);
    await r.time(1000+3*86400000);const capped=(await r.call('/api/sync',{},a.cookie)).body;assert.equal(capped.coins,'86400');assert.equal(capped.offlineEarned,'86400');assert.equal(capped.offlineCapped,true);
    assert.equal((await r.call('/api/sync',{},a.cookie)).body.offlineEarned,'0');await r.time(2000+3*86400000);assert.equal((await r.call('/api/sync',{},a.cookie)).body.coins,'86401');
    const unlocked=(await r.call('/api/actions',{type:'unlockLine',lineId:'electronics',requestId:randomUUID()},a.cookie)).body;assert.deepEqual(unlocked.lines[1].levels,[1,1,1]);assert.equal(unlocked.rateMicros,'11000000');assert.equal(unlocked.lifetimeValue,'86401');assert.equal(unlocked.coins,'85401');
  }finally{await r.close();}
});
test('recovery rotates the code, revokes all old sessions and preserves the upgraded factory',async()=>{
  const r=await testRuntime();try{
    await r.time(1000);const a=await r.call('/api/auth/register',{name:'Builder',password}),second=await r.call('/api/auth/login',{name:'Builder',password});await r.time(11000);await r.call('/api/actions',upgrade(),a.cookie);
    const recovered=await r.call('/api/auth/recover',{name:'Builder',password:'a-new-factory-password',recoveryCode:a.body.recoveryCode});assert.equal(recovered.status,200);assert.notEqual(recovered.body.recoveryCode,a.body.recoveryCode);assert.equal(recovered.body.state.lines[0].levels[1],2);
    for(const cookie of [a.cookie,second.cookie])assert.equal((await r.call('/api/auth/session',undefined,cookie)).body.user,null);
    assert.equal((await r.call('/api/auth/login',{name:'Builder',password})).status,401);assert.equal((await r.call('/api/auth/login',{name:'Builder',password:'a-new-factory-password'})).status,200);
    assert.equal((await r.call('/api/auth/recover',{name:'Builder',password,recoveryCode:a.body.recoveryCode})).status,400);
  }finally{await r.close();}
});
test('only one simultaneous recovery can consume a recovery code',async()=>{
  const r=await testRuntime();try{
    const a=await r.call('/api/auth/register',{name:'Builder',password});const result=await Promise.all([r.call('/api/auth/recover',{name:'Builder',password:'another-password-1',recoveryCode:a.body.recoveryCode}),r.call('/api/auth/recover',{name:'Builder',password:'another-password-2',recoveryCode:a.body.recoveryCode})]);assert.deepEqual(result.map(value=>value.status).sort(),[200,400]);
    const winner=result.find(value=>value.status===200)!;assert.equal((await r.call('/api/auth/session',undefined,winner.cookie)).body.user.name,'Builder');
  }finally{await r.close();}
});
test('forged sessions, extra fields, weak passwords and cross-site writes are rejected',async()=>{
  const r=await testRuntime();try{
    assert.equal((await r.call('/api/sync',{},'__Host-fl_session=forged')).status,401);
    assert.equal((await r.call('/api/auth/register',{name:'Builder',password:'short'})).status,400);
    assert.equal((await r.call('/api/auth/register',{name:'Builder',password,coins:'9999'})).status,400);
    assert.equal((await r.call('/api/auth/register',{name:'Builder',password},undefined,{Origin:'https://evil.test'})).status,403);
    assert.equal((await r.call('/api/auth/register',{name:'Builder',password},undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await r.call('/api/players/missing')).status,404);assert.equal((await r.call('/api/leaderboard?page=-1')).status,400);
  }finally{await r.close();}
});
test('login throttling persists in D1 and backup exports require the admin secret',async()=>{
  const r=await testRuntime();try{
    await r.call('/api/auth/register',{name:'Builder',password});for(let i=0;i<10;i++)assert.equal((await r.call('/api/auth/login',{name:'Nobody',password})).status,401);
    assert.equal((await r.call('/api/auth/login',{name:'Nobody',password})).status,429);
    assert.equal((await r.call('/api/admin/backup')).status,403);const exported=await r.call('/api/admin/backup',undefined,undefined,{Authorization:'Bearer test-only-backup-token'});assert.equal(exported.status,200);assert.equal(exported.body.format,'factory-league-backup');assert.equal(exported.body.version,2);assert.equal(exported.body.accounts.length,1);assert.equal(exported.body.players.length,1);assert.equal(exported.body.sessions,undefined);
  }finally{await r.close();}
});
test('exact decimal credit strings survive D1 and a complete Worker restart',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'factory-d1-'));let r=await testRuntime({persist:folder});
  try{
    await r.time(1000);const a=await r.call('/api/auth/register',{name:'Builder',password});const exact='9007199254740993';await r.db.prepare('UPDATE players SET coins=?,lifetime_value=?').bind(exact,exact).run();assert.equal((await r.call('/api/sync',{},a.cookie)).body.coins,exact);
    await r.close();r=await testRuntime({persist:folder,migrate:false});await r.time(1000);const logged=await r.call('/api/auth/login',{name:'Builder',password});assert.equal(logged.status,200);assert.equal(logged.body.state.coins,exact);assert.equal(logged.body.state.lifetimeValue,exact);
  }finally{await r.close();await rm(folder,{recursive:true,force:true});}
});
