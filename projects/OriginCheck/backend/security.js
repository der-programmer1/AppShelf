import dns from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import {ApiError, publicHttpsUrl, SOCIAL_MESSAGE} from './contracts.js';
import {IMAGE_LIMIT} from './media.js';
const social=['instagram.com','facebook.com','fb.watch','tiktok.com','youtube.com','youtu.be','x.com','twitter.com','threads.net','threads.com','linkedin.com','snapchat.com','reddit.com','vimeo.com','pinterest.com'];
export function isSocial(host) {host=host.toLowerCase();return social.some(x=>host===x||host.endsWith('.'+x));}
export function isPublicAddress(address) {
  try {let ip=ipaddr.parse(address);if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress())ip=ip.toIPv4Address();return ip.range()==='unicast';}catch{return false;}
}
export function guardPublicLink(raw) {
  const url=publicHttpsUrl(raw);
  const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(isSocial(host))throw new ApiError(422,'unsupported_social_link',SOCIAL_MESSAGE);
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.home.arpa')||!host.includes('.')&&!host.includes(':'))throw new ApiError(400,'private_url','Private oder lokale Netzwerkziele sind nicht erlaubt.');
  if(ipaddr.isValid(host)&&!isPublicAddress(host))throw new ApiError(400,'private_url','Private oder reservierte IP-Adressen sind nicht erlaubt.');
  return {url,host};
}
export async function resolvePublicLink(raw,lookup=dns.lookup) {
  const {url,host}=guardPublicLink(raw);
  let addresses;
  try{addresses=ipaddr.isValid(host)?[{address:host,family:ipaddr.parse(host).kind()==='ipv4'?4:6}]:await lookup(host,{all:true,verbatim:true});}catch{throw new ApiError(400,'unresolvable_url','Der öffentliche Host konnte nicht sicher aufgelöst werden.');}
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new ApiError(400,'private_url','Das Ziel löst auf eine private, lokale oder reservierte Adresse auf.');
  return {url,addresses};
}
export async function fetchPublicImage(raw,{signal,maxBytes=IMAGE_LIMIT,lookup=dns.lookup,request=https.request,proxyConfigured=Boolean(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.ALL_PROXY)}={}) {
  // A CONNECT proxy controls DNS itself. Fail closed rather than pretend IP pinning survives it.
  guardPublicLink(raw);
  if(proxyConfigured)throw new ApiError(503,'link_proxy_not_supported','Direkte Linkabrufe sind hinter einem ausgehenden Proxy deaktiviert. Bitte die Bilddatei hochladen.');
  let next=raw;
  for(let redirects=0;redirects<=3;redirects++){
    const {url,addresses}=await resolvePublicLink(next,lookup);
    const chosen=addresses[0];
    const response=await new Promise((resolve,reject)=>{
      const req=request(url,{method:'GET',signal,agent:false,servername:ipaddr.isValid(url.hostname.replace(/^\[|\]$/g,''))?undefined:url.hostname,
        headers:{Accept:'image/jpeg,image/png,image/webp','User-Agent':'OriginCheck/0.1.0'},
        lookup:(_hostname,options,cb)=>options?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},resolve);
      req.on('error',reject);req.setTimeout(12000,()=>req.destroy(new ApiError(504,'link_timeout','Der Bildabruf hat zu lange gedauert.')));req.end();
    });
    if([301,302,303,307,308].includes(response.statusCode)){
      const location=response.headers.location;response.destroy();
      if(!location||redirects===3)throw new ApiError(422,'redirect_limit','Der Link kann nicht direkt verarbeitet werden.');
      next=new URL(location,url).href;continue;
    }
    if(response.statusCode!==200){response.destroy();throw new ApiError(422,'link_unavailable',SOCIAL_MESSAGE);}
    const mime=String(response.headers['content-type']||'').split(';')[0].toLowerCase();
    if(!['image/jpeg','image/png','image/webp'].includes(mime)){response.destroy();throw new ApiError(422,'unsupported_link',SOCIAL_MESSAGE);}
    if(Number(response.headers['content-length'])>maxBytes){response.destroy();throw new ApiError(413,'file_too_large','Das verlinkte Bild ist größer als 25 MB.');}
    const chunks=[];let length=0;
    try{for await(const chunk of response){length+=chunk.length;if(length>maxBytes){response.destroy();throw new ApiError(413,'file_too_large','Das verlinkte Bild ist zu groß.');}chunks.push(chunk);}return {bytes:Buffer.concat(chunks),mime};}
    finally{for(const chunk of chunks)chunk.fill(0);}
  }
}
