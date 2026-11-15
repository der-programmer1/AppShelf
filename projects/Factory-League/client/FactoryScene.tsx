import {useId} from "react";
import {LINES,initialLevels,lineRateMicros,type FactoryLevels,type LineId} from "../shared/game";

const iso=(u:number,v:number)=>({x:500+(u-v)*45,y:80+(u+v)*22.5});
function Prism({width=92,depth=56,height=54,roof="#f0ad55",left="#e6dfcb",right="#c8c4b3"}:{width?:number;depth?:number;height?:number;roof?:string;left?:string;right?:string}){
  return <g><path d={`M${-width/2},${-height} L0,${depth/2-height} L0,${depth/2} L${-width/2},0Z`} fill={left}/><path d={`M0,${depth/2-height} L${width/2},${-height} L${width/2},0 L0,${depth/2}Z`} fill={right}/><path d={`M${-width/2},${-height} L0,${-depth/2-height} L${width/2},${-height} L0,${depth/2-height}Z`} fill={roof}/></g>;
}
function Machine({line,station,level,selected,onSelect,locked}:{line:LineId;station:number;level:number;selected:boolean;onSelect?:()=>void;locked:boolean}){
  const color=LINES.find(l=>l.id===line)!.color;
  const button=onSelect&&!locked;
  return <g className={`scene-machine ${locked?"unbuilt":""} ${selected?"selected":""}`} role={button?"button":undefined} tabIndex={button?0:undefined} aria-label={button?`${LINES.find(l=>l.id===line)!.stationNames[station]} auswählen, Stufe ${level}`:undefined} onClick={button?onSelect:undefined} onKeyDown={button?event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect();}}:undefined}>
    <ellipse className="machine-ground-shadow" cx="0" cy="8" rx="65" ry="31" fill="#394d3a" opacity=".12"/>
    {locked?<><path d="M-55 0 0-28 55 0 0 28Z" fill="#f1efdf" stroke="#c2c8ac" strokeDasharray="5 5"/><g transform="translate(0,-7)" fill="#a3ad95"><path d="M-8-4V-10a8 8 0 0 1 16 0v6h-4v-6a4 4 0 0 0-8 0v6Z"/><rect x="-11" y="-5" width="22" height="17" rx="4"/></g></>:
    <>
      <path className="machine-selection" d="M-66 2 0-31 66 2 0 35Z" fill="none" stroke={color} strokeWidth="3"/>
      <Prism width={102} depth={64} height={8} roof="#a6b2a5" left="#89998a" right="#748875"/>
      {station===0?<>
        <g transform="translate(-6,-5)"><Prism width={71} depth={43} height={27} roof="#6d7f72" left="#a9b6a1" right="#8c9d8a"/>
          <path d="M-24-29-5-39 25-25 5-14Z" fill="#3d5148"/><path d="M-19-29-5-36 20-25 5-18Z" fill="#263f35"/>
          <path d="M-27-29v-23L-4-64 24-50v25M-27-52-4-40 24-52M-4-64v25" fill="none" stroke={color} strokeWidth="6" strokeLinejoin="round"/>
          <path d="M-4-59v28" stroke="#d8d8bd" strokeWidth="3"/><circle cx="-4" cy="-31" r="6" fill="#505e4c"/>
        </g>
        <g transform="translate(33,0)"><Prism width={24} depth={16} height={23} roof={color} left={color} right="#a8844f"/><path d="M0-12 10-17v12L0 0Z" fill="#354c40"/></g>
        <path d="M-44-4-38-15-25-16-17-5-32 3Z" fill="#6e7e74"/><path d="M-40-8-35-14-27-13-23-7Z" fill="#8d9b8e"/>
      </>:station===1?<>
        <g transform="translate(-5,-4)"><Prism width={90} depth={54} height={58} roof={color} left="#eee6cf" right="#c8c7b7"/>
          <path d="M-39-47-6-30v23L-39-24Z" fill="#dddbc6"/><path d="M-33-40-12-29v15L-33-25Z" fill="#556d60"/>
          <path d="M8-28 33-42v26L8-2Z" fill="#596f61"/><path d="M12-25 29-34v17L12-8Z" fill={level>=10?"#f7c774":"#f5b151"}/>
          <path d="M-2-56 27-72 38-66 8-50Z" fill="#f4c47f"/><path d="M-8-29v22M-26-38v22" stroke="#b2bcaa" strokeWidth="2"/>
        </g>
        <g transform="translate(-21,-67)"><Prism width={16} depth={12} height={38} roof="#697968" left="#8d9c86" right="#596f5c"/><path d="M-8-27 0-23 8-27v9L0-14-8-18Z" fill={color}/><g className="chimney-smoke"><circle cx="0" cy="-47" r="8" fill="#d8ded0"/><circle cx="-3" cy="-61" r="11" fill="#e2e6da"/><circle cx="2" cy="-77" r="13" fill="#e9eade"/></g></g>
        <g transform="translate(15,-78)"><Prism width={13} depth={9} height={29} roof="#74816d" left="#a1ad97" right="#6b7e66"/></g>
      </>:<>
        <g transform="translate(0,-4)"><Prism width={110} depth={61} height={50} roof={color} left="#e8e2ce" right="#cac8b6"/>
          <path d="M-49-47 0-24 49-47M-40-51 7-28M-28-57 19-34M-16-63 31-40" fill="none" stroke="#ffffff" strokeOpacity=".25" strokeWidth="3"/>
          <path d="M-36-29-12-17v25L-36-4Z" fill="#718573"/><path d="M-31-26-17-19V0L-31-7Z" fill="#485e4f"/>
          <path d="M9-15 41-32v25L9 10Z" fill="#859785"/><path d="M13-12 37-24v16L13 5Z" fill="#4e6858"/><path d="M14-9 36-20M14-4 36-15M14 1 36-10" stroke="#aebca4" strokeWidth="1.5"/>
          <path d="M-46-34-39-30v8L-46-26ZM-8-17-2-14v8L-8-9Z" fill="#f1c46e"/>
        </g>
        <g transform="translate(46,13)"><Prism width={26} depth={19} height={15} roof="#ddbc78" left="#c1a268" right="#a78b58"/><path d="M-12-15 0-8 12-15M0-8v15" fill="none" stroke="#89774e" strokeWidth="1"/></g>
        {line==="robotics"&&<g transform="translate(-43,10)" stroke="#536e62" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"><path className="robot-arm" d="M0 0v-20l18-15 16 10" fill="none"/><circle cx="0" cy="-20" r="5" fill={color}/><circle cx="18" cy="-35" r="5" fill={color}/></g>}
      </>}
      <g transform="translate(0,37)" className="machine-level"><rect x="-18" y="-8" width="36" height="18" rx="8" fill="#f8f7ef" stroke="#d6ddcb"/><text textAnchor="middle" y="4" fontSize="9" fill="#586755" fontFamily="monospace">Lv.{level}</text></g>
      {level>=5&&<g transform="translate(39,-10)"><path d="M0 0V-24" stroke="#6f836a" strokeWidth="3"/><circle cy="-26" r="5" fill={level>=25?"#83c5a7":color}/><circle cy="-26" r="8" fill={color} opacity=".15"/></g>}
    </>}
  </g>;
}
function Tree({x,y,size=1}:{x:number;y:number;size?:number}){return <g transform={`translate(${x},${y}) scale(${size})`}><ellipse cy="5" rx="16" ry="7" fill="#7e9872" opacity=".15"/><path d="M0 4v-26" stroke="#8c8061" strokeWidth="5"/><path d="M-17-19 0-48 17-19 0-9Z" fill="#849e76"/><path d="M0-48 17-19 0-9Z" fill="#6e8b63"/><path d="M-13-31 0-55 13-31 0-23Z" fill="#95ac83"/></g>;}
export default function FactoryScene({levels=initialLevels(),selected,select,animated=true,compact=false}:{levels?:FactoryLevels;selected?:{lineId:LineId;station:number};select?:(lineId:LineId,station:StationId)=>void;animated?:boolean;compact?:boolean}){
  const id=useId().replace(/:/g,"");
  const stations=LINES.flatMap((line,row)=>[0,1,2].map(station=>({line,row,station,u:1+station*3,v:1+row*3}))).sort((a,b)=>(a.u+a.v)-(b.u+b.v));
  return <svg className={`factory-scene ${animated?"animated":""} ${compact?"compact":""}`} viewBox="0 0 1000 575" role="img" aria-label="Isometrische Fabrik mit drei Produktionslinien und ausbaubaren Maschinen">
    <defs><filter id={`shadow-${id}`} x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation="13"/></filter><linearGradient id={`ground-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e5e9d6"/><stop offset="1" stopColor="#dce3cc"/></linearGradient><pattern id={`dots-${id}`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r=".9" fill="#b4bf9f" opacity=".35"/></pattern></defs>
    <rect width="1000" height="575" fill={`url(#dots-${id})`}/>
    <path d="M500 55 957 285 500 519 43 285Z" fill="#8f9a7c" opacity=".15" filter={`url(#shadow-${id})`} transform="translate(0,12)"/>
    <path d="M50 281 500 506 950 281v17L500 523 50 298Z" fill="#b8c7a3"/>
    <path d="M50 281 500 506v17L50 298Z" fill="#c3cfad"/>
    <path d="M500 56 950 281 500 506 50 281Z" fill={`url(#ground-${id})`}/>
    <path d="M500 74 914 281 500 488 86 281Z" fill="#e9ecdc" stroke="#d0d8c0" strokeWidth="1.5"/>
    {[0,1,2,3,4,5,6,7,8].map(v=>{const a=iso(0,v),b=iso(8,v),c=iso(v,0),d=iso(v,8);return <g key={v} stroke="#d4dcc4" strokeWidth="1" opacity=".65"><path d={`M${a.x} ${a.y}L${b.x} ${b.y}`}/><path d={`M${c.x} ${c.y}L${d.x} ${d.y}`}/></g>;})}
    <path d="M118 295 500 486 880 296 849 280 500 455 149 280Z" fill="#c4cdb9"/>
    <path d="M150 301 500 475 850 301" stroke="#eef0e3" strokeWidth="2" strokeDasharray="10 11" fill="none"/>
    {LINES.map((line,row)=>{const v=1+row*3,active=levels[line.id][0]>0,speed=Math.max(.6,3/Math.log2(2+Number(lineRateMicros(line,levels[line.id]))/1000000/line.unitValue));return <g key={line.id} className={active?"working-line":"locked-line"} opacity={active?1:.6}>
      {[0,1].map(station=>{const a=iso(1+station*3,v),b=iso(4+station*3,v);return <g key={station}>
        <path d={`M${a.x+25} ${a.y+9}L${b.x-24} ${b.y-16}`} stroke="#8c9c87" strokeWidth="18"/>
        <path d={`M${a.x+25} ${a.y+7}L${b.x-24} ${b.y-18}`} stroke={active?"#6f8270":"#c0cab2"} strokeWidth="12"/>
        {active&&<path className="conveyor-items" style={{animationDuration:`${speed}s`}} d={`M${a.x+25} ${a.y+6}L${b.x-24} ${b.y-19}`} stroke={line.color} strokeWidth="7" strokeDasharray="5 17"/>}
      </g>;})}
    </g>;})}
    <Tree x={486} y={78} size={.75}/><Tree x={549} y={93} size={.65}/><Tree x={893} y={277} size={.78}/><Tree x={837} y={236} size={.6}/><Tree x={119} y={277} size={.7}/><Tree x={151} y={304} size={.6}/><Tree x={518} y={477} size={.8}/>
    {stations.map(({line,station,u,v})=>{const point=iso(u,v);return <g key={`${line.id}-${station}`} transform={`translate(${point.x},${point.y})`}><Machine line={line.id} station={station} level={levels[line.id][station]} locked={levels[line.id][0]===0} selected={selected?.lineId===line.id&&selected.station===station} onSelect={select?()=>select(line.id,station as StationId):undefined}/></g>;})}
    <g transform="translate(681,395)"><path d="M-27 3 0-11 34 6 7 20Z" fill="#6c806b" opacity=".25"/><path d="M-25-4 0-17 28-3 3 10Z" fill="#f0bb67"/><path d="M-25-4v15L3 25V10Z" fill="#c99146"/><path d="M3 10 28-3v15L3 25Z" fill="#dea654"/><path d="M5-6 18-13 31-6 18 1Z" fill="#758c77"/><path d="M5-6V6L18 13V1Z" fill="#526b59"/><path d="M18 1 31-6V6L18 13Z" fill="#789480"/><ellipse cx="-15" cy="16" rx="5" ry="7" fill="#516351"/><ellipse cx="20" cy="19" rx="5" ry="7" fill="#516351"/><path d="M-26-6v-22l16 8v22" stroke="#677d67" strokeWidth="3" fill="none"/></g>
    <g transform="translate(270,387)"><Prism width={38} depth={26} height={20} roof="#dfbd7c" left="#c7ac72" right="#a58d5e"/><path d="M-17-20 0-11 17-20M0-11V12" fill="none" stroke="#8d7b53" strokeWidth="2"/></g>
    <g transform="translate(514,533)"><path d="M-20 0H20" stroke="#b6c3a2" strokeWidth="2"/><text x="0" y="20" textAnchor="middle" fill="#9ca68c" fontSize="9" fontFamily="monospace" letterSpacing="3">FACTORY LEAGUE</text></g>
  </svg>;
}
type StationId=0|1|2;
