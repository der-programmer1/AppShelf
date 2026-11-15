import test from "node:test";
import assert from "node:assert/strict";
import {accrued,OFFLINE_CAP_MS,ACCRUAL_SCALE,LINES,capacityMicros,upgradeCost,bottleneck,formatCredits,initialLevels} from "../shared/game.js";

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
test("large credit formatting never rounds through Number",()=>{assert.equal(formatCredits(9007199254740993n,false),"9.007.199.254.740.993");});
