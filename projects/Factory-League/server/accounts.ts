import {randomBytes,randomUUID,createHash,timingSafeEqual} from "node:crypto";
import argon2 from "argon2";
import type Database from "better-sqlite3";
import {GameError,GameStore} from "./store.js";

export type PublicUser={id:string;name:string;createdAt:number};
export type AccountRow={id:string;name:string;password_hash:string;recovery_hash:string;created_at:bigint};
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const normalizeCode=(code:string)=>code.replace(/[\s-]/g,"").toUpperCase();
function recovery(){const code="FL-"+randomBytes(20).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-");return{code,hash:digest(normalizeCode(code))};}
const hashOptions={type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1,hashLength:32} as const;
const invalidLogin=()=>new GameError("invalid_credentials","Spielername oder Passwort stimmen nicht.",401);
const invalidRecovery=()=>new GameError("invalid_recovery","Spielername und Rettungscode passen nicht zusammen.",400);
export class AccountStore{
  private activeHashes=0;
  readonly ready:Promise<string>;
  constructor(readonly db:Database.Database,readonly game:GameStore){
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,password_hash TEXT NOT NULL,recovery_hash TEXT NOT NULL,created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_account ON sessions(account_id);`);
    this.ready=argon2.hash(randomBytes(32),hashOptions);
  }
  private async boundedHash<T>(operation:()=>Promise<T>):Promise<T>{
    if(this.activeHashes>=2)throw new GameError("auth_busy","Die Anmeldung ist gerade gut besucht. Bitte versuche es gleich erneut.",429);
    this.activeHashes++;try{return await operation();}finally{this.activeHashes--;}
  }
  private public(account:AccountRow):PublicUser{return{id:account.id,name:account.name,createdAt:Number(account.created_at)};}
  private newSession(account:AccountRow,now:number){
    const token=randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
    this.db.prepare("INSERT INTO sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)").run(digest(token),account.id,now,now+30*86400000);
    return{token,user:this.public(account)};
  }
  session(token:string|undefined,now:number):PublicUser|null{
    if(!token||token.length>100)return null;
    const row=this.db.prepare("SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?").get(digest(token),now) as AccountRow|undefined;
    return row?this.public(row):null;
  }
  async register(name:string,password:string,now:number){
    if(!/^[A-Za-z0-9_]{3,20}$/.test(name))throw new GameError("invalid_name","Dein Name braucht 3–20 Buchstaben, Zahlen oder Unterstriche.");
    if(this.db.prepare("SELECT id FROM accounts WHERE name=? COLLATE NOCASE").get(name))throw new GameError("name_taken","Dieser Spielername ist schon vergeben.",409);
    const passwordHash=await this.boundedHash(()=>argon2.hash(password,hashOptions)),rescue=recovery();
    return this.db.transaction(()=>{
      if(this.db.prepare("SELECT id FROM accounts WHERE name=? COLLATE NOCASE").get(name))throw new GameError("name_taken","Dieser Spielername ist schon vergeben.",409);
      const id=randomUUID();this.db.prepare("INSERT INTO accounts(id,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?)").run(id,name,passwordHash,rescue.hash,now);
      const account=this.db.prepare("SELECT * FROM accounts WHERE id=?").get(id) as AccountRow;
      const state=this.game.create(id,name,now);
      return{...this.newSession(account,now),state,recoveryCode:rescue.code};
    })();
  }
  async login(name:string,password:string,now:number){
    const row=this.db.prepare("SELECT * FROM accounts WHERE name=? COLLATE NOCASE").get(name) as AccountRow|undefined;
    const encoded=row?.password_hash??await this.ready;
    const correct=await this.boundedHash(()=>argon2.verify(encoded,password));
    if(!row||!correct)throw invalidLogin();
    return this.db.transaction(()=>{
      const current=this.db.prepare("SELECT * FROM accounts WHERE id=?").get(row.id) as AccountRow;
      if(current.password_hash!==row.password_hash)throw invalidLogin();
      return{...this.newSession(current,now),state:this.game.sync(row.id,now)};
    })();
  }
  logout(token:string|undefined){if(token)this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));}
  async recover(name:string,code:string,password:string,now:number){
    const row=this.db.prepare("SELECT * FROM accounts WHERE name=? COLLATE NOCASE").get(name) as AccountRow|undefined;
    const candidate=digest(normalizeCode(code)),expected=row?.recovery_hash??"0".repeat(64);
    if(!timingSafeEqual(Buffer.from(candidate,"hex"),Buffer.from(expected,"hex"))||!row)throw invalidRecovery();
    const passwordHash=await this.boundedHash(()=>argon2.hash(password,hashOptions)),rescue=recovery();
    return this.db.transaction(()=>{
      const update=this.db.prepare("UPDATE accounts SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?").run(passwordHash,rescue.hash,row.id,row.recovery_hash);
      if(Number(update.changes)!==1)throw invalidRecovery();
      this.db.prepare("DELETE FROM sessions WHERE account_id=?").run(row.id);
      const account=this.db.prepare("SELECT * FROM accounts WHERE id=?").get(row.id) as AccountRow;
      return{...this.newSession(account,now),state:this.game.sync(account.id,now),recoveryCode:rescue.code};
    })();
  }
}
