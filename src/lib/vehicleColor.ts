import type { Vehicle, Arrival } from '../api/client';

export type VehicleColor={background:string;text:string};

const COLORS={
  evAc:'#0E7490',
  evDevi:'#16A34A',
  cngAc:'#1D4ED8',
  cngNonAc:'#F97316',
  unknown:'#64748B'
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
  return y>.179?'#17313B':'#FFFFFF';
}

export function resolveVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):VehicleColor{
  const direct=validHex(v.serviceColor);
  if((v as any).fleetColorSource==='registry'&&direct)return{background:direct,text:textFor(direct)};
  // Prefix inference is only a fallback when there is no exact registry row. DL1PD/PB/PC are part of the orange Non-AC fleet.
  const ids=[(v as any).id,(v as any).vehicleId,(v as any).licensePlate,(v as any).vehicleLabel]
    .map(x=>String(x??'').toUpperCase().replace(/[-_\\s]/g,''));
  const id=ids.find(x=>/^(DL51EV|DL51GD|DL1PD|DL1PE|DL1PB|DL1PC)/.test(x))||'';
  if(id.startsWith('DL51EV'))return{background:COLORS.evAc,text:textFor(COLORS.evAc)};
  if(id.startsWith('DL51GD'))return{background:COLORS.evDevi,text:textFor(COLORS.evDevi)};
  if(id.startsWith('DL1PB')||id.startsWith('DL1PC')||id.startsWith('DL1PD'))return{background:COLORS.cngNonAc,text:textFor(COLORS.cngNonAc)};
  if(id.startsWith('DL1PE'))return{background:COLORS.cngAc,text:textFor(COLORS.cngAc)};

  const busType=String((v as any).busType||'').trim().toUpperCase();
  if(busType.startsWith('EV DEVI'))return{background:COLORS.evDevi,text:textFor(COLORS.evDevi)};
  if(busType.startsWith('EV AC'))return{background:COLORS.evAc,text:textFor(COLORS.evAc)};
  if(busType.startsWith('CNG NONAC')||busType.startsWith('CNG NON-AC'))return{background:COLORS.cngNonAc,text:textFor(COLORS.cngNonAc)};
  if(busType.startsWith('CNG AC'))return{background:COLORS.cngAc,text:textFor(COLORS.cngAc)};

  if(v.serviceType==='electric')return{background:COLORS.evAc,text:textFor(COLORS.evAc)};
  if(v.serviceType==='dtc')return{background:COLORS.cngAc,text:textFor(COLORS.cngAc)};
  const route=validHex(v.routeColor);
  if(route)return{background:route,text:textFor(route)};
  return{background:COLORS.unknown,text:'#FFFFFF'};
}
