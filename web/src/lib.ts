import type {Vehicle} from './api';

export type Point={lat:number;lon:number};
export type Page={kind:'home'|'plan'|'metro'|'settings'|'hub'|'help'|'legal'|'privacy'|'terms'|'about'|'route'|'stop'|'metroRoute';id?:string};

export const CENTER:[number,number]=[28.6139,77.209];
export const BOUNDS:[[number,number],[number,number]]=[[28.40,76.84],[28.88,77.35]];

export const storageGet=(k:string)=>{try{return window.localStorage.getItem(k)}catch{return null}};
export const storageSet=(k:string,v:string)=>{try{window.localStorage.setItem(k,v);return true}catch{return false}};

export const SERVICE_COLORS:Record<string,string>={electricAc:'#0E7490',electricDevi:'#16A34A',cngAc:'#1D4ED8',cngNonAc:'#F97316',unknown:'#64748B'};
export const ROUTE_COLORS:Record<string,string>={}
export const METRO_LINE_COLORS={RED:'#D83B3B',YELLOW:'#E5B12C',BLUE:'#2F63B7',GREEN:'#2F9B62',VIOLET:'#7A4FB5',MAGENTA:'#B044A6',PINK:'#D65A9A',ORANGE:'#E06B2C',GRAY:'#6B7280',RAPID:'#3A8D8D',AQUA:'#159A9C'};
export const metroColor=(value)=>{const t=String(value||'').toUpperCase();for(const k of Object.keys(METRO_LINE_COLORS))if(t.includes(k))return METRO_LINE_COLORS[k];return '#1F3D36';};

export const isHex=(v:unknown):v is string=>/^#[0-9a-f]{6}$/i.test(String(v||''));
type FleetLike={id?:string|null;licensePlate?:string|null;vehicleLabel?:string|null;vehicleId?:string|null;serviceColor?:string|null;serviceType?:string|null;busType?:string|null;routeShortName?:string|null;routeId?:string|null;routeName?:string|null;routeColor?:string|null};
const fleetIdentity=(v:FleetLike)=>{
  const ids=[v?.id,v?.vehicleId,v?.licensePlate,v?.vehicleLabel].map(x=>String(x||'').toUpperCase().replace(/[-_\s]/g,''));
  return ids.find(x=>/^(DL51EV|DL51GD|DL1PD|DL1PE|DL1PB|DL1PC)/.test(x))||'';
};
export const vehicleFleetKind=(v:FleetLike)=>{
  const id=fleetIdentity(v);
  if(id.startsWith('DL51EV'))return 'ev-ac';
  if(id.startsWith('DL51GD'))return 'ev-devi';
  if(id.startsWith('DL1PB')||id.startsWith('DL1PC')||id.startsWith('DL1PD'))return 'cng-nonac';
  if(id.startsWith('DL1PE'))return 'cng-ac';
  const t=String(v?.busType||'').trim().toUpperCase();
  if(t.startsWith('EV DEVI'))return 'ev-devi';
  if(t.startsWith('EV AC'))return 'ev-ac';
  if(t.startsWith('CNG NONAC')||t.startsWith('CNG NON-AC'))return 'cng-nonac';
  if(t.startsWith('CNG AC'))return 'cng-ac';
  if(v?.serviceType==='electric')return 'ev-ac';
  if(v?.serviceType==='dtc')return 'cng-ac';
  return 'unknown';
};
export const busColor=(v:FleetLike,route?:unknown)=>{
  // Known vehicle identities override stale cached API colours.
  const id=fleetIdentity(v);
  if(id.startsWith('DL51EV'))return SERVICE_COLORS.electricAc;
  if(id.startsWith('DL51GD'))return SERVICE_COLORS.electricDevi;
  if(id.startsWith('DL1PB')||id.startsWith('DL1PC')||id.startsWith('DL1PD'))return SERVICE_COLORS.cngNonAc;
  if(id.startsWith('DL1PE'))return SERVICE_COLORS.cngAc;
  const t=String(v?.busType||'').trim().toUpperCase();
  if(t.startsWith('EV DEVI'))return SERVICE_COLORS.electricDevi;
  if(t.startsWith('EV AC'))return SERVICE_COLORS.electricAc;
  if(t.startsWith('CNG NONAC')||t.startsWith('CNG NON-AC'))return SERVICE_COLORS.cngNonAc;
  if(t.startsWith('CNG AC'))return SERVICE_COLORS.cngAc;
  const service=String(v?.serviceColor||'').trim();
  if(isHex(service))return service;
  if(v?.serviceType==='electric')return SERVICE_COLORS.electricAc;
  if(v?.serviceType==='dtc')return SERVICE_COLORS.cngAc;
  const routeFallback=String(v?.routeColor||'').trim();
  if(isHex(routeFallback))return routeFallback;
  return SERVICE_COLORS.unknown;
};
export const textOn=(bg:string)=>{const h=bg.replace('#','');const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]>.179?'#14211B':'#FFFFFF'};

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