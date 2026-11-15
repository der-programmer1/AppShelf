import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/app.js";

test("real username/password registration creates an independent factory and an HttpOnly session",async()=>{
  let now=100000;
  const {app,store}=await createApp({databasePath:":memory:",now:()=>now});
  const post=(url:string,payload:object,cookie?:string)=>app.inject({method:"POST",url,payload,headers:cookie?{cookie}:{}});
  try{
    const result=await post("/api/auth/register",{name:"Patrice",password:"a-long-test-password"});
    assert.equal(result.statusCode,200);const body=result.json();
    assert.equal(body.user.name,"Patrice");assert.ok(body.recoveryCode.startsWith("FL-"));assert.equal(body.state.coins,"0");assert.ok(!("token"in body));
    const header=String(result.headers["set-cookie"]);assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Lax/);assert.match(header,/Path=\//);
    const cookie=header.split(";")[0];
    assert.equal((await app.inject({url:"/api/auth/session",headers:{cookie}})).json().user.name,"Patrice");
    now+=10000;assert.equal((await post("/api/sync",{},cookie)).json().coins,"10");
    const account=store.db.prepare("SELECT * FROM accounts WHERE name=?").get("Patrice") as Record<string,unknown>;
    assert.match(String(account.password_hash),/^\$argon2id\$/);assert.notEqual(account.password_hash,"a-long-test-password");assert.ok(!JSON.stringify(account,(_key,value)=>typeof value==="bigint"?String(value):value).includes(body.recoveryCode));
    assert.equal((await post("/api/auth/register",{name:"patrice",password:"different-password"})).statusCode,409);
    assert.equal((await post("/api/auth/login",{name:"PATRICE",password:"wrong-password"})).statusCode,401);
    const login=await post("/api/auth/login",{name:"PATRICE",password:"a-long-test-password"});assert.equal(login.statusCode,200);assert.equal(login.json().state.coins,"10");assert.ok(!("recoveryCode"in login.json()));
    await post("/api/auth/logout",{},cookie);assert.equal((await post("/api/sync",{},cookie)).statusCode,401);
  }finally{await app.close();}
});

test("recovery rotates the one-time code and revokes all old sessions without resetting the factory",async()=>{
  let now=0;
  const {app}=await createApp({databasePath:":memory:",now:()=>now});
  const post=(url:string,payload:object,cookie?:string)=>app.inject({method:"POST",url,payload,headers:cookie?{cookie}:{}});
  try{
    const registered=await post("/api/auth/register",{name:"Builder",password:"the-first-password"}),code=registered.json().recoveryCode;
    const cookieA=String(registered.headers["set-cookie"]).split(";")[0];
    const login=await post("/api/auth/login",{name:"Builder",password:"the-first-password"}),cookieB=String(login.headers["set-cookie"]).split(";")[0];
    now=12000;
    assert.equal((await post("/api/auth/recover",{name:"Builder",password:"new-safe-password",recoveryCode:"FL-not-the-correct-code"})).statusCode,400);
    const recovered=await post("/api/auth/recover",{name:"Builder",password:"new-safe-password",recoveryCode:code});
    assert.equal(recovered.statusCode,200);assert.equal(recovered.json().state.coins,"12");assert.notEqual(recovered.json().recoveryCode,code);
    assert.equal((await post("/api/sync",{},cookieA)).statusCode,401);assert.equal((await post("/api/sync",{},cookieB)).statusCode,401);
    assert.equal((await post("/api/auth/recover",{name:"Builder",password:"another-password",recoveryCode:code})).statusCode,400);
    assert.equal((await post("/api/auth/login",{name:"Builder",password:"the-first-password"})).statusCode,401);
    assert.equal((await post("/api/auth/login",{name:"Builder",password:"new-safe-password"})).statusCode,200);
  }finally{await app.close();}
});

test("hostile origins, weak passwords and invented cookies cannot create or access an account",async()=>{
  const {app}=await createApp({databasePath:":memory:",secureCookies:true,origin:"https://factory.example"});
  try{
    const hostile=await app.inject({method:"POST",url:"/api/auth/register",headers:{origin:"https://evil.example"},payload:{name:"Builder",password:"a-long-test-password"}});assert.equal(hostile.statusCode,403);
    const weak=await app.inject({method:"POST",url:"/api/auth/register",payload:{name:"Builder",password:"short"}});assert.equal(weak.statusCode,400);
    const result=await app.inject({method:"POST",url:"/api/auth/register",payload:{name:"Builder",password:"a-long-test-password"}});
    assert.match(String(result.headers["set-cookie"]),/^__Host-fl_session=/);assert.match(String(result.headers["set-cookie"]),/Secure/);
    assert.equal((await app.inject({method:"POST",url:"/api/sync",payload:{},headers:{cookie:"__Host-fl_session=made-up"}})).statusCode,401);
  }finally{await app.close();}
});
