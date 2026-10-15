import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {api} from '../api';
import type {Vehicle} from '../api';
import {busColor,dist,routeName,fullRouteName,secText,storageGet,storageSet,metroColor} from '../lib';
import type {Go} from '../lib';
import {Empty,ErrorState,Icon,Loading,RouteBadge,TopBar} from './ui';
import RouteMap from './RouteMap';
import {LEGAL} from './legal';

type Svc=Map<string,Vehicle>;const fleetSummary=(buses:Vehicle[])=>{const m=new Map<string,number>();for(const v of buses){const k=v.busType||'Unknown';m.set(k,(m.get(k)||0)+1)}const e=[...m.entries()].sort((a,b)=>b[1]-a[1]);return{label:e.length>1?'Mixed fleet':e[0]?.[0]||'Unknown',vehicle:e.length?buses.find(v=>v.busType===e[0][0])||buses[0]||null:null}};
function useLoad<T>(fn:()=>Promise<T>,deps:any[],every=0){
 const dataRef=useRef<T|null>(null);const[data,setData]=useState<T|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(true),[at,setAt]=useState<Date|null>(null);
 const generationRef=useRef(0),inFlightRef=useRef(false),pendingRef=useRef<{silent:boolean;generation:number}|null>(null),runRef=useRef<(silent?:boolean,generation?:number)=>Promise<void>>(async()=>{});
 const run=useCallback(async(silent=false,generation=generationRef.current)=>{
  if(generation!==generationRef.current)return;
  if(inFlightRef.current){pendingRef.current={silent,generation};return;}
  inFlightRef.current=true;
  if(!silent){setBusy(true);setErr('');}
  try{
   const d=await fn();
   if(generation===generationRef.current){dataRef.current=d;setData(d);setAt(new Date());setErr('');}
  }catch(e){
   if(generation===generationRef.current&&(!silent||!dataRef.current))setErr((e as Error).message||'Could not load.');
  }finally{
   inFlightRef.current=false;
   if(generation===generationRef.current)setBusy(false);
   const pending=pendingRef.current;
   if(pending){pendingRef.current=null;window.setTimeout(()=>void runRef.current(pending.silent,generationRef.current),0);}
  }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },deps);
 runRef.current=run;
 useEffect(()=>{
  const generation=++generationRef.current;
  pendingRef.current=null;dataRef.current=null;setData(null);setBusy(true);setErr('');setAt(null);
  void runRef.current(false,generation);
  const id=every?window.setInterval(()=>{if(!document.hidden)void runRef.current(true,generation)},every):null;
  return()=>{if(generationRef.current===generation)generationRef.current++;pendingRef.current=null;if(id!==null)window.clearInterval(id);};
 },[run,every]);
 return{data,err,busy,at,reload:()=>run()};
}
export function RoutePage({id,go,services}:{id:string;go:Go;services:Svc}){
 const{data,err,busy,reload}=useLoad(()=>api.route(id),[id],15000);
 if(busy&&!data)return <div className="page"><TopBar title="Route" go={go}/><Loading text="Loading route…"/></div>;
 if(err&&!data)return <div className="page"><TopBar title="Route" go={go}/><ErrorState text={err} onRetry={reload}/></div>;
 const route=data?.route||{},stops:any[]=Array.isArray(data?.stops)?data.stops:[],buses:Vehicle[]=Array.isArray(data?.vehicles)?data.vehicles:[],name=fullRouteName(route.long_name)||routeName(route.short_name)||route.short_name||'Bus route',from=route.from_stop||route.fromStop||stops[0]?.name,to=route.to_stop||route.toStop||stops[stops.length-1]?.name;
 return <div className="page route-page"><TopBar title={String(routeName(route.short_name)||route.short_name||name)} sub={from&&to?from+' → '+to:undefined} go={go}/><div className="route-top"><RouteMap stops={stops} buses={buses} onStop={sid=>go('/stops/'+encodeURIComponent(sid))}/></div><div className="stats"><div><b>{stops.length}</b><small>stops</small></div><div><b>{buses.length}</b><small>live buses</small></div><div><b className="svc"><i style={{background:fleetSummary(buses).vehicle?busColor(fleetSummary(buses).vehicle):'#6B7280'}}/>{fleetSummary(buses).label}</b><small>bus type</small></div></div><h2 className="sec">{stops.length} stops</h2>{stops.length?<ol className="timeline">{stops.map((s,i)=><li key={String(s.stop_id)+i}><button onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}><span className={'tl'+(i===0?' first':i===stops.length-1?' last':'')}><i/></span><b>{s.name}</b><Icon n="chev" size={16}/></button></li>)}</ol>:<Empty title="No stops listed" text="This route has no stops in the schedule data."/>}</div>;
}
export function StopPage({id,go,services}:{id:string;go:Go;services:Svc}){
 const{data,err,busy,at,reload}=useLoad(()=>api.stop(id),[id],20000);const[,tick]=useState(0);useEffect(()=>{const t=window.setInterval(()=>tick(n=>n+1),10000);return()=>window.clearInterval(t)},[]);
 if(busy&&!data)return <div className="page"><TopBar title="Bus stop" go={go}/><Loading text="Loading stop…"/></div>;
 if(err&&!data)return <div className="page"><TopBar title="Bus stop" go={go}/><ErrorState text={err} onRetry={reload}/></div>;
 const[sr,ar]=data||[{},{}] as any,stop=sr?.stop||{},routes:any[]=sr?.routes||[],arrivals:any[]=ar?.arrivals||[];
 const groups=Array.from(routes.reduce((m:any,r:any)=>{const n=routeName(r.short_name)||String(r.short_name||'Bus');if(!m.has(n))m.set(n,[]);m.get(n).push(r);return m},new Map<string,any[]>()));
 return <div className="page"><TopBar title={stop.name||'Bus stop'} sub={groups.length?`${groups.length} bus routes`:undefined} go={go}/><div className="updated"><span>{at?'Updated '+secText(Math.round((Date.now()-at.getTime())/1000)):''}</span><button className="btn ghost sm" onClick={reload}><Icon n="refresh" size={14}/>Refresh</button></div><h2 className="sec">Buses at this stop <span className="count">{groups.length}</span></h2>{groups.length?<div className="list">{groups.map(([name,items]:any[])=>{const r=items[0];const live=arrivals.find((a:any)=>routeName(a.routeName)===name);const rawLong=fullRouteName(r.long_name),from=r.from_stop||r.fromStop,to=r.to_stop||r.toStop;const detail=from&&to?String(from)+' → '+String(to):(rawLong&&rawLong!==name&&!/^\d+[A-Z]?[-_]/.test(rawLong)?rawLong:null);return <button key={name} className="row" onClick={()=>go('/routes/'+encodeURIComponent(r.route_id))}><RouteBadge name={name} service={live||null}/><span className="row-t"><b>{detail||'Bus route '+name}</b><small>{items.length>1?`${items.length} directions`:from&&to?'Route direction':'Route'}{live?' · Live bus nearby':''}</small></span><Icon n="chev" size={18}/></button>})}</div>:<Empty title="No buses listed" text="This stop has no route entries in the static transit data."/>}<p className="note">These are the bus routes scheduled to serve this stop. Live vehicle positions are shown separately when available.</p></div>;
}
type StopPick={id:string|null;label:string;mode?:'bus'|'metro'};
const RECENT='ud-recent-trips';
const readRecent=():{from:StopPick;to:StopPick}[]=>{
 try{
  const d=JSON.parse(storageGet(RECENT)||'[]');
  return Array.isArray(d)?d.slice(0,5).filter((x:any)=>x&&x.from&&x.to).map((x:any)=>({
   from:{id:x.from.id?String(x.from.id):null,label:String(x.from.label||''),mode:x.from.mode==='metro'?'metro':'bus'},
   to:{id:x.to.id?String(x.to.id):null,label:String(x.to.label||''),mode:x.to.mode==='metro'?'metro':'bus'}
  })):[];
 }catch{return[]}
};
let plannerMetroStopsCache:any[]|null=null;
let plannerMetroStopsPromise:Promise<any[]>|null=null;
function normalisePlannerPlace(value:unknown):string{
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase()
  .replace(/\bmetro\s*(?:station|stop|stn)\b/g,' ')
  .replace(/\bbus\s*(?:stop|stand)\b/g,' ')
  .replace(/\s+/g,' ').trim().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}
