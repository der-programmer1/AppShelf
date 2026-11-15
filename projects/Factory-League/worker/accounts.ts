import {pbkdf2,randomBytes,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {GameError,GameStore,newPlayer,insertPlayer} from './game-store';
type AccountRow={id:string;name:string;name_key:string;password_hash:string;recovery_hash:string;created_at:number;auth_version:number};
export type PublicUser={id:string;name:string;createdAt:number};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const normalizeCode=(code:string)=>code.replace(/[\s-]/g,'').toUpperCase();
function recovery(){const code='FL-'+randomBytes(20).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-');return{code,hash:digest(normalizeCode(code))};}
export const PASSWORD_ITERATIONS=100000;
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>pbkdf2(password,Buffer.from(salt,'hex'),PASSWORD_ITERATIONS,32,'sha256',(error,key)=>error?reject(error):resolve(key)));
async function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return`pbkdf2-sha256-peppered$100000$${salt}$${(await derive(password,salt)).toString('hex')}`;}
async function verify(password:string,encoded:string){const parts=encoded.split('$');if(parts.length!==4||parts[0]!=='pbkdf2-sha256-peppered'||parts[1]!=='100000'||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;const value=await derive(password,parts[2]);return timingSafeEqual(value,Buffer.from(parts[3],'hex'));}
const publicUser=(row:AccountRow):PublicUser=>({id:row.id,name:row.name,createdAt:row.created_at});
const invalidLogin=()=>new GameError('invalid_credentials','Spielername oder Passwort stimmen nicht.',401);
const invalidRecovery=()=>new GameError('invalid_recovery','Spielername und Rettungscode passen nicht zusammen.',400);
const nameKey=(name:string)=>name.toLowerCase();
export class AccountStore{
  constructor(readonly db:D1Database,readonly game:GameStore,private readonly pepper:string){if(!pepper||pepper.length<32)throw new Error("Password protection is not configured.");}
  private protectedPassword(password:string){return createHmac("sha256",this.pepper).update(password,"utf8").digest("hex");}
  async session(token:string|undefined,now:number):Promise<PublicUser|null>{
    if(!token||token.length>100)return null;
    const row=await this.db.prepare('SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id AND a.auth_version=s.auth_version WHERE s.token_hash=? AND s.expires_at>?').bind(digest(token),now).first<AccountRow>();return row?publicUser(row):null;
  }
  private sessionStatement(row:AccountRow,token:string,now:number){return this.db.prepare('INSERT INTO sessions(token_hash,account_id,auth_version,created_at,expires_at) SELECT ?,id,auth_version,?,? FROM accounts WHERE id=? AND auth_version=? AND password_hash=?').bind(digest(token),now,now+30*86400000,row.id,row.auth_version,row.password_hash);}
  async register(name:string,password:string,now:number){
    if(await this.db.prepare('SELECT id FROM accounts WHERE name_key=?').bind(nameKey(name)).first())throw new GameError('name_taken','Dieser Spielername ist schon vergeben.',409);
    const encoded=await passwordHash(this.protectedPassword(password)),rescue=recovery(),token=randomBytes(32).toString('base64url');
    const row:AccountRow={id:crypto.randomUUID(),name,name_key:nameKey(name),password_hash:encoded,recovery_hash:rescue.hash,created_at:now,auth_version:1},player=newPlayer(row.id,name,now);
    try{await this.db.batch([
      this.db.prepare('INSERT INTO accounts(id,name,name_key,password_hash,recovery_hash,created_at,auth_version) VALUES (?,?,?,?,?,?,?)').bind(row.id,row.name,row.name_key,row.password_hash,row.recovery_hash,row.created_at,row.auth_version),
      insertPlayer(this.db,player),this.sessionStatement(row,token,now),
    ]);}catch(error){if(await this.db.prepare('SELECT id FROM accounts WHERE name_key=?').bind(row.name_key).first())throw new GameError('name_taken','Dieser Spielername ist schon vergeben.',409);throw error;}
    return{token,user:publicUser(row),state:await this.game.snapshot(row.id,now),recoveryCode:rescue.code};
  }
  async login(name:string,password:string,now:number){
    const row=await this.db.prepare('SELECT * FROM accounts WHERE name_key=?').bind(nameKey(name)).first<AccountRow>();
    const correct=await verify(this.protectedPassword(password),row?.password_hash??`pbkdf2-sha256-peppered$100000$${'0'.repeat(32)}$${'0'.repeat(64)}`);if(!row||!correct)throw invalidLogin();
    const token=randomBytes(32).toString('base64url'),inserted=await this.sessionStatement(row,token,now).run();if(inserted.meta.changes!==1)throw invalidLogin();
    return{token,user:publicUser(row),state:await this.game.sync(row.id,now)};
  }
  async logout(token:string|undefined){if(token)await this.db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(digest(token)).run();}
  async recover(name:string,code:string,password:string,now:number){
    const row=await this.db.prepare('SELECT * FROM accounts WHERE name_key=?').bind(nameKey(name)).first<AccountRow>(),candidate=digest(normalizeCode(code));
    if(!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(row?.recovery_hash??'0'.repeat(64),'hex'))||!row)throw invalidRecovery();
    const encoded=await passwordHash(this.protectedPassword(password)),rescue=recovery(),token=randomBytes(32).toString('base64url');
    const [changed]=await this.db.batch([
      this.db.prepare('UPDATE accounts SET password_hash=?,recovery_hash=?,auth_version=auth_version+1 WHERE id=? AND auth_version=? AND recovery_hash=?').bind(encoded,rescue.hash,row.id,row.auth_version,row.recovery_hash),
      this.db.prepare('DELETE FROM sessions WHERE account_id=? AND auth_version<?').bind(row.id,row.auth_version+1),
      this.db.prepare('INSERT INTO sessions(token_hash,account_id,auth_version,created_at,expires_at) SELECT ?,id,auth_version,?,? FROM accounts WHERE id=? AND auth_version=? AND recovery_hash=?').bind(digest(token),now,now+30*86400000,row.id,row.auth_version+1,rescue.hash),
    ]);
    if(changed.meta.changes!==1)throw invalidRecovery();
    return{token,user:publicUser(row),state:await this.game.sync(row.id,now),recoveryCode:rescue.code};
  }
}
