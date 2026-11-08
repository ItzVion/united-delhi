import type { Vehicle, Arrival } from '../api/client';

export type VehicleColor={background:string;text:string};
type ApiVehicleColor={
  serviceColor?:string|null;
  fleetColorSource?:string|null;
  operatorType?:'dtc'|'cluster'|'unknown'|null;
};
const UNKNOWN_BUS_MARKER_COLOR='#64748B';
export const BUS_OPERATOR_MARKER_COLORS={
  DTC:'#15803D',
  DIMTS:'#EA580C'
} as const;

function validApiColor(value:string|null|undefined):string|null{
  const color=String(value??'').trim();
  return /^#[0-9a-f]{6}$/i.test(color)?color:null;
}
function evidencedColor(v:ApiVehicleColor):string|null{
  const source=String(v.fleetColorSource||'');
  if(source!=='upstream-api'&&source!=='verified-livery-record')return null;
  return validApiColor(v.serviceColor);
}
function operatorColor(operatorType:ApiVehicleColor['operatorType']):string|null{
  const operator=String(operatorType||'').toLowerCase();
  if(operator==='dtc')return BUS_OPERATOR_MARKER_COLORS.DTC;
  if(operator==='cluster')return BUS_OPERATOR_MARKER_COLORS.DIMTS;
  return null;
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
  const colour=evidencedColor(v as ApiVehicleColor);
  const operator=operatorColor((v as ApiVehicleColor).operatorType);
  const background=colour||operator||UNKNOWN_BUS_MARKER_COLOR;
  return {background,text:textFor(background)};
}
