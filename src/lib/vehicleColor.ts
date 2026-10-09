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
export function legendBusColor(apiColor:string|null|undefined,busType:string|null|undefined):string{
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

const legendCategories=[
  {key:'ev-ac',label:'EV AC (12 mtr)',matches:(type:string)=>type.startsWith('EV AC')},
  {key:'ev-devi',label:'EV DEVI AC (9 mtr)',matches:(type:string)=>type.startsWith('EV DEVI')},
  {key:'cng-ac',label:'CNG AC (12 mtr)',matches:(type:string)=>type.startsWith('CNG AC')},
  {key:'cng-nonac',label:'CNG NonAC (12 mtr)',matches:(type:string)=>type.startsWith('CNG NONAC')||type.startsWith('CNG NON-AC')}
] as const;

export function apiFleetLegendRows(vehicles:ApiVehicleColor[]){
  const tallies=new Map<string,Map<string,number>>();
  for(const vehicle of vehicles){
    const type=String(vehicle.busType||'').trim().toUpperCase();
    const category=legendCategories.find(item=>item.matches(type));
    const color=validApiColor(vehicle.serviceColor);
    if(!category||!color)continue;
    const colors=tallies.get(category.key)||new Map<string,number>();
    colors.set(color,(colors.get(color)||0)+1);
    tallies.set(category.key,colors);
  }
  return legendCategories.map(category=>{
    const colors=[...(tallies.get(category.key)||new Map<string,number>())].sort((a,b)=>b[1]-a[1]);
    return colors.length?{key:category.key,label:category.label,color:colors[0][0]}:null;
  }).filter((row):row is {key:string;label:string;color:string}=>row!==null);
}

export function resolveVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):VehicleColor{
  const apiColor=validApiColor(v.serviceColor);
  const color=apiColor?legendBusColor(apiColor,v.busType):null;
  return color
    ?{background:color,text:textFor(color)}
    :{background:'transparent',text:'#14211B'};
}