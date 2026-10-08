export type RouteColor = { background: string; text: string };
const FALLBACKS: RouteColor[]=[{background:'#3D82CE',text:'#FFFFFF'}];
function validHex(value:string|null|undefined):string|null{const v=String(value??'').trim().replace(/^#/,'');return /^[0-9a-f]{6}$/i.test(v)?'#'+v.toUpperCase():null;}
function contrastText(background:string):string{const h=background.slice(1);const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);const lin=rgb.map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);const y=.2126*lin[0]+.7152*lin[1]+.0722*lin[2];return y>.55?'#17312F':'#FFFFFF';}
export function resolveRouteColor(routeName:string|null|undefined,routeColor?:string|null,routeTextColor?:string|null):RouteColor{const v=validHex(routeColor);if(v)return{background:v,text:validHex(routeTextColor)||contrastText(v)};const key=String(routeName??'BUS').trim().toUpperCase();let hash=0;for(const ch of key)hash=((hash<<5)-hash+ch.charCodeAt(0))|0;return FALLBACKS[Math.abs(hash)%FALLBACKS.length];}
