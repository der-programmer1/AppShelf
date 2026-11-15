import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {accrued,OFFLINE_CAP_MS,ACCRUAL_SCALE,LINES,capacityMicros,upgradeCost,bottleneck,formatCredits,initialLevels} from "../shared/game.js";
import {GameStore,GameError} from "../server/store.js";

test("production accrues exactly, including fractional seconds",()=>{
  const clock={settledAt:0,lastActiveAt:0,rate:1250000n,remainder:0n};
  const whole=accrued(clock,4320123);
  const a=accrued(clock,1337),b=accrued({...clock,settledAt:1337,remainder:a.remainder},4320123);
  assert.equal(a.earned+b.earned,whole.earned);assert.equal(b.remainder,whole.remainder);assert.ok(whole.remainder<ACCRUAL_SCALE);
});
test("offline production stops at 24 hours and backward clocks add nothing",()=>{
  const clock={settledAt:0,lastActiveAt:0,rate:1000000n,remainder:0n};
  assert.equal(accrued(clock,OFFLINE_CAP_MS*3).earned,86400n);assert.equal(accrued(clock,OFFLINE_CAP_MS*3).capped,true);
  assert.equal(accrued({...clock,settledAt:5000},3000).earned,0n);
});
test("the bottleneck determines throughput and prices increase exactly",()=>{
  assert.equal(bottleneck(LINES[0],[1,1,1]),1);
  assert.equal(upgradeCost(LINES[0],1,1),8n);assert.equal(upgradeCost(LINES[0],1,2),10n);
  assert.equal(capacityMicros(LINES[0],1,2),1150000n);
  assert.throws(()=>upgradeCost(LINES[0],1,100));
});
test("new accounts are independent, names unique, recreating an account never resets it",()=>{
  const store=new GameStore(":memory:");
  try{
    const a=store.create("a","Patrice",1000);store.create("b","FactoryFan",1000);
    assert.equal(a.coins,"0");assert.equal(store.sync("a",11000).coins,"10");
    assert.equal(store.create("a","OtherName",11000).coins,"10");
    assert.equal(store.snapshot("b",11000).coins,"10");
    assert.throws(()=>store.create("c","patrice",11000),(e:unknown)=>e instanceof GameError&&e.code==="name_taken");
  }finally{store.close();}
});
test("spending leaves lifetime rank points intact; successful actions are idempotent",()=>{
  const store=new GameStore(":memory:");
  try{
    store.create("a","Builder",0);
    const action={type:"upgrade" as const,lineId:"metal" as const,station:1 as const,requestId:randomUUID()};
    const state=store.act("a",action,10000);
    assert.equal(state.coins,"2");assert.equal(state.lifetimeValue,"10");assert.equal(state.lines[0].levels[1],2);
    assert.deepEqual(store.act("a",action,11000),state);
    assert.throws(()=>store.act("a",{...action,station:0},11000),(e:unknown)=>e instanceof GameError&&e.code==="request_conflict");
  }finally{store.close();}
});
test("failed purchases roll back and cannot overspend through multiple tabs",()=>{
  const store=new GameStore(":memory:");
  try{
    store.create("a","Builder",0);
    assert.throws(()=>store.act("a",{type:"upgrade",lineId:"metal",station:1,requestId:randomUUID()},7000));
    assert.equal(store.snapshot("a",8000).coins,"8");
    store.act("a",{type:"upgrade",lineId:"metal",station:1,requestId:randomUUID()},8000);
    assert.throws(()=>store.act("a",{type:"upgrade",lineId:"metal",station:1,requestId:randomUUID()},8000));
    assert.equal(store.snapshot("a",8000).coins,"0");
  }finally{store.close();}
});
test("rankings include unattended production and update automatically",()=>{
  const store=new GameStore(":memory:");
  try{
    store.create("a","FirstPlayer",0);store.create("b","SecondPlayer",1000);
    assert.equal(store.leaderboard(10000,1,"b").me?.rank,2);
    store.act("b",{type:"upgrade",lineId:"metal",station:1,requestId:randomUUID()},10000);
    assert.equal(store.leaderboard(30000,1,"b").me?.rank,1);
    assert.equal(store.leaderboard(30000).players[0].name,"SecondPlayer");
  }finally{store.close();}
});
test("return after several days credits only one capped interval and resumes production",()=>{
  const store=new GameStore(":memory:");
  try{
    store.create("a","Builder",0);
    const state=store.sync("a",3*OFFLINE_CAP_MS);
    assert.equal(state.coins,"86400");assert.equal(state.offlineEarned,"86400");assert.equal(state.offlineCapped,true);
    assert.equal(store.sync("a",3*OFFLINE_CAP_MS).offlineEarned,"0");
    assert.equal(store.sync("a",3*OFFLINE_CAP_MS+1000).coins,"86401");
  }finally{store.close();}
});
test("unlocking requires the lifetime milestone and its cost, then creates all three machines",()=>{
  const store=new GameStore(":memory:");
  try{
    store.create("a","Builder",0);
    assert.throws(()=>store.act("a",{type:"unlockLine",lineId:"electronics",requestId:randomUUID()},1000));
    const state=store.act("a",{type:"unlockLine",lineId:"electronics",requestId:randomUUID()},5000000);
    assert.equal(state.coins,"4000");assert.equal(state.lifetimeValue,"5000");assert.deepEqual(state.lines[1].levels,[1,1,1]);assert.equal(state.rateMicros,"11000000");
  }finally{store.close();}
});
test("SQLite restart and native backup preserve progress",async()=>{
  const folder=mkdtempSync(join(tmpdir(),"factory-test-")),path=join(folder,"game.sqlite"),backup=join(folder,"backup.sqlite");
  try{
    let store=new GameStore(path);store.create("a","Builder",0);store.sync("a",12000);await store.db.backup(backup);store.close();
    store=new GameStore(path);assert.equal(store.snapshot("a",12000).coins,"12");store.close();
    store=new GameStore(backup);assert.equal(store.snapshot("a",12000).coins,"12");store.close();
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test("integer credits keep precision beyond JavaScript's safe number range",()=>{
  const store=new GameStore(":memory:");
  try{
    store.create("a","Builder",0);
    const exact=9007199254740993n;store.db.prepare("UPDATE players SET coins=?,lifetime_value=? WHERE auth_uid=?").run(exact,exact,"a");
    assert.equal(store.snapshot("a",0).coins,String(exact));assert.equal(formatCredits(exact,false),"9.007.199.254.740.993");
  }finally{store.close();}
});
