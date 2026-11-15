import {createContext,useContext,useEffect,useState,useCallback,useRef,type ReactNode} from "react";
import type {FactoryState,GameAction} from "../shared/game";
export type User={id:string;name:string;createdAt:number};
export class ApiError extends Error{constructor(public code:string,message:string,public status:number){super(message);}}
export async function api<T>(url:string,options:{user?:User|null;method?:string;body?:unknown;signal?:AbortSignal}={}):Promise<T>{
  let response:Response;
  try{response=await fetch(url,{method:options.method??"GET",signal:options.signal,credentials:"same-origin",headers:options.body!==undefined?{"Content-Type":"application/json"}:{},body:options.body!==undefined?JSON.stringify(options.body):undefined});}
  catch(error){if((error as Error).name==="AbortError")throw error;throw new ApiError("network_error","Die Verbindung ist unterbrochen. Deine Fabrik bleibt gespeichert. Versuche es gleich noch einmal.",0);}
  const data=await response.json().catch(()=>{throw new ApiError("invalid_response","Die Verbindung zum Server ist gerade unterbrochen. Versuche es erneut.",response.status>=500?response.status:502);}) as {error?:string;message?:string};if(!response.ok)throw new ApiError(data.error??"request_failed",data.message??"Das hat gerade nicht geklappt.",response.status);return data as T;
}
type ActionInput=Omit<Extract<GameAction,{type:"upgrade"}>,"requestId">|Omit<Extract<GameAction,{type:"unlockLine"}>,"requestId">;
type Session={user:User|null;authReady:boolean;state:FactoryState|null;loading:boolean;error:string;modal:"login"|"register"|null;recoveryCode:string|null;openAuth:(mode?:"login"|"register")=>void;closeAuth:()=>void;login:(name:string,password:string)=>Promise<void>;register:(name:string,password:string)=>Promise<void>;logout:()=>Promise<void>;recover:(name:string,code:string,password:string)=>Promise<void>;clearRecovery:()=>void;sync:()=>Promise<void>;act:(action:ActionInput)=>Promise<void>;acting:boolean;clearError:()=>void;messageFor:(error:unknown)=>string};
const Context=createContext<Session|null>(null);
export function useSession(){const value=useContext(Context);if(!value)throw new Error("Session missing");return value;}
export function SessionProvider({children}:{children:ReactNode}){
  const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false),[state,setState]=useState<FactoryState|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[modal,setModal]=useState<"login"|"register"|null>(null),[acting,setActing]=useState(false),[recoveryCode,setRecoveryCode]=useState<string|null>(null);
  const identity=useRef<string|null>(null),channel=useRef<BroadcastChannel|null>(null),pendingAction=useRef<{actor:string;payload:string;requestId:string}|null>(null);
  const messageFor=(error:unknown)=>error instanceof ApiError?error.message:"Das hat gerade nicht geklappt. Bitte versuche es erneut.";
  const accept=useCallback((next:FactoryState)=>setState(current=>!current||current.player.id!==next.player.id||(next.revision!==undefined&&current.revision!==undefined?next.revision>current.revision||(next.revision===current.revision&&next.serverTime>=current.serverTime):next.serverTime>=current.serverTime)?next:current),[]);
  const changeUser=useCallback((next:User|null)=>{const changed=identity.current!==next?.id;identity.current=next?.id??null;setUser(next);if(changed){setState(null);setRecoveryCode(null);}},[]);
  const loadSession=useCallback(async()=>{try{const result=await api<{user:User|null}>("/api/auth/session");changeUser(result.user);}catch(error){setError(messageFor(error));}finally{setAuthReady(true);}},[changeUser]);
  useEffect(()=>{void loadSession();if(typeof BroadcastChannel!=="undefined"){channel.current=new BroadcastChannel("factory-league-auth");channel.current.onmessage=()=>void loadSession();}return()=>{channel.current?.close();channel.current=null;};},[loadSession]);
  const notify=()=>channel.current?.postMessage("changed");
  const sync=useCallback(async()=>{
    if(!user)return;const actor=user.id;
    try{const next=await api<FactoryState>("/api/sync",{method:"POST",body:{}});if(identity.current!==actor)return;accept(next);setError("");}
    catch(error){if(identity.current!==actor)return;if(error instanceof ApiError&&error.status===401){changeUser(null);setError("Deine Sitzung ist abgelaufen. Melde dich an, um weiterzubauen.");}else setError(messageFor(error));}
  },[user?.id,accept,changeUser]);
  useEffect(()=>{if(!user)return;setLoading(true);let cancelled=false;void sync().finally(()=>{if(!cancelled)setLoading(false);});const timer=setInterval(()=>{if(document.visibilityState==="visible")void sync();},60000);const focus=()=>{if(document.visibilityState==="visible")void loadSession().then(()=>sync());};document.addEventListener("visibilitychange",focus);window.addEventListener("online",focus);return()=>{cancelled=true;clearInterval(timer);document.removeEventListener("visibilitychange",focus);window.removeEventListener("online",focus);};},[user?.id,sync,loadSession]);
  const finish=(result:{user:User;state:FactoryState;recoveryCode?:string})=>{changeUser(result.user);accept(result.state);setError("");setModal(null);if(result.recoveryCode)setRecoveryCode(result.recoveryCode);notify();};
  const login=async(name:string,password:string)=>finish(await api("/api/auth/login",{method:"POST",body:{name,password}}));
  const register=async(name:string,password:string)=>finish(await api("/api/auth/register",{method:"POST",body:{name,password}}));
  const recover=async(name:string,recoveryCode:string,password:string)=>finish(await api("/api/auth/recover",{method:"POST",body:{name,recoveryCode,password}}));
  const logout=async()=>{await api("/api/auth/logout",{method:"POST",body:{}});changeUser(null);setError("");notify();};
  const act=async(action:ActionInput)=>{
    if(!user){setModal("register");return;}if(acting)return;const actor=user.id;setActing(true);setError("");
    const payload=JSON.stringify({type:action.type,lineId:action.lineId,station:action.type==="upgrade"?action.station:null});
    const existing=pendingAction.current;
    const requestId=existing?.actor===actor&&existing.payload===payload?existing.requestId:crypto.randomUUID();
    pendingAction.current={actor,payload,requestId};
    try{const next=await api<FactoryState>("/api/actions",{method:"POST",body:{...action,requestId}});pendingAction.current=null;if(identity.current===actor)accept(next);}
    catch(error){if(!(error instanceof ApiError&&(error.status===0||error.status>=500)))pendingAction.current=null;if(identity.current===actor)setError(messageFor(error));throw error;}
    finally{setActing(false);}
  };
  return <Context.Provider value={{user,authReady,state,loading,error,modal,recoveryCode,openAuth:(mode="register")=>{setError("");setModal(mode);},closeAuth:()=>setModal(null),login,register,recover,logout,clearRecovery:()=>setRecoveryCode(null),sync,act,acting,clearError:()=>setError(""),messageFor}}>{children}</Context.Provider>;
}
