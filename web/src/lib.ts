import type {Vehicle} from './api';

export type Point={lat:number;lon:number};
export type Page={kind:'home'|'plan'|'metro'|'settings'|'hub'|'help'|'legal'|'privacy'|'terms'|'about'|'route'|'stop'|'metroRoute';id?:string};

export const CENTER:[number,number]=[28.6139,77.209];
export const BOUNDS:[[number,number],[number,number]]=[[28.40,76.84],[28.88,77.35]];

export const storageGet=(k:string)=>{try{return window.localStorage.getItem(k)}catch{return null}};
export const storageSet=(k:string,v:string)=>{try{window.localStorage.setItem(k,v);return true}catch{return false}};

export const METRO_LINE_COLORS={RED:'#D83B3B',YELLOW:'#E5B12C',BLUE:'#2F63B7',GREEN:'#2F9B62',VIOLET:'#7A4FB5',MAGENTA:'#B044A6',PINK:'#D65A9A',ORANGE:'#E06B2C',GRAY:'#6B7280',RAPID:'#3A8D8D',AQUA:'#159A9C'};
export const metroColor=(value)=>{const t=String(value||'').toUpperCase();for(const k of Object.keys(METRO_LINE_COLORS))if(t.includes(k))return METRO_LINE_COLORS[k];return '#1F3D36';};

export const isHex=(v:unknown):v is string=>/^#[0-9a-f]{6}$/i.test(String(v||''));
// Match API colours to the reference legend by shade only. Never change hue families.
const LEGEND_BUS_SWATCHES:{match:(type:string)=>boolean;colors:string[]}[]=[
 {match:type=>type.startsWith('EV AC'),colors:['#54C4D8']},
 {match:type=>type.startsWith('EV DEVI'),colors:['#FF7F21','#219653']},
 {match:type=>type.startsWith('CNG AC'),colors:['#2F80ED','#EB4B4B']},
 {match:type=>type.startsWith('CNG NONAC')||type.startsWith('CNG NON-AC'),colors:['#F2A76D','#62E099']}
];
function colorHue(hex:string):number|null{
 const h=hex.replace('#','');
 const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
 if(delta<0.08)return null;
 let hue=max===r?60*(((g-b)/delta)%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);
 return (hue+360)%360;
}
function hueDistance(a:number,b:number){const d=Math.abs(a-b);return Math.min(d,360-d)}
function legendBusColor(apiColor:string|null|undefined,busType:string|null|undefined):string{
 const color=String(apiColor??'').trim();
 if(!/^#[0-9a-f]{6}$/i.test(color))return color;
 const type=String(busType??'').trim().toUpperCase();
 const category=LEGEND_BUS_SWATCHES.find(row=>row.match(type));
 if(!category)return color;
 const hue=colorHue(color);
 if(hue===null)return color;
 let closest:{color:string;distance:number}|null=null;
 for(const swatch of category.colors){
  const swatchHue=colorHue(swatch);
  if(swatchHue===null)continue;
  const distance=hueDistance(hue,swatchHue);
  if(!closest||distance<closest.distance)closest={color:swatch,distance};
 }
 // If API hue disagrees with the type's legend palette, trust the API exactly.
 return closest&&closest.distance<=24?closest.color:color;
}
// Keep API colour authoritative. Only tune shade to a nearby legend swatch; never swap hue families.
export const busColor=(v:{serviceColor?:string|null;busType?:string|null})=>{
  const color=String(v?.serviceColor||'').trim();
  return isHex(color)?legendBusColor(color,v?.busType):'transparent';
};
export const textOn=(bg:string)=>{if(!isHex(bg))return '#14211B';const h=bg.replace('#','');const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]>.179?'#14211B':'#FFFFFF'};

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