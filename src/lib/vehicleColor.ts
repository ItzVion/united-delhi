import type { Vehicle, Arrival } from '../api/client';

export type VehicleColor={background:string;text:string};

const COLORS={
  evAc:'#2FAFBC',
  evDevi:'#168F49',
  cngAc:'#3D82CE',
  cngNonAc:'#E5A16E',
  unknown:'#8B959B'
} as const;

function validHex(value:string|null|undefined):string|null{
  const v=String(value??'').trim().replace(/^#/,'');
  return /^[0-9a-f]{6}$/i.test(v)?'#'+v.toUpperCase():null;
}

function textFor(bg:string){
  const h=bg.slice(1);
  const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const lin=rgb.map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);
  const y=.2126*lin[0]+.7152*lin[1]+.0722*lin[2];
  return y>.55?'#17313B':'#FFFFFF';
}

export function resolveVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):VehicleColor{
  const direct=validHex(v.serviceColor);
  if(direct)return{background:direct,text:textFor(direct)};

  const busType=String((v as any).busType||'').trim().toUpperCase();
  if(busType.startsWith('EV AC'))return{background:COLORS.evAc,text:textFor(COLORS.evAc)};
  if(busType.startsWith('EV DEVI'))return{background:COLORS.evDevi,text:'#FFFFFF'};
  if(busType.startsWith('CNG AC'))return{background:COLORS.cngAc,text:'#FFFFFF'};
  if(busType.startsWith('CNG NONAC'))return{background:COLORS.cngNonAc,text:textFor(COLORS.cngNonAc)};

  if(v.serviceType==='electric')return{background:COLORS.evAc,text:textFor(COLORS.evAc)};
  if(v.serviceType==='cluster')return{background:COLORS.cngNonAc,text:textFor(COLORS.cngNonAc)};
  if(v.serviceType==='dtc')return{background:COLORS.cngAc,text:'#FFFFFF'};

  const id=String((v as any).id||(v as any).vehicleId||(v as any).licensePlate||'').toUpperCase().replace(/[-_\s]/g,'');
  if(id.startsWith('DL51EV'))return{background:COLORS.evAc,text:textFor(COLORS.evAc)};
  if(id.startsWith('DL51GD'))return{background:COLORS.evDevi,text:'#FFFFFF'};
  if(id.startsWith('DL1PD')||id.startsWith('DL1PE'))return{background:COLORS.cngAc,text:'#FFFFFF'};
  if(id.startsWith('DL1PB')||id.startsWith('DL1PC'))return{background:COLORS.cngNonAc,text:textFor(COLORS.cngNonAc)};

  const route=validHex(v.routeColor);
  if(route)return{background:route,text:textFor(route)};
  return{background:COLORS.unknown,text:'#FFFFFF'};
}
