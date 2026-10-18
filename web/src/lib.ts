import type {Vehicle} from './api';

export type Point={lat:number;lon:number};
export type Page={kind:'home'|'plan'|'metro'|'settings'|'hub'|'help'|'legal'|'privacy'|'terms'|'about'|'route'|'stop'|'metroRoute';id?:string};

export const CENTER:[number,number]=[28.6139,77.209];
export const BOUNDS:[[number,number],[number,number]]=[[28.40,76.84],[28.88,77.35]];
export const roundCoordinate=(value:number,decimalPlaces:number)=>{
  const scale=10**decimalPlaces;
  return Math.round(value*scale)/scale;
};

export const storageGet=(k:string)=>{try{return window.localStorage.getItem(k)}catch{return null}};
export const storageSet=(k:string,v:string)=>{try{window.localStorage.setItem(k,v);return true}catch{return false}};

export const METRO_LINE_COLORS={RED:'#D83B3B',YELLOW:'#E5B12C',BLUE:'#2F63B7',GREEN:'#2F9B62',VIOLET:'#7A4FB5',MAGENTA:'#B044A6',PINK:'#D65A9A',ORANGE:'#E06B2C',GRAY:'#6B7280',RAPID:'#3A8D8D',AQUA:'#159A9C'};
export const metroColor=(value)=>{const t=String(value||'').toUpperCase();for(const k of Object.keys(METRO_LINE_COLORS))if(t.includes(k))return METRO_LINE_COLORS[k];return '#1F3D36';};

export const isHex=(v:unknown):v is string=>/^#[0-9a-f]{6}$/i.test(String(v||''));
// Only exact upstream per-vehicle colours and reviewed livery evidence may colour a bus.
// Fleet type, route colour and registration-based guesses are not paint evidence.
export const UNKNOWN_BUS_MARKER_COLOR='#64748B';
export const busColor=(v:{serviceColor?:string|null;busType?:string|null;fleetColorSource?:string|null})=>{
  const source=String(v?.fleetColorSource||'');
  if(source!=='upstream-api'&&source!=='verified-livery-record')return UNKNOWN_BUS_MARKER_COLOR;
  const color=String(v?.serviceColor??'').trim();
  return isHex(color)?color:UNKNOWN_BUS_MARKER_COLOR;
};

// These colours are for visual route distinction only, never evidence of physical bus paint.
export const ROUTE_MARKER_PALETTE=[
  '#2563EB','#0F766E','#C2410C','#7E22CE','#BE123C','#047857',
  '#A16207','#0369A1','#6D28D9','#B91C1C','#0E7490','#4D7C0F'
] as const;
type BusMarkerInput={
  id?:string|null;routeId?:string|null;routeShortName?:string|null;routeColor?:string|null;
  serviceColor?:string|null;fleetColorSource?:string|null;busType?:string|null;
};
const verifiedVehicleColour=(v:BusMarkerInput)=>{
  const source=String(v?.fleetColorSource||'');
  const colour=String(v?.serviceColor??'').trim();
  return (source==='upstream-api'||source==='verified-livery-record')&&isHex(colour)?colour:null;
};
export const BUS_CATEGORY_MARKER_COLORS={
  CNG_NON_AC:'#FDBA74', // light orange
  CNG_AC:'#0077B6', // Blue Whale blue
  EV_DEVI_AC:'#90EE90' // light green
} as const;
export function defaultBusCategoryColor(busType?:string|null):string|null{
  const type=String(busType||'').trim().toUpperCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  if(/\bEV\b/.test(type)&&/\bDEVI\b/.test(type)&&/\bAC\b/.test(type))return BUS_CATEGORY_MARKER_COLORS.EV_DEVI_AC;
  if(/\bCNG\b/.test(type)&&/\bNON\s*AC\b/.test(type))return BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC;
  if(/\bCNG\b/.test(type)&&/\bAC\b/.test(type))return BUS_CATEGORY_MARKER_COLORS.CNG_AC;
  return null;
}
export type BusMarkerKind='physical'|'category-default'|'route'|'distinctive';
export function routeCategoryColor(routeId?:string|null,routeShortName?:string|null):string|null{
  const candidates=[routeShortName,routeId].map(value=>String(value??'').trim().toUpperCase()).filter(Boolean);
  const isCngNonAcRoute=candidates.some(value=>
    /^(?:ROUTE\s*[:#-]?\s*)?(?:D[-\s]?)?0*(?:801STL|801)(?=$|[\s\-_/|:])/i.test(value)
  );
  if(isCngNonAcRoute)return BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC;
  const isCngAcRoute=candidates.some(value=>
    /^(?:ROUTE\s*[:#-]?\s*)?(?:D[-\s]?)?0*(?:772|741)(?=$|[\s\-_/|:])/i.test(value)
  );
  return isCngAcRoute?BUS_CATEGORY_MARKER_COLORS.CNG_AC:null;
}
export const busMarkerKind=(v:BusMarkerInput):BusMarkerKind=>{
  if(verifiedVehicleColour(v))return 'physical';
  if(routeCategoryColor(v.routeId,v.routeShortName))return 'category-default';
  if(defaultBusCategoryColor(v.busType))return 'category-default';
  if(isHex(v?.routeColor))return 'route';
  return 'distinctive';
};
export const busMarkerColor=(v:BusMarkerInput)=>{
  const physical=verifiedVehicleColour(v);
  if(physical)return physical;
  const routeCategory=routeCategoryColor(v.routeId,v.routeShortName);
  if(routeCategory)return routeCategory;
  const category=defaultBusCategoryColor(v.busType);
  if(category)return category;
  const route=String(v?.routeColor??'').trim();
  if(isHex(route))return route;
  // Stable FNV-1a hash means the same route keeps its marker colour across refreshes.
  const key=String(v?.routeId||v?.routeShortName||v?.id||'unassigned').trim().toUpperCase();
  let hash=2166136261;
  for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return ROUTE_MARKER_PALETTE[(hash>>>0)%ROUTE_MARKER_PALETTE.length];
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

const normaliseSearchText=(value:unknown)=>String(value??'').normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

/**
 * Rank route and stop suggestions by how closely they match the typed query.
 * Exact route-number matches always win over partial route names, independent
 * of the order returned by the API. Original order is retained for ties.
 */
export function rankSearchResults<T extends {
  id?:unknown;label?:unknown;type?:unknown;long_name?:unknown;longName?:unknown;
  fromStop?:unknown;toStop?:unknown;
}>(results:T[],query:string):T[]{
  const term=normaliseSearchText(query);
  if(!term)return [...results];
  const score=(item:T):number=>{
    const label=normaliseSearchText(item.label);
    const id=normaliseSearchText(item.id);
    const isRoute=item.type==='route';
    const routeLabel=normaliseSearchText(routeName(item.label)||'');
    const routeId=normaliseSearchText(routeName(item.id)||'');
    if(label===term||(!isRoute&&id===term))return 0;
    if(isRoute&&(routeLabel===term||routeId===term))return 0;
    if(label.startsWith(term)||(isRoute&&(routeLabel.startsWith(term)||routeId.startsWith(term))))return 1;
    if(id.startsWith(term)||label.includes(term)||(isRoute&&(routeLabel.includes(term)||routeId.includes(term))))return 2;
    const context=[item.long_name,item.longName,item.fromStop,item.toStop].map(normaliseSearchText);
    if(context.some(value=>value===term))return 3;
    if(context.some(value=>value.startsWith(term)))return 4;
    if(context.some(value=>value.includes(term)))return 5;
    return 6;
  };
  return results.map((item,index)=>({item,index,rank:score(item)}))
    .sort((a,b)=>a.rank-b.rank||a.index-b.index)
    .map(entry=>entry.item);
}

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
