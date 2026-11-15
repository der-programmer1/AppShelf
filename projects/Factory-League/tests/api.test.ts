import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createApp} from "../server/app.js";
import {GameError} from "../server/store.js";

test("production refuses fabricated identities and provides local account authentication",async()=>{
  const {app}=await createApp({databasePath:":memory:"});
  try{
    const result=await app.inject({method:"POST",url:"/api/profile",payload:{name:"Hacker"},headers:{authorization:"Bearer invented"}});
    assert.equal(result.statusCode,401);
    assert.equal((await app.inject("/api/leaderboard")).json().total,0);
    assert.equal((await app.inject("/health")).json().authentication,"local");
  }finally{await app.close();}
});
test("two authenticated sessions share the real leaderboard; private state and arbitrary scores are protected",async()=>{
  let now=0;
  const {app}=await createApp({databasePath:":memory:",now:()=>now,authenticate:async request=>{
    const uid=request.headers.authorization?.replace("Bearer ","");
    if(!uid||!["alice","bob"].includes(uid))throw new GameError("authentication_required","Bitte anmelden.",401);
    return{uid};
  }});
  const send=(uid:string,url:string,payload:object={})=>app.inject({method:"POST",url,payload,headers:{authorization:`Bearer ${uid}`}});
  try{
    assert.equal((await send("alice","/api/profile",{name:"Alice"})).statusCode,200);
    now=1000;assert.equal((await send("bob","/api/profile",{name:"Bob"})).statusCode,200);
    assert.equal((await send("unverified","/api/profile",{name:"NotVerified"})).statusCode,401);
    now=11000;
    assert.equal((await send("alice","/api/actions",{type:"upgrade",lineId:"metal",station:1,requestId:randomUUID(),coins:"1000000000"})).statusCode,400);
    assert.equal((await send("bob","/api/actions",{type:"upgrade",lineId:"metal",station:1,requestId:randomUUID()})).statusCode,200);
    now=60000;
    const board=await app.inject({url:"/api/leaderboard",headers:{authorization:"Bearer bob"}});
    assert.equal(board.json().me.name,"Bob");assert.equal(board.json().me.rank,1);assert.equal(board.json().total,2);
    const publicProfile=(await app.inject(`/api/players/${board.json().me.id}`)).json();
    assert.equal(publicProfile.player.name,"Bob");assert.ok(!JSON.stringify(publicProfile).includes("auth_uid"));
    assert.equal((await send("alice","/api/sync",{uid:"bob",elapsed:864000000})).statusCode,400);
    assert.equal((await app.inject({method:"POST",url:"/api/sync",payload:{}})).statusCode,401);
    assert.equal((await app.inject("/api/leaderboard?page=-1")).statusCode,400);
  }finally{await app.close();}
});
test("database export requires its separate scoped secret and creates a valid SQLite backup",async()=>{
  const {app}=await createApp({databasePath:":memory:",backupToken:"a-long-test-only-backup-secret"});
  try{
    assert.equal((await app.inject("/api/admin/backup")).statusCode,403);
    const result=await app.inject({url:"/api/admin/backup",headers:{authorization:"Bearer a-long-test-only-backup-secret"}});
    assert.equal(result.statusCode,200);assert.equal(result.rawPayload.subarray(0,15).toString(),"SQLite format 3");
  }finally{await app.close();}
});
