export type RouteColor = { background: string; text: string };

function validHex(value:string|null|undefined):string|null{
  const v=String(value??'').trim().replace(/^#/,'');
  return /^[0-9a-f]{6}$/i.test(v)?'#'+v.toUpperCase():null;
}
function contrastText(background:string):string{
  const h=background.slice(1);
  const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const lin=rgb.map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);
  const y=.2126*lin[0]+.7152*lin[1]+.0722*lin[2];
  return y>.179?'#17312F':'#FFFFFF';
}
export function resolveRouteColor(_routeName:string|null|undefined,routeColor?:string|null,routeTextColor?:string|null):RouteColor{
  const background=validHex(routeColor);
  if(!background)return{background:'transparent',text:'#14211B'};
  return{background,text:validHex(routeTextColor)||contrastText(background)};
}