function getPlannerMetroStops():Promise<any[]>{
 if(plannerMetroStopsCache)return Promise.resolve(plannerMetroStopsCache);
 if(!plannerMetroStopsPromise)plannerMetroStopsPromise=api.metro().then(d=>{
  plannerMetroStopsCache=Array.isArray(d?.stops)?d.stops.filter((s:any)=>s?.stop_id&&s?.name):[];
  return plannerMetroStopsCache;
 }).catch(()=>{plannerMetroStopsPromise=null;return[]});
 return plannerMetroStopsPromise;
}
const plannerColor=(value:unknown,fallback:string)=>{
 const raw=String(value??'').trim();
 if(/^#[0-9a-f]{6}$/i.test(raw))return raw;
 if(/^[0-9a-f]{6}$/i.test(raw))return '#'+raw;
 return fallback;
};
const optionMode=(option:any):'bus'|'metro'|'mixed'=>{
 const modes=new Set((Array.isArray(option?.legs)?option.legs:[]).map((l:any)=>l?.mode||'bus').filter((m:string)=>m==='bus'||m==='metro'));
 return modes.has('bus')&&modes.has('metro')?'mixed':modes.has('metro')?'metro':'bus';
};
const modeText=(mode:'bus'|'metro'|'mixed')=>mode==='mixed'?'Bus + Metro':mode==='metro'?'Metro':'Bus';
function StopField({label,value,onChange,placeholder,active,setActive,onEdit}:{label:string;value:StopPick;onChange:(v:StopPick)=>void;placeholder:string;active:boolean;setActive:(b:boolean)=>void;onEdit:()=>void}){
 const[list,setList]=useState<any[]>([]),[busy,setBusy]=useState(false),term=value.label.trim(),termLower=term.toLocaleLowerCase(),searchTerm=normalisePlannerPlace(term);
 useEffect(()=>{
  if(value.id||searchTerm.length<2){setList([]);setBusy(false);return}
  let on=true;
  const controller=new AbortController();
  setBusy(true);
  const t=window.setTimeout(async()=>{
   try{
    const [busResult,metroStops]=await Promise.all([api.search(term,{signal:controller.signal}),getPlannerMetroStops()]);
    if(!on)return;
    const busRaw=(Array.isArray(busResult?.results)?busResult.results:[])
     .filter((x:any)=>x.type==='stop'&&x.id&&x.label)
     .map((x:any)=>({...x,mode:'bus',stopContext:x.stopContext||'Bus stop'}));
    const bus:any[]=[];
    for(const item of busRaw){
     const lat=Number(item.latitude),lon=Number(item.longitude);
     const matchIndex=bus.findIndex(existing=>{
      if(normalisePlannerPlace(existing.label)!==normalisePlannerPlace(item.label))return false;
      const elat=Number(existing.latitude),elon=Number(existing.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(elat)||!Number.isFinite(elon))return String(existing.id)===String(item.id);
      const dy=(lat-elat)*111000,dx=(lon-elon)*111000*Math.cos(lat*Math.PI/180);
      return Math.hypot(dx,dy)<=120;
     });
     if(matchIndex<0)bus.push(item);
     else if((Number(item.routeCount)||0)>(Number(bus[matchIndex].routeCount)||0))bus[matchIndex]=item;
    }
    const metro=metroStops.filter((s:any)=>normalisePlannerPlace(s.name).includes(searchTerm))
     .map((s:any)=>({id:String(s.stop_id),label:String(s.name),mode:'metro',type:'metro',stopContext:'Metro station'}));
    const unique=new Map<string,any>();
    for(const item of [...bus,...metro]){
     const key=String(item.mode)+':'+String(item.id);
     if(!unique.has(key))unique.set(key,item);
    }
    const wantsMetro=/\b(?:metro|station|stn)\b/.test(termLower);
    const wantsBus=/\b(?:bus|stop|stand)\b/.test(termLower)&&!wantsMetro;
    const rank=(item:any)=>{
     const name=normalisePlannerPlace(item.label);
     const textRank=name===searchTerm?0:name.startsWith(searchTerm)?1:name.includes(searchTerm)?2:3;
     const modeRank=wantsMetro?(item.mode==='metro'?0:.6):wantsBus?(item.mode==='bus'?0:.6):(item.mode==='bus'?0:.12);
     return textRank+modeRank;
    };
    setList([...unique.values()].sort((a,b)=>rank(a)-rank(b)).slice(0,9));
   }catch(error){
    if(on&&(error as Error)?.name!=='AbortError')setList([]);
   }finally{if(on)setBusy(false)}
  },140);
  return()=>{on=false;controller.abort();window.clearTimeout(t)};
 },[term,value.id,termLower,searchTerm]);
 return <div className={'field'+(active?' field-active':'')+(value.id?' field-selected':'')}>
  <label>{label}</label>
  <input value={value.label} placeholder={placeholder} autoComplete="off" aria-label={label+' stop or station'} aria-expanded={active&&!value.id&&term.length>=2} onFocus={()=>setActive(true)} onChange={e=>{onEdit();onChange({id:null,label:e.target.value,mode:'bus'});setActive(true)}} onKeyDown={e=>{if(e.key==='Escape')setActive(false)}}/>
  {value.id?<span className={'picked-mode '+(value.mode==='metro'?'metro':'bus')} title={value.mode==='metro'?'Metro station selected':'Bus stop selected'}><Icon n={value.mode==='metro'?'metro':'bus'} size={13}/><span>{value.mode==='metro'?'METRO':'BUS STOP'}</span></span>:busy?<span className="spinner sm"/>:null}
  {active&&!value.id&&term.length>=2?<div className="suggest" role="listbox" aria-label={label+' suggestions'}>
   {list.length?list.map((x:any)=><button type="button" role="option" key={x.mode+':'+x.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange({id:String(x.id),label:String(x.label),mode:x.mode==='metro'?'metro':'bus'});setActive(false)}}>
    <span className={'suggest-mode '+(x.mode==='metro'?'metro':'bus')}><Icon n={x.mode==='metro'?'metro':'bus'} size={16}/></span>
    <span className="row-t"><b>{x.label}</b><small className={'suggest-meta '+(x.mode==='metro'?'metro':'bus')}>{x.mode==='metro'?'METRO STATION':'BUS STOP'}</small></span>
   </button>):!busy?<div className="state empty sm"><span>No bus stops or metro stations matched. Try another spelling.</span></div>:null}
  </div>:null}
 </div>;
}
export function Planner({go}:{go:Go}){
 const[from,setFrom]=useState<StopPick>({id:null,label:'',mode:'bus'});
 const[to,setTo]=useState<StopPick>({id:null,label:'',mode:'bus'});
 const[act,setAct]=useState<'from'|'to'|null>(null);
 const[busy,setBusy]=useState(false);
 const[err,setErr]=useState('');
 const[opts,setOpts]=useState<any[]|null>(null);
 const[recent,setRecent]=useState(readRecent);
 const[filter,setFilter]=useState<'all'|'bus'|'metro'|'mixed'>('all');

 const clearResults=()=>{setOpts(null);setErr('');setFilter('all')};
 const run=async(f:StopPick=from,t:StopPick=to)=>{
  setAct(null);setBusy(true);setErr('');setOpts(null);setFilter('all');
  try{
   if(!f.id||!t.id){
    setErr('Choose a bus stop or Metro station from the suggestions in both fields.');
    return;
   }
   if(f.id===t.id&&f.mode===t.mode){
    setErr('Choose two different stops or stations.');
    return;
   }
   const fromMode=f.mode==='metro'?'metro':'bus';
   const toMode=t.mode==='metro'?'metro':'bus';
   let result:any;
   if(fromMode==='bus'&&toMode==='bus'){
    const replies=await Promise.allSettled([
     api.plan(f.label,t.label,f.id,t.id),
     api.planMultimodal(fromMode,toMode,f.id,t.id)
    ]);
    const busReply=replies[0].status==='fulfilled'?replies[0].value:null;
    const multiReply=replies[1].status==='fulfilled'?replies[1].value:null;
    const originIds=new Set<string>([
     String(f.id),...(Array.isArray(busReply?.originStopIds)?busReply.originStopIds:[]).map(String),
     ...(Array.isArray(multiReply?.originStopIds)?multiReply.originStopIds:[]).map(String)
    ]);
    const destinationIds=new Set<string>([
     String(t.id),...(Array.isArray(busReply?.destinationStopIds)?busReply.destinationStopIds:[]).map(String),
     ...(Array.isArray(multiReply?.destinationStopIds)?multiReply.destinationStopIds:[]).map(String)
    ]);
    const merged=[
     ...(Array.isArray(busReply?.options)?busReply.options:[]),
     ...(Array.isArray(multiReply?.options)?multiReply.options:[])
    ].filter((option:any)=>{
     const legs=(Array.isArray(option?.legs)?option.legs:[]).filter((leg:any)=>leg&&leg.mode!=='walk');
     if(!legs.length)return false;
     const first=legs[0],last=legs[legs.length-1];
     const fromId=String(first.fromStopId||''),toId=String(last.toStopId||'');
     const fromMatches=!fromId||originIds.has(fromId)||normalisePlannerPlace(first.fromStop)===normalisePlannerPlace(f.label);
     const toMatches=!toId||destinationIds.has(toId)||normalisePlannerPlace(last.toStop)===normalisePlannerPlace(t.label);
     return fromMatches&&toMatches;
    });
    const unique=new Map<string,any>();
    for(const option of merged){
     const legs=Array.isArray(option.legs)?option.legs:[];
     const key=legs.map((leg:any)=>[
      String(leg.mode||'bus'),String(leg.routeId||'walk'),
      normalisePlannerPlace(leg.fromStop),normalisePlannerPlace(leg.toStop)
     ].join(':')).join('|');
     const previous=unique.get(key);
     if(!previous||(Number(option.durationMinutes)||999)<(Number(previous.durationMinutes)||999))unique.set(key,option);
    }
    const sortedByEta=[...unique.values()].sort((a,b)=>(a.durationMinutes||999)-(b.durationMinutes||999));
    const bestDirect=sortedByEta.filter(option=>option.type==='direct'&&(Array.isArray(option.legs)?option.legs.filter((leg:any)=>leg.mode!=='walk').length:0)===1)
     .sort((a,b)=>(a.durationMinutes||999)-(b.durationMinutes||999))[0];
    const bestOther=sortedByEta.find(option=>option!==bestDirect);
    const preferDirect=!!bestDirect&&(!bestOther||(Number(bestDirect.durationMinutes)||999)<=(Number(bestOther.durationMinutes)||999)+15);
    const ranked=preferDirect?[bestDirect,...sortedByEta.filter(option=>option!==bestDirect)]:sortedByEta;
    // Keep at least one result from every available mode before filling the list by time.
    // Otherwise eight quick bus-only routes can accidentally hide every Bus + Metro option.
    const options:any[]=[];
    for(const mode of ['bus','mixed','metro']){
     const best=ranked.find(option=>optionMode(option)===mode);
     if(best)options.push(best);
    }
    for(const option of ranked){
     if(options.length>=8)break;
     if(!options.includes(option))options.push(option);
    }
    options.sort((a,b)=>(a.durationMinutes||999)-(b.durationMinutes||999));
    if(preferDirect&&bestDirect&&options.includes(bestDirect)){
     options.splice(options.indexOf(bestDirect),1);
     options.unshift(bestDirect);
    }
    result={status:busReply?.status==='OK'||multiReply?.status==='OK'?'OK':'ERROR',options,reason:busReply?.reason||multiReply?.reason};
   }else{
    result=await api.planMultimodal(fromMode,toMode,f.id,t.id);
   }
   if(result.status!=='OK'){
    setErr(result.reason||'No journey could be found. Try another stop or station.');
    return;
   }
   const options=Array.isArray(result.options)?result.options:[];
   setOpts(options);
   const same=(x:any)=>x.from.id===f.id&&x.to.id===t.id&&x.from.mode===fromMode&&x.to.mode===toMode;
   const next:{from:StopPick;to:StopPick}[]=[
    {from:{...f,mode:fromMode as 'bus'|'metro'},to:{...t,mode:toMode as 'bus'|'metro'}},
    ...readRecent().filter((x:any)=>!same(x))
   ].slice(0,5);
   storageSet(RECENT,JSON.stringify(next));
   setRecent(next);setFrom({...f,mode:fromMode});setTo({...t,mode:toMode});
  }catch(e){
   setErr((e as Error).message||'Trip planning is temporarily unavailable.');
  }finally{
   setBusy(false);
  }
 };

 const modeCounts={
  all:opts?.length||0,
  bus:(opts||[]).filter(o=>optionMode(o)==='bus').length,
  metro:(opts||[]).filter(o=>optionMode(o)==='metro').length,
  mixed:(opts||[]).filter(o=>optionMode(o)==='mixed').length
 };
 const visibleOptions=(opts||[]).filter(o=>filter==='all'||optionMode(o)===filter);

 const renderLeg=(l:any,j:number,o:any)=>{
  const mode=String(l.mode||'bus');
  if(mode==='walk'){
   const walkMinutes=l.walkingMinutes||o.walkingMinutes||1;
   const walkText=l.walkMeters?' · '+Math.round(l.walkMeters)+' m':'';
   return <div className="leg-walk" key={'walk:'+j}>
    <span className="leg-walk-icon"><Icon n="walk" size={16}/></span>
    <span className="row-t">
     <b>Walk · {walkMinutes} min</b>
     <small>{l.fromStop} → {l.toStop}{walkText}</small>
    </span>
   </div>;
  }
  const routeLabel=routeName(l.routeName)||String(l.routeName||(mode==='metro'?'Metro':'Bus'));
  const fallback=mode==='metro'?metroColor(l.routeLongName||l.routeName):'#0B6B57';
  // Bus legs use the dominant colour of currently tracked vehicles on that route when
  // available. Metro legs use the official GTFS line colour. Missing livery stays mode-green.
  const color=mode==='metro'?plannerColor(l.routeColor,fallback):plannerColor(l.busLiveryColor,fallback);
  const target=mode==='metro'?'/metro/routes/':'/routes/';
  const colourTitle=mode!=='bus'?'Metro line colour':l.busLiveryColor
   ?'Bus colour '+(l.busLiverySource==='upstream-api'?'from live data':l.busLiverySource==='verified-livery-record'?'from a reviewed vehicle record':'estimated from currently tracked buses')+'; colours can vary by vehicle'
   :'Bus route; individual vehicle livery is not available for this route';
  return <button type="button" title={colourTitle} className={'leg leg-'+mode} key={mode+':'+String(l.routeId)+':'+j} onClick={()=>go(target+encodeURIComponent(l.routeId||''))}>
   <RouteBadge name={routeLabel} color={color}/>
   <span className={'leg-mode-label '+mode}>{mode==='metro'?'METRO':'BUS'}</span>
   <span className="row-t"><b>{l.fromStop}</b><small>to {l.toStop}</small></span>
   <Icon n="chev" size={16}/>
  </button>;
 };

 const resultCards=visibleOptions.map((o:any,i:number)=>{
  const journeyMode=optionMode(o);
  const legs=Array.isArray(o.legs)?o.legs:[];
  const legCount=legs.filter((l:any)=>l.mode==='bus'||l.mode==='metro').length;
  const description=o.type==='direct'?'No transfers · stay on one bus':legCount>1?'Transfers included':'Estimated journey';
  const walking=o.walkingMinutes?' · '+o.walkingMinutes+' min walking':'';
  const delay=Math.min(i,5)*45;
  const key=String(o.type)+':'+legs.map((l:any)=>String(l.mode||'bus')+':'+String(l.routeId||'walk')).join('|')+':'+i;
  return <div className={'card trip trip-'+journeyMode+(o.type==='direct'&&i===0?' trip-direct-recommended':'')} key={key} style={{animationDelay:delay+'ms'}}>
   <div className="trip-h">
    <div className="trip-summary">
     <b>~{o.durationMinutes} min</b>
     <span className={'journey-kind '+journeyMode}>{o.type==='direct'?'Direct bus':modeText(journeyMode)}</span>
    </div>
    <small>{description}{walking}</small>
   </div>
   <div className="trip-legs">
    {legs.map((leg:any,index:number)=>renderLeg(leg,index,o))}
   </div>
  </div>;
 });

 let journeysView:ReactNode=null;
 if(opts!==null&&!busy){
  if(!opts.length){
   journeysView=<Empty title="No journey matched" text="Try another nearby stop or Metro station. Some older feeds may not have a complete route sequence."/>;
  }else{
   const cards=visibleOptions.length?resultCards:<Empty title={'No '+modeText(filter==='all'?'bus':filter)+' options in this set'} text="Choose All to see every journey returned for these stops."/>;
   journeysView=<>
    <div className="planner-results-head">
     <div><h2 className="sec">Suggested journeys</h2><p>Direct rides are prioritised when their estimated time is close; choose another option for a transfer or Metro alternative.</p></div>
    </div>
    <div className="planner-mode-key" aria-label="Journey mode colour key">
     <span><i className="key-bus"/>Bus</span><span><i className="key-metro"/>Metro</span><span><i className="key-mixed"/>Bus + Metro</span><span><i className="key-walk"/>Walking</span>
    </div>
    <div className="mode-filters" role="group" aria-label="Filter journey options">
     {([['all','All',modeCounts.all],['bus','Bus',modeCounts.bus],['metro','Metro',modeCounts.metro],['mixed','Bus + Metro',modeCounts.mixed]] as const).map(([key,label,count])=>
      <button type="button" key={key} className={'mode-filter'+(filter===key?' active':'')} aria-pressed={filter===key} disabled={!count} onClick={()=>setFilter(key)}>
       <span>{label}</span><b>{count}</b>
      </button>
     )}
    </div>
    {cards}
   </>;
  }
 }
 const recentView=opts===null&&!busy&&!err&&recent.length>0?<>
  <h2 className="sec">Recent journeys</h2>
  <div className="list">
   {recent.map((item,index)=><button className="row" key={index} onClick={()=>{setFrom(item.from);setTo(item.to);void run(item.from,item.to)}}>
    <span className="pin"><Icon n="refresh" size={16}/></span>
    <span className="row-t"><b>{item.from.label}</b><small>{item.to.label} · {item.from.mode==='metro'?'Metro origin':'Bus stop origin'} → {item.to.mode==='metro'?'Metro destination':'Bus stop destination'}</small></span>
    <Icon n="chev" size={16}/>
   </button>)}
  </div>
 </>:null;
 const emptyView=opts===null&&!busy&&!err&&!recent.length?<Empty title="Plan a journey" text="Type a stop or Metro station and choose a suggestion in both fields."/>:null;

 return <div className="page planner-page">
  <TopBar title="Trip Plan" sub="Compare bus, Metro and combined journeys" go={go} back={null}/>
  <div className="planner-intro">
   <span className="planner-intro-icon"><Icon n="route" size={18}/></span>
   <div><b>Find the best way</b><p>Pick a bus stop or Metro station at each end. United Delhi compares direct rides, Metro trips and bus-to-Metro transfers.</p></div>
  </div>
  <div className="planner-mode-key planner-mode-key-intro" aria-label="Available travel modes">
   <span><i className="key-bus"/>Bus</span><span><i className="key-metro"/>Metro</span><span><i className="key-mixed"/>Combined transfers</span>
  </div>
  <div className="card planner">
   <div className="rail"><i/><b/><i className="end"/></div>
   <div className="fields">
    <StopField label="From" value={from} onChange={v=>{setFrom(v);clearResults()}} onEdit={clearResults} placeholder="Starting stop or station" active={act==='from'} setActive={b=>setAct(b?'from':null)}/>
    <StopField label="To" value={to} onChange={v=>{setTo(v);clearResults()}} onEdit={clearResults} placeholder="Destination stop or station" active={act==='to'} setActive={b=>setAct(b?'to':null)}/>
   </div>
   <button className="icon-btn swap" aria-label="Swap origin and destination" onClick={()=>{setFrom(to);setTo(from);clearResults()}}><Icon n="swap"/></button>
  </div>
  <button className="btn wide planner-find" disabled={busy||!from.label.trim()||!to.label.trim()} onClick={()=>void run()}>
   {busy?<><span className="spinner sm"/> Finding journeys…</>:'Find journeys'}
  </button>
  <p className="planner-hint"><Icon n="info" size={14}/>Compare bus-only, Metro-only and combined journeys. Times are estimates; Metro train positions are not live-tracked. Bus marker colours are best-effort hints and may vary by vehicle.</p>
  {err?<ErrorState text={err}/>:null}
  {busy?<Loading text="Finding bus and Metro combinations…"/>:null}
  {journeysView}
  {recentView}
  {emptyView}
 </div>;
}
const Item=({icon,title,sub,onClick}:{icon:Parameters<typeof Icon>[0]['n'];title:string;sub?:string;onClick:()=>void})=><button className="row" onClick={onClick}><span className="pin"><Icon n={icon} size={18}/></span><span className="row-t"><b>{title}</b>{sub?<small>{sub}</small>:null}</span><Icon n="chev" size={18}/></button>;
export function Hub({go,onLegend}:{go:Go;onLegend:()=>void}){return <div className="page"><TopBar title="Settings" sub="United Delhi" go={go} back={null}/><div className="list"><Item icon="legend" title="Bus colour legend" sub="What the bus colours mean" onClick={onLegend}/><Item icon="help" title="Help & FAQs" sub="Answers and transport helplines" onClick={()=>go('/help')}/><Item icon="shield" title="Privacy Policy" sub="How location and data are handled" onClick={()=>go('/legal/privacy')}/><Item icon="doc" title="Terms of Service" sub="Rules for using United Delhi" onClick={()=>go('/legal/terms')}/><Item icon="info" title="About United Delhi" sub="Version, data sources and app information" onClick={()=>go('/about')}/></div></div>}
const HELPLINES:[string,string][]=[['Transport helpline','01142400400'],['DTC helpline','1800118181'],['Delhi Metro helpline','155370'],['Delhi Police','100'],['Ambulance','102'],['Fire','101'],['Women in distress (24 h)','1091'],['Child helpline','1098']];
const FAQ:[string,string][]=[['What do the bus colours mean?','A marker uses the colour supplied by the live API or a reviewed vehicle record when available. If neither is available, United Delhi may estimate a typical colour from available fleet details—for example, a recognised traditional DTC AC/non-AC type or an explicitly identified cluster service. Estimated colours are only hints and may be wrong or outdated because liveries vary. Neutral grey means there is not enough information to estimate a colour. Route-line colours are not used as bus-paint colours. Open Settings › Bus colour legend to see where each displayed colour came from.'],['Why is a bus missing or old?','Positions come from Delhi Open Transit Data and can lag or drop out. When live data is unavailable, the last known positions stay on the map and are marked.'],['Are these arrival times?','No. Stop pages show live buses near the stop with straight-line distance. Trip Plan times are estimates.'],['How is my location used?','Only on your device to find nearby stops and centre the map. It is optional.']];
export function Help({go}:{go:Go}){const[open,setOpen]=useState(-1);return <div className="page"><TopBar title="Help" sub="Answers and helplines" go={go} back={null}/><h2 className="sec">FAQs</h2><div className="list">{FAQ.map(([q,a],i)=><div className="faq" key={q}><button aria-expanded={open===i} onClick={()=>setOpen(open===i?-1:i)}><b>{q}</b><span className={open===i?'rot':''}><Icon n="chev" size={16}/></span></button>{open===i?<p>{a}</p>:null}</div>)}</div><h2 className="sec">Helplines</h2><div className="list">{HELPLINES.map(([n,t])=><a className="row" key={n} href={'tel:'+t}><span className="pin call"><Icon n="phone" size={18}/></span><span className="row-t"><b>{n}</b><small>{t.length>6&&t.startsWith('011')?'011 '+t.slice(3):t}</small></span></a>)}</div></div>}
export function Legal({go}:{go:Go}){return <div className="page"><TopBar title="Legal & privacy" go={go} back={storageGet('ud-consent-v1')==='1'?'/hub':null}/><div className="list"><Item icon="shield" title="Privacy Policy" sub="Data, location and privacy" onClick={()=>go('/legal/privacy')}/><Item icon="doc" title="Terms of Service" sub="Rules for using United Delhi" onClick={()=>go('/legal/terms')}/></div></div>}
const Doc=({title,date,items,go}:{title:string;date:string;items:[string,string][];go:Go})=><div className="page"><TopBar title={title} sub={date} go={go} back={storageGet('ud-consent-v1')==='1'?'/legal':'/'}/><article className="doc">{items.map(([h,p])=><section key={h}><h3>{h}</h3><p>{p}</p></section>)}</article></div>;
export const Privacy=({go}:{go:Go})=><Doc title="Privacy Policy" date="Effective 16 October 2026" items={LEGAL.privacy} go={go}/>;
export const Terms=({go}:{go:Go})=><Doc title="Terms of Service" date="Effective 16 October 2026" items={LEGAL.terms} go={go}/>;
export function About({go}:{go:Go}){return <div className="page"><TopBar title="About United Delhi" sub="Version 1 · Launch release" go={go} back="/settings"/><div className="about card"><b>United Delhi</b><p>Live Delhi bus positions, bus routes, bus stops and direct bus journey planning.</p><p>Live vehicle positions come from Delhi Open Transit Data. Static route and stop information is used to connect buses with their routes and stops.</p><h3>Bus colours may be estimated</h3><p>The live feed does not consistently include a bus’s physical livery. When no live API colour or reviewed vehicle record is available, United Delhi may estimate a typical colour from the fleet details it has—for example, a recognised DTC AC/non-AC vehicle type or an explicitly identified cluster service. These are visual hints, not official per-vehicle colour records.</p><p>Liveries can vary by operator, vehicle and fleet batch, and the available details can be incomplete or outdated. An estimated colour may be wrong. Do not use colour alone to identify a bus, its operator, ownership or AC status. A colour supplied by the live API or a reviewed vehicle record takes priority; neutral grey means the app could not make a useful estimate.</p><p>The map uses OpenStreetMap. United Delhi does not provide ticket purchases, passes, purchase history or account features.</p><small>© OpenStreetMap contributors</small></div></div>

}
