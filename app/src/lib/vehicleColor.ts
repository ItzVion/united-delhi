import type { Vehicle, Arrival } from '../api/client';
export type VehicleColor={background:string;text:string};
type Input={busType?:string|null;operatorType?:'dtc'|'cluster'|'unknown'|null};
export const UNKNOWN_BUS_MARKER_COLOR='#64748B';
export const BUS_CATEGORY_MARKER_COLORS={EV_AC_12:'#56B8C2',EV_DEVI_DTC:'#43B783',EV_DEVI_CLUSTER:'#E9874B',CNG_AC_DTC:'#D96878',CNG_AC_CLUSTER:'#477CC5',CNG_NON_AC_DTC:'#4DB98B',CNG_NON_AC_CLUSTER:'#DDA174'} as const;
export const BUS_TYPE_COLOR_LEGEND=[
 {key:'ev-ac-12',label:'EV AC (12 mtr)',shortLabel:'EV AC 12m',colors:[BUS_CATEGORY_MARKER_COLORS.EV_AC_12]},
 {key:'ev-devi-ac-9',label:'EV DEVI AC (9 mtr)',shortLabel:'EV DEVI',colors:[BUS_CATEGORY_MARKER_COLORS.EV_DEVI_CLUSTER,BUS_CATEGORY_MARKER_COLORS.EV_DEVI_DTC]},
 {key:'cng-ac-12',label:'CNG AC (12 mtr)',shortLabel:'CNG AC',colors:[BUS_CATEGORY_MARKER_COLORS.CNG_AC_CLUSTER,BUS_CATEGORY_MARKER_COLORS.CNG_AC_DTC]},
 {key:'cng-non-ac-12',label:'CNG NonAC (12 mtr)',shortLabel:'CNG NonAC',colors:[BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC_CLUSTER,BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC_DTC]}
] as const;
export function resolveFleetCategoryColor(operatorType:Input['operatorType'],busType:Input['busType']):string|null{
 const operator=String(operatorType||'').trim().toLowerCase();
 const type=String(busType||'').trim().toUpperCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
 if(/\bEV\b/.test(type)&&/\bDEVI\b/.test(type)&&/\bAC\b/.test(type)&&/\b9\s*MTR\b/.test(type)){if(operator==='dtc')return BUS_CATEGORY_MARKER_COLORS.EV_DEVI_DTC;if(operator==='cluster')return BUS_CATEGORY_MARKER_COLORS.EV_DEVI_CLUSTER;return null;}
 if(/\bEV\b/.test(type)&&/\bAC\b/.test(type)&&/\b12\s*MTR\b/.test(type)&&!/\bDEVI\b/.test(type))return BUS_CATEGORY_MARKER_COLORS.EV_AC_12;
 if(/\bCNG\b/.test(type)&&/\b(?:NON\s*AC|NONAC)\b/.test(type)&&/\b12\s*MTR\b/.test(type)){if(operator==='dtc')return BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC_DTC;if(operator==='cluster')return BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC_CLUSTER;return null;}
 if(/\bCNG\b/.test(type)&&/\bAC\b/.test(type)&&/\b12\s*MTR\b/.test(type)){if(operator==='dtc')return BUS_CATEGORY_MARKER_COLORS.CNG_AC_DTC;if(operator==='cluster')return BUS_CATEGORY_MARKER_COLORS.CNG_AC_CLUSTER;return null;}
 return null;
}
export function hasKnownBusCategory(v:Partial<Vehicle>|Partial<Arrival>):boolean{return resolveFleetCategoryColor(v.operatorType,v.busType)!==null;}
function textFor(bg:string){const h=bg.slice(1),rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255),lin=rgb.map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);return .2126*lin[0]+.7152*lin[1]+.0722*lin[2]>.179?'#17313B':'#FFFFFF';}
export function resolveVehicleColor(v:Partial<Vehicle>|Partial<Arrival>):VehicleColor{const background=resolveFleetCategoryColor(v.operatorType,v.busType)||UNKNOWN_BUS_MARKER_COLOR;return{background,text:textFor(background)};}
