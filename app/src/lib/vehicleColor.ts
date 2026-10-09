import type { Vehicle, Arrival } from '../api/client';

export type VehicleColor={background:string;text:string};
type ApiVehicleColor={serviceColor?:string|null;busType?:string|null};

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
export function apiFleetLegendRows(vehicles:ApiVehicleColor[]){
  const counts=new Map<string,number>();
  for(const vehicle of vehicles){
    const color=validApiColor(vehicle.serviceColor);
    if(!color)continue;
    const key=color.toUpperCase();
    counts.set(key,(counts.get(key)||0)+1);
  }
  return [...counts.entries()]
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .map(([color,count])=>({key:color,label:color+' ('+count+')',color}));
}

export function hasApiVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):boolean{
  return validApiColor(v.serviceColor)!==null;
}

export function resolveVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):VehicleColor{
  const color=validApiColor(v.serviceColor);
  return color
    ?{background:color,text:textFor(color)}
    :{background:'#64748B',text:textFor('#64748B')};
}