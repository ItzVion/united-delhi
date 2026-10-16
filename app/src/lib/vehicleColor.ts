import type { Vehicle, Arrival } from '../api/client';

export type VehicleColor={background:string;text:string};
type ApiVehicleColor={serviceColor?:string|null;busType?:string|null;fleetColorSource?:string|null};
const UNKNOWN_BUS_MARKER_COLOR='#64748B';
// Display defaults by service category; these are not claims about verified physical paint.
export const BUS_CATEGORY_MARKER_COLORS={
  CNG_NON_AC:'#FDBA74', // light orange
  CNG_AC:'#0077B6', // Blue Whale blue
  EV_DEVI_AC:'#90EE90' // light green
} as const;
export function defaultBusCategoryColor(busType:string|null|undefined):string|null{
  const type=String(busType||'').trim().toUpperCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  if(/\bEV\b/.test(type)&&/\bDEVI\b/.test(type)&&/\bAC\b/.test(type))return BUS_CATEGORY_MARKER_COLORS.EV_DEVI_AC;
  if(/\bCNG\b/.test(type)&&/\bNON\s*AC\b/.test(type))return BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC;
  if(/\bCNG\b/.test(type)&&/\bAC\b/.test(type))return BUS_CATEGORY_MARKER_COLORS.CNG_AC;
  return null;
}

function validApiColor(value:string|null|undefined):string|null{
  const color=String(value??'').trim();
  return /^#[0-9a-f]{6}$/i.test(color)?color:null;
}
function evidencedColor(v:ApiVehicleColor):string|null{
  const source=String(v.fleetColorSource||'');
  if(source!=='upstream-api'&&source!=='verified-livery-record')return null;
  return validApiColor(v.serviceColor);
}
function textFor(bg:string){
  const h=bg.slice(1);
  const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const lin=rgb.map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);
  const y=.2126*lin[0]+.7152*lin[1]+.0722*lin[2];
  return y>.179?'#17313B':'#FFFFFF';
}
export function fleetLegendRows(vehicles:ApiVehicleColor[]){
  const counts=new Map<string,{color:string;source:'upstream-api'|'verified-livery-record';count:number}>();
  for(const vehicle of vehicles){
    const color=evidencedColor(vehicle);
    if(!color)continue;
    const source=String(vehicle.fleetColorSource) as 'upstream-api'|'verified-livery-record';
    const key=source+':'+color.toUpperCase(),previous=counts.get(key);
    if(previous)previous.count++;
    else counts.set(key,{color:color.toUpperCase(),source,count:1});
  }
  const labels={'upstream-api':'Live API','verified-livery-record':'Reviewed'};
  return [...counts.values()]
    .sort((a,b)=>a.source.localeCompare(b.source)||b.count-a.count||a.color.localeCompare(b.color))
    .map(row=>({key:row.source+':'+row.color,label:labels[row.source]+' · '+row.color+' ('+row.count+')',color:row.color,source:row.source}));
}
export function hasApiVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):boolean{
  return String((v as any).fleetColorSource||'')==='upstream-api'&&validApiColor(v.serviceColor)!==null;
}
export function hasEvidenceBackedVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):boolean{
  return evidencedColor(v as ApiVehicleColor)!==null;
}
export function resolveVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):VehicleColor{
  const color=evidencedColor(v as ApiVehicleColor);
  const categoryColor=defaultBusCategoryColor(v.busType);
  const background=color||categoryColor||UNKNOWN_BUS_MARKER_COLOR;
  return {background,text:textFor(background)};
}
