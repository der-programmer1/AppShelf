import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { accrued, initialLevels, rateMicros, lineRateMicros, bottleneck, upgradeCost, definition, milestone, LINES, MAX_LEVEL, type FactoryLevels, type FactoryState, type GameAction, type Leaderboard, type PlayerSummary, type StationId } from "../shared/game.js";

type PlayerRow = {id:string;auth_uid:string;name:string;created_at:bigint;coins:bigint;lifetime_value:bigint;rate_micros:bigint;remainder:bigint;settled_at:bigint;last_active_at:bigint;levels_json:string};
export class GameError extends Error { constructor(public code:string,message:string,public status=400){super(message);} }
export class GameStore {
  readonly db:Database.Database;
  constructor(path:string) {
    if(path!==":memory:")mkdirSync(dirname(path),{recursive:true});
    this.db=new Database(path);this.db.defaultSafeIntegers(true);
    this.db.pragma("journal_mode = WAL");this.db.pragma("foreign_keys = ON");this.db.pragma("busy_timeout = 5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_version VALUES (1);
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY, auth_uid TEXT UNIQUE NOT NULL, name TEXT UNIQUE COLLATE NOCASE NOT NULL,
        created_at INTEGER NOT NULL, coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0),
        lifetime_value INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_value >= 0),
        rate_micros INTEGER NOT NULL, remainder INTEGER NOT NULL DEFAULT 0,
        settled_at INTEGER NOT NULL, last_active_at INTEGER NOT NULL, levels_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS actions (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL, payload TEXT NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY(player_id, request_id)
      );
      CREATE INDEX IF NOT EXISTS action_time ON actions(created_at);
      CREATE INDEX IF NOT EXISTS player_score ON players(lifetime_value DESC,created_at ASC,id ASC);`);
  }
  close(){this.db.close();}
  row(uid:string):PlayerRow {const row=this.db.prepare("SELECT * FROM players WHERE auth_uid=?").get(uid) as PlayerRow|undefined;if(!row)throw new GameError("profile_missing","Wähle zuerst deinen Spielernamen.",404);return row;}
  private clock(row:PlayerRow) {return{settledAt:Number(row.settled_at),lastActiveAt:Number(row.last_active_at),rate:row.rate_micros,remainder:row.remainder};}
  private publicRow(row:PlayerRow,now:number,rank:number):PlayerSummary {
    const score=row.lifetime_value+accrued(this.clock(row),now).earned,level=milestone(score);
    const levels=JSON.parse(row.levels_json) as FactoryLevels;
    return{id:row.id,name:row.name,rank,score:String(score),rateMicros:String(row.rate_micros),title:level.title,frame:level.color,createdAt:Number(row.created_at),linesUnlocked:LINES.filter(line=>levels[line.id][0]>0).length};
  }
  rankings(now:number):PlayerSummary[] {
    const rows=this.db.prepare("SELECT * FROM players").all() as PlayerRow[];
    const players=rows.map(row=>this.publicRow(row,now,0));
    players.sort((a,b)=>{const sa=BigInt(a.score),sb=BigInt(b.score);return sa===sb?(a.createdAt-b.createdAt||a.id.localeCompare(b.id)):sa>sb?-1:1;});
    return players.map((player,i)=>({...player,rank:i+1}));
  }
  create(uid:string,name:string,now:number):FactoryState {
    return this.db.transaction(()=>{
      const existing=this.db.prepare("SELECT id FROM players WHERE auth_uid=?").get(uid);
      if(existing)return this.snapshot(uid,now);
      if(!/^[A-Za-z0-9_]{3,20}$/.test(name))throw new GameError("invalid_name","Dein Name braucht 3–20 Buchstaben, Zahlen oder Unterstriche.");
      const duplicate=this.db.prepare("SELECT id FROM players WHERE name=? COLLATE NOCASE").get(name);
      if(duplicate)throw new GameError("name_taken","Dieser Spielername ist schon vergeben.",409);
      const levels=initialLevels();
      this.db.prepare("INSERT INTO players(id,auth_uid,name,created_at,rate_micros,settled_at,last_active_at,levels_json) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(),uid,name,now,rateMicros(levels),now,now,JSON.stringify(levels));
      return this.snapshot(uid,now);
    })();
  }
  private settle(uid:string,now:number) {
    const row=this.row(uid),production=accrued(this.clock(row),now);
    // Never move the accrual cursor backwards if the system clock is corrected.
    const cursor=Math.max(now,Number(row.settled_at)),active=Math.max(now,Number(row.last_active_at));
    this.db.prepare("UPDATE players SET coins=coins+?,lifetime_value=lifetime_value+?,remainder=?,settled_at=?,last_active_at=? WHERE id=?")
      .run(production.earned,production.earned,production.remainder,cursor,active,row.id);
    return production;
  }
  sync(uid:string,now:number):FactoryState {
    return this.db.transaction(()=>{
      const before=this.row(uid),offline=now-Number(before.last_active_at)>=120000;
      const production=this.settle(uid,now),state=this.snapshot(uid,now);
      if(offline){state.offlineEarned=String(production.earned);state.offlineElapsed=production.elapsed;state.offlineCapped=production.capped;}
      return state;
    })();
  }
  act(uid:string,action:GameAction,now:number):FactoryState {
    return this.db.transaction(()=>{
      const row=this.row(uid),payload=JSON.stringify({type:action.type,lineId:action.lineId,station:action.type==="upgrade"?action.station:null});
      const existing=this.db.prepare("SELECT payload,response FROM actions WHERE player_id=? AND request_id=?").get(row.id,action.requestId) as {payload:string;response:string}|undefined;
      if(existing){if(existing.payload!==payload)throw new GameError("request_conflict","Diese Anfrage wurde bereits für einen anderen Ausbau verwendet.",409);return JSON.parse(existing.response) as FactoryState;}
      const production=this.settle(uid,now),current=this.row(uid),line=definition(action.lineId),levels=JSON.parse(current.levels_json) as FactoryLevels;
      let cost:bigint;
      if(action.type==="unlockLine"){
        if(levels[line.id][0]>0)throw new GameError("already_unlocked","Diese Produktionslinie ist bereits eröffnet.",409);
        if(current.lifetime_value<line.threshold)throw new GameError("milestone_required","Erreiche zuerst das Produktionsziel für diese Linie.");
        cost=line.unlockCost;levels[line.id]=[1,1,1];
      }else{
        const level=levels[line.id][action.station];
        if(level===0)throw new GameError("line_locked","Eröffne zuerst diese Produktionslinie.");
        if(level>=MAX_LEVEL)throw new GameError("maximum_level","Diese Maschine hat die höchste Stufe erreicht.");
        cost=upgradeCost(line,action.station,level);levels[line.id][action.station]++;
      }
      if(current.coins<cost)throw new GameError("insufficient_funds","Für diesen Ausbau fehlen noch Credits.");
      this.db.prepare("UPDATE players SET coins=coins-?,levels_json=?,rate_micros=? WHERE id=?").run(cost,JSON.stringify(levels),rateMicros(levels),row.id);
      const state=this.snapshot(uid,now);
      if(now-Number(row.last_active_at)>=120000){state.offlineEarned=String(production.earned);state.offlineElapsed=production.elapsed;state.offlineCapped=production.capped;}
      this.db.prepare("INSERT INTO actions(player_id,request_id,payload,response,created_at) VALUES (?,?,?,?,?)").run(row.id,action.requestId,payload,JSON.stringify(state),now);
      this.db.prepare("DELETE FROM actions WHERE created_at < ?").run(now-7*86400000);
      return state;
    })();
  }
  snapshot(uid:string,now:number):FactoryState {
    const row=this.row(uid),pending=accrued(this.clock(row),now),levels=JSON.parse(row.levels_json) as FactoryLevels;
    const players=this.rankings(now),player=players.find(player=>player.id===row.id)!;
    const nextPlayer=player.rank>1?players[player.rank-2]:null;
    return{player,coins:String(row.coins+pending.earned),lifetimeValue:player.score,rateMicros:String(row.rate_micros),remainder:String(pending.remainder),serverTime:now,offlineEarned:"0",offlineElapsed:0,offlineCapped:false,
      nextPlayer,rankGap:nextPlayer?String(BigInt(nextPlayer.score)-BigInt(player.score)+1n):null,playerCount:players.length,
      lines:LINES.map(line=>{const machineLevels=levels[line.id];return{id:line.id,levels:machineLevels,rateMicros:String(lineRateMicros(line,machineLevels)),bottleneck:bottleneck(line,machineLevels),unlocked:machineLevels[0]>0,
        upgradeCosts:machineLevels.map((level,i)=>level>0&&level<MAX_LEVEL?String(upgradeCost(line,i as StationId,level)):null)};})};
  }
  leaderboard(now:number,page=1,uid?:string):Leaderboard {
    const players=this.rankings(now),pageSize=50,total=players.length;
    let me:PlayerSummary|null=null;
    if(uid){try{const own=this.row(uid);me=players.find(player=>player.id===own.id)??null;}catch(error){if(!(error instanceof GameError&&error.code==="profile_missing"))throw error;}}
    const aroundMe=me?players.slice(Math.max(0,me.rank-3),Math.min(total,me.rank+2)):[];
    return{players:players.slice((page-1)*pageSize,page*pageSize),aroundMe,me,page,total,pageSize,serverTime:now};
  }
  profile(id:string,now:number) {
    const row=this.db.prepare("SELECT * FROM players WHERE id=?").get(id) as PlayerRow|undefined;
    if(!row)throw new GameError("player_not_found","Dieses Spielerprofil wurde nicht gefunden.",404);
    const player=this.rankings(now).find(player=>player.id===id)!;
    return{player,levels:JSON.parse(row.levels_json) as FactoryLevels,serverTime:now};
  }
}
