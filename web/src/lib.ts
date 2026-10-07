import type {Vehicle} from './api';

export type Point={lat:number;lon:number};
export type Page={kind:'home'|'plan'|'metro'|'settings'|'hub'|'help'|'legal'|'privacy'|'terms'|'about'|'route'|'stop'|'metroRoute';id?:string};

export const CENTER:[number,number]=[28.6139,77.209];
export const BOUNDS:[[number,number],[number,number]]=[[28.40,76.84],[28.88,77.35]];

export const storageGet=(k:string)=>{try{return window.localStorage.getItem(k)}catch{return null}};
export const storageSet=(k:string,v:string)=>{try{window.localStorage.setItem(k,v);return true}catch{return false}};

export const SERVICE_COLORS:Record<string,string>={cluster:'#E57D43',dtc:'#E57D43',electric:'#2FAFBC',unknown:'#E57D43'};
export const ROUTE_COLORS:Record<string,string>={};
export const isHex=(v:unknown):v is string=>/^#[0-9a-f]{6}$/i.test(String(v||''));
export const busColor=(v:{serviceColor?:string|null;serviceType?:string|null;routeShortName?:string|null;routeId?:string|null;routeName?:string|null}|null|undefined,route?:unknown)=>{
  const rawRoute=route??v?.routeShortName??v?.routeName??v?.routeId;
  const normalized=routeName(rawRoute);
  if(normalized&&ROUTE_COLORS[normalized])return ROUTE_COLORS[normalized];
  const type=String(v?.serviceType||'');
  if(type==='electric')return SERVICE_COLORS.electric;
  if(type==='dtc'||type==='cluster'||type==='unknown')return SERVICE_COLORS.dtc;
  return SERVICE_COLORS.unknown;
};
export const textOn=(bg:string)=>{const h=bg.replace('#','');const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]>.6?'#14211B':'#FFFFFF'};

export const routeName=(value:unknown)=>{
  let t=String(value??'').trim().replace(/\s+/g,' ');
  if(!t)return null;
  t=t.replace(/^route\s*[:#-]?\s*/i,'').trim();
  t=t.split(/\s*[|:–—]\s*/)[0].trim();
  t=t.replace(/(?:\s*[-_\/|:]?\s*)(?:UP|DOWN|DWN)$/i,'').replace(/\b(?:UP|DOWN|DWN)\b/gi,'').replace(/\s+/g,' ').trim();
  const air=t.match(/^(?:AIRPORT|AIR)[-_ ]*0*(\d+[A-Z]?)/i);if(air)return 'AIR-'+air[1].toUpperCase();
  const num=t.match(/^(?:D[-\s]?)?(\d{1,5}[A-Z]?)(?=$|[\s\-_\/])/i);if(num)return num[1].toUpperCase();
  return t.length<=14?t:null;
};
export const fullRouteName=(value:unknown)=>{
  let t=String(value??'').trim().replace(/\s+/g,' ').replace(/^route\s*[:#-]?\s*/i,'');
  t=t.replace(/(?:\s*[-_\/|:]?\s*)(?:UP|DOWN|DWN)$/i,'').replace(/\b(?:UP|DOWN|DWN)\b/gi,'').replace(/\s*[-–—|:]+\s*$/,'').replace(/\s+/g,' ').trim();
  return t||null;
};
export const vehicleRoute=(v:Partial<Vehicle>)=>routeName(v.routeShortName)||routeName(v.routeId)||'BUS';
export const vehicleRouteFullName=(v:Partial<Vehicle>)=>{
  const n=routeName(v.routeShortName)||routeName(v.routeId);
  const raw=String(v.routeShortName||v.routeId||'').toUpperCase();
  if(n==='801'){
    if(raw.includes('IGI-IND'))return 'IGI Airport - Inderlok Metro';
    if(raw.includes('IND-IGI')||raw==='801')return 'Inderlok Metro - IGI Airport';
    if(raw.includes('KAP-UTT'))return 'Kapashera Border - Uttam Nagar Terminal';
    if(raw.includes('UTT-KAP'))return 'Uttam Nagar Terminal - Kapashera Border';
  }
  const full=fullRouteName(v.routeLongName);
  if(!full||full===n)return null;
  return full;
};

export const ageText=(iso?:string|null)=>{
  const t=Date.parse(String(iso||''));if(!Number.isFinite(t))return 'Live';
  return secText(Math.max(0,Math.round((Date.now()-t)/1000)));
};
export const secText=(s:number)=>s<20?'Just now':s<60?s+' sec ago':Math.floor(s/60)+' min ago';
export const dist=(m?:number|null)=>m==null?'':m<1000?Math.round(m)+' m':(m/1000).toFixed(1)+' km';
export const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));

export function parsePath(path:string=window.location.pathname):Page{
  const p=path.replace(/\/+$/,'')||'/';
  if(p==='/')return{kind:'home'};
  if(p==='/plan')return{kind:'plan'};
  if(p==='/metro')return{kind:'metro'};
  try{if(p.startsWith('/metro/routes/'))return{kind:'metroRoute',id:decodeURIComponent(p.slice(14))};}catch{}
  if(p==='/settings')return{kind:'settings'};
  if(p==='/hub')return{kind:'hub'};
  if(p==='/help')return{kind:'help'};
  if(p==='/legal')return{kind:'legal'};
  if(p==='/legal/privacy')return{kind:'privacy'};
  if(p==='/legal/terms')return{kind:'terms'};
  if(p==='/about')return{kind:'about'};
  try{
    if(p.startsWith('/routes/'))return{kind:'route',id:decodeURIComponent(p.slice(8))};
    if(p.startsWith('/stops/'))return{kind:'stop',id:decodeURIComponent(p.slice(7))};
  }catch{}
  return{kind:'home'};
}
export type Go=(path:string,replace?:boolean)=>void;
export type LiveStatus='loading'|'ok'|'stale'|'unavailable';