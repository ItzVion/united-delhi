import type { Vehicle, Arrival } from '../api/client';

export type VehicleColor={background:string;text:string};
type ApiVehicleColor={serviceColor?:string|null;busType?:string|null;fleetColorSource?:string|null};

function validApiColor(value:string|null|undefined):string|null{
  const color=String(value??'').trim();
  return /^#[0-9a-f]{6}$/i.test(color)?color:null;
}

function textFor(bg:string){
  const h=bg.slice(1);
  const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const lin=rgb.map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);
  const y=.2126*lin[0]+.7152*lin[1]+.0722*lin[2];
  return y>.179?'#17313B':'#FFFFFF';
}
export function fleetLegendRows(vehicles:ApiVehicleColor[]){
  const counts=new Map<string,{color:string;source:'upstream-api'|'verified-livery-record'|'estimated-fleet-type';count:number}>();
  for(const vehicle of vehicles){
    const color=validApiColor(vehicle.serviceColor);
    if(!color)continue;
    const raw=vehicle.fleetColorSource||'upstream-api';
    if(raw!=='upstream-api'&&raw!=='verified-livery-record'&&raw!=='estimated-fleet-type')continue;
    const source=raw as 'upstream-api'|'verified-livery-record'|'estimated-fleet-type';
    const key=source+':'+color.toUpperCase(),previous=counts.get(key);
    if(previous)previous.count++;
    else counts.set(key,{color:color.toUpperCase(),source,count:1});
  }
  const labels={'upstream-api':'API','verified-livery-record':'Reviewed','estimated-fleet-type':'Estimated'};
  return [...counts.values()]
    .sort((a,b)=>a.source.localeCompare(b.source)||b.count-a.count||a.color.localeCompare(b.color))
    .map(row=>({key:row.source+':'+row.color,label:labels[row.source]+' · '+row.color+' ('+row.count+')',color:row.color,source:row.source}));
}

export function hasApiVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):boolean{
  const source=String((v as any).fleetColorSource||'');
  return validApiColor(v.serviceColor)!==null&&(!source||source==='upstream-api');
}

export function hasEvidenceBackedVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):boolean{
  const source=String((v as any).fleetColorSource||'');
  return validApiColor(v.serviceColor)!==null&&(!source||source==='upstream-api'||source==='verified-livery-record');
}

export function hasEstimatedVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):boolean{
  return String((v as any).fleetColorSource||'')==='estimated-fleet-type'&&validApiColor(v.serviceColor)!==null;
}

export function resolveVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):VehicleColor{
  const color=validApiColor(v.serviceColor);
  return color
    ?{background:color,text:textFor(color)}
    :{background:'#64748B',text:textFor('#64748B')};
}