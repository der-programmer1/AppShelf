import {accrued,initialLevels,rateMicros,lineRateMicros,bottleneck,upgradeCost,definition,milestone,LINES,MAX_LEVEL,type FactoryLevels,type FactoryState,type GameAction,type Leaderboard,type PlayerSummary,type StationId} from '../shared/game';

export class GameError extends Error{constructor(public code:string,message:string,public status=400){super(message);}}
export type PlayerRow={id:string;auth_uid:string;name:string;created_at:number;coins:string;lifetime_value:string;rate_micros:string;remainder:string;settled_at:number;last_active_at:number;levels_json:string;revision:number;last_mutation:string};
export function newPlayer(uid:string,name:string,now:number):PlayerRow{
  const levels=initialLevels();return{id:crypto.randomUUID(),auth_uid:uid,name,created_at:now,coins:'0',lifetime_value:'0',rate_micros:String(rateMicros(levels)),remainder:'0',settled_at:now,last_active_at:now,levels_json:JSON.stringify(levels),revision:1,last_mutation:crypto.randomUUID()};
}
export function insertPlayer(db:D1Database,row:PlayerRow){return db.prepare('INSERT INTO players(id,auth_uid,name,created_at,coins,lifetime_value,rate_micros,remainder,settled_at,last_active_at,levels_json,revision,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(row.id,row.auth_uid,row.name,row.created_at,row.coins,row.lifetime_value,row.rate_micros,row.remainder,row.settled_at,row.last_active_at,row.levels_json,row.revision,row.last_mutation);}
const clock=(row:PlayerRow)=>({settledAt:row.settled_at,lastActiveAt:row.last_active_at,rate:BigInt(row.rate_micros),remainder:BigInt(row.remainder)});
function settle(row:PlayerRow,now:number){const production=accrued(clock(row),now);return{production,row:{...row,coins:String(BigInt(row.coins)+production.earned),lifetime_value:String(BigInt(row.lifetime_value)+production.earned),remainder:String(production.remainder),settled_at:Math.max(now,row.settled_at),last_active_at:Math.max(now,row.last_active_at),revision:row.revision+1,last_mutation:crypto.randomUUID()}};}
function publicRow(row:PlayerRow,now:number):PlayerSummary{
  const score=BigInt(row.lifetime_value)+accrued(clock(row),now).earned,level=milestone(score),levels=JSON.parse(row.levels_json) as FactoryLevels;
  return{id:row.id,name:row.name,rank:0,score:String(score),rateMicros:row.rate_micros,title:level.title,frame:level.color,createdAt:row.created_at,linesUnlocked:LINES.filter(line=>levels[line.id][0]>0).length};
}
function rankings(rows:PlayerRow[],now:number){return rows.map(row=>publicRow(row,now)).sort((a,b)=>{const left=BigInt(a.score),right=BigInt(b.score);return left===right?a.createdAt-b.createdAt||a.id.localeCompare(b.id):left>right?-1:1;}).map((player,i)=>({...player,rank:i+1}));}
function snapshot(row:PlayerRow,rows:PlayerRow[],now:number):FactoryState{
  const players=rankings(rows,now),player=players.find(player=>player.id===row.id)!,levels=JSON.parse(row.levels_json) as FactoryLevels,pending=accrued(clock(row),now),nextPlayer=player.rank>1?players[player.rank-2]:null;
  return{player,coins:String(BigInt(row.coins)+pending.earned),lifetimeValue:player.score,rateMicros:row.rate_micros,remainder:String(pending.remainder),serverTime:now,revision:row.revision,offlineEarned:'0',offlineElapsed:0,offlineCapped:false,nextPlayer,rankGap:nextPlayer?String(BigInt(nextPlayer.score)-BigInt(player.score)+1n):null,playerCount:players.length,
    lines:LINES.map(line=>{const machineLevels=levels[line.id];return{id:line.id,levels:machineLevels,rateMicros:String(lineRateMicros(line,machineLevels)),bottleneck:bottleneck(line,machineLevels),unlocked:machineLevels[0]>0,upgradeCosts:machineLevels.map((level,i)=>level>0&&level<MAX_LEVEL?String(upgradeCost(line,i as StationId,level)):null)};})};
}
export class GameStore{
  constructor(readonly db:D1Database){}
  async rows(){return(await this.db.prepare('SELECT * FROM players').all<PlayerRow>()).results;}
  async row(uid:string){const row=await this.db.prepare('SELECT * FROM players WHERE auth_uid=?').bind(uid).first<PlayerRow>();if(!row)throw new GameError('profile_missing','Deine Fabrik wurde nicht gefunden.',404);return row;}
  private update(previous:PlayerRow,next:PlayerRow){return this.db.prepare('UPDATE players SET coins=?,lifetime_value=?,rate_micros=?,remainder=?,settled_at=?,last_active_at=?,levels_json=?,revision=?,last_mutation=? WHERE id=? AND revision=?').bind(next.coins,next.lifetime_value,next.rate_micros,next.remainder,next.settled_at,next.last_active_at,next.levels_json,next.revision,next.last_mutation,next.id,previous.revision);}
  async snapshot(uid:string,now:number){const rows=await this.rows(),row=rows.find(row=>row.auth_uid===uid);if(!row)throw new GameError('profile_missing','Deine Fabrik wurde nicht gefunden.',404);return snapshot(row,rows,now);}
  async sync(uid:string,now:number){
    for(let attempt=0;attempt<8;attempt++){
      const previous=await this.row(uid),{row,production}=settle(previous,now),rows=await this.rows();
      const result=await this.update(previous,row).run();if(result.meta.changes!==1)continue;
      const state=snapshot(row,rows.map(other=>other.id===row.id?row:other),now);
      if(now-previous.last_active_at>=120000){state.offlineEarned=String(production.earned);state.offlineElapsed=production.elapsed;state.offlineCapped=production.capped;}return state;
    }
    throw new GameError('factory_busy','Deine Fabrik wird gerade aktualisiert. Versuche es gleich erneut.',409);
  }
  async act(uid:string,action:GameAction,now:number){
    const payload=JSON.stringify({type:action.type,lineId:action.lineId,station:action.type==='upgrade'?action.station:null});
    for(let attempt=0;attempt<8;attempt++){
      const previous=await this.row(uid),existing=await this.db.prepare('SELECT payload,response FROM actions WHERE player_id=? AND request_id=?').bind(previous.id,action.requestId).first<{payload:string;response:string}>();
      if(existing){if(existing.payload!==payload)throw new GameError('request_conflict','Diese Anfrage wurde bereits für einen anderen Ausbau verwendet.',409);return JSON.parse(existing.response) as FactoryState;}
      const {row,production}=settle(previous,now),line=definition(action.lineId),levels=JSON.parse(row.levels_json) as FactoryLevels;let cost:bigint;
      if(action.type==='unlockLine'){
        if(levels[line.id][0]>0)throw new GameError('already_unlocked','Diese Produktionslinie ist bereits eröffnet.',409);
        if(BigInt(row.lifetime_value)<line.threshold)throw new GameError('milestone_required','Erreiche zuerst das Produktionsziel für diese Linie.');
        cost=line.unlockCost;levels[line.id]=[1,1,1];
      }else{
        const level=levels[line.id][action.station];if(level===0)throw new GameError('line_locked','Eröffne zuerst diese Produktionslinie.');
        if(level>=MAX_LEVEL)throw new GameError('maximum_level','Diese Maschine hat die höchste Stufe erreicht.');cost=upgradeCost(line,action.station,level);levels[line.id][action.station]++;
      }
      if(BigInt(row.coins)<cost)throw new GameError('insufficient_funds','Für diesen Ausbau fehlen noch Credits.');
      row.coins=String(BigInt(row.coins)-cost);row.levels_json=JSON.stringify(levels);row.rate_micros=String(rateMicros(levels));
      const rows=await this.rows(),state=snapshot(row,rows.map(other=>other.id===row.id?row:other),now);
      if(now-previous.last_active_at>=120000){state.offlineEarned=String(production.earned);state.offlineElapsed=production.elapsed;state.offlineCapped=production.capped;}
      // The conditional insert and revision update commit together. A losing writer
      // changes neither the factory nor the idempotency log and retries from D1.
      const [updated]=await this.db.batch([
        this.update(previous,row),
        this.db.prepare('INSERT INTO actions(player_id,request_id,payload,response,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM players WHERE id=? AND revision=? AND last_mutation=?)').bind(row.id,action.requestId,payload,JSON.stringify(state),now,row.id,row.revision,row.last_mutation),
      ]);
      if(updated.meta.changes===1)return state;
    }
    throw new GameError('factory_busy','Deine Fabrik wird gerade aktualisiert. Versuche es gleich erneut.',409);
  }
  async leaderboard(now:number,page=1,uid?:string):Promise<Leaderboard>{
    const rows=await this.rows(),players=rankings(rows,now),own=uid?rows.find(row=>row.auth_uid===uid):undefined,me=own?players.find(player=>player.id===own.id)??null:null,pageSize=50;
    return{players:players.slice((page-1)*pageSize,page*pageSize),aroundMe:me?players.slice(Math.max(0,me.rank-3),Math.min(players.length,me.rank+2)):[],me,page,total:players.length,pageSize,serverTime:now};
  }
  async profile(id:string,now:number){const rows=await this.rows(),row=rows.find(row=>row.id===id);if(!row)throw new GameError('player_not_found','Dieses Spielerprofil wurde nicht gefunden.',404);return{player:rankings(rows,now).find(player=>player.id===id)!,levels:JSON.parse(row.levels_json) as FactoryLevels,serverTime:now};}
}
