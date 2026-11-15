export const VERSION = "1.0.0";
export const ECONOMY_VERSION = 1;
export const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;
export const MAX_LEVEL = 100;
export const RATE_SCALE = 1_000_000n;
export const ACCRUAL_SCALE = RATE_SCALE * 1000n;
export type LineId = "metal" | "electronics" | "robotics";
export type StationId = 0 | 1 | 2;
export type Levels = [number, number, number];
export type FactoryLevels = Record<LineId, Levels>;
export type GameAction = { type: "upgrade"; lineId: LineId; station: StationId; requestId: string } | { type: "unlockLine"; lineId: LineId; requestId: string };
export type LineDefinition = {
  id: LineId; name: string; product: string; description: string; color: string;
  stationNames: readonly [string,string,string];
  baseCapacities: readonly [number,number,number];
  baseCosts: readonly [number,number,number];
  unitValue: number; threshold: bigint; unlockCost: bigint;
};
export const LINES: readonly LineDefinition[] = [
  {id:"metal",name:"Metall",product:"Metallplatten",description:"Aus Erz wird der Anfang von etwas Großem.",color:"#f5af50",stationNames:["Erzmine","Schmelze","Presswerk"],baseCapacities:[2,1,1.5],baseCosts:[12,8,10],unitValue:1,threshold:0n,unlockCost:0n},
  {id:"electronics",name:"Elektronik",product:"Mikrochips",description:"Kleine Schaltkreise. Große Möglichkeiten.",color:"#8bbcb5",stationNames:["Siliziumgewinnung","Waferanlage","Chipfertigung"],baseCapacities:[1,.5,.25],baseCosts:[600,400,500],unitValue:40,threshold:5000n,unlockCost:1000n},
  {id:"robotics",name:"Robotik",product:"Roboter",description:"Deine nächste industrielle Revolution.",color:"#a7a1d4",stationNames:["Schrottsammlung","Teilefertigung","Robotermontage"],baseCapacities:[.2,.1,.05],baseCosts:[12000,8000,10000],unitValue:2000,threshold:100000n,unlockCost:20000n},
];
export const MILESTONES = [
  {value:1000n,title:"Werkstattleiter",color:"bronze"},
  {value:10000n,title:"Fabrikleiter",color:"silver"},
  {value:100000n,title:"Industriepionier",color:"gold"},
  {value:1000000n,title:"Industriemagnat",color:"emerald"},
  {value:10000000n,title:"Fabriklegende",color:"legend"},
] as const;
export function initialLevels(): FactoryLevels { return {metal:[1,1,1],electronics:[0,0,0],robotics:[0,0,0]}; }
export function definition(id: LineId): LineDefinition { const line=LINES.find(line=>line.id===id);if(!line)throw new Error("Unbekannte Produktionslinie.");return line; }
/** Integer arithmetic makes capacities identical in browser previews and server calculations. */
export function capacityMicros(line: LineDefinition, station: StationId, level: number): bigint {
  if(level===0)return 0n;
  if(!Number.isInteger(level)||level<1||level>MAX_LEVEL)throw new Error("Ungültige Maschinenstufe.");
  const base=BigInt(Math.round(line.baseCapacities[station]*Number(RATE_SCALE)));
  return base*115n**BigInt(level-1)/100n**BigInt(level-1);
}
export function upgradeCost(line: LineDefinition, station: StationId, currentLevel: number): bigint {
  if(currentLevel<1||currentLevel>=MAX_LEVEL)throw new Error("Diese Maschine kann nicht weiter ausgebaut werden.");
  const numerator=BigInt(line.baseCosts[station])*125n**BigInt(currentLevel-1),denominator=100n**BigInt(currentLevel-1);
  return (numerator+denominator-1n)/denominator;
}
export function lineRateMicros(line: LineDefinition, levels: Levels): bigint {
  if(levels.some(level=>level===0))return 0n;
  const capacities=levels.map((level,station)=>capacityMicros(line,station as StationId,level));
  return capacities.reduce((a,b)=>a<b?a:b)*BigInt(line.unitValue);
}
export function rateMicros(levels: FactoryLevels): bigint {return LINES.reduce((sum,line)=>sum+lineRateMicros(line,levels[line.id]),0n);}
export function bottleneck(line: LineDefinition, levels: Levels): StationId {
  const capacities=levels.map((level,i)=>capacityMicros(line,i as StationId,level));
  return capacities.indexOf(capacities.reduce((a,b)=>a<b?a:b)) as StationId;
}
export type ProductionClock = {settledAt:number;lastActiveAt:number;rate:bigint;remainder:bigint};
export function accrued(clock: ProductionClock, now: number) {
  const end=Math.min(now,clock.lastActiveAt+OFFLINE_CAP_MS);
  const elapsed=Math.max(0,Math.floor(end-clock.settledAt));
  const total=clock.rate*BigInt(elapsed)+clock.remainder;
  return {earned:total/ACCRUAL_SCALE,remainder:total%ACCRUAL_SCALE,elapsed,capped:now>clock.lastActiveAt+OFFLINE_CAP_MS};
}
export function milestone(value: bigint) {return [...MILESTONES].reverse().find(m=>value>=m.value)??{value:0n,title:"Gründer",color:"starter"};}
export type PlayerSummary = {id:string;name:string;rank:number;score:string;rateMicros:string;title:string;frame:string;createdAt:number;linesUnlocked:number};
export type LineState = {id:LineId;levels:Levels;rateMicros:string;bottleneck:StationId;upgradeCosts:(string|null)[];unlocked:boolean};
export type FactoryState = {
  player:PlayerSummary;coins:string;lifetimeValue:string;rateMicros:string;remainder:string;
  serverTime:number;offlineEarned:string;offlineElapsed:number;offlineCapped:boolean;
  nextPlayer:PlayerSummary|null;rankGap:string|null;playerCount:number;lines:LineState[];
};
export type Leaderboard = {players:PlayerSummary[];aroundMe:PlayerSummary[];me:PlayerSummary|null;page:number;total:number;pageSize:number;serverTime:number};
export function formatCredits(raw: string|bigint,compact=true): string {
  const value=typeof raw==="bigint"?raw:BigInt(raw);
  const units:[[bigint,string],[bigint,string],[bigint,string],[bigint,string]]=[[1000000000000n,"Bio."],[1000000000n,"Mrd."],[1000000n,"Mio."],[1000n,"Tsd."]];
  if(compact)for(const [amount,label]of units)if(value>=amount){const scaled=value*10n/amount;return `${scaled/10n}${scaled%10n?","+scaled%10n:""} ${label}`;}
  return new Intl.NumberFormat("de-DE").format(value);
}
export function formatRate(raw: string|bigint): string {const rate=Number(BigInt(raw))/Number(RATE_SCALE);return new Intl.NumberFormat("de-DE",{maximumFractionDigits:rate<10?2:1,notation:rate>=10000?"compact":"standard"}).format(rate);}
