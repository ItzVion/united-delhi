import {useCallback,useEffect,useRef,useState} from 'react';
import type {PointerEvent as RPE} from 'react';
import {api} from '../api';
import type {Vehicle} from '../api';
import {dist,routeName} from '../lib';
import type {Go,LiveStatus,Point} from '../lib';
import MapView from './MapView';
import {Icon,RouteBadge} from './ui';

type Props={vehicles:Vehicle[];live:LiveStatus;liveNote:string;onRetry:()=>void;location:Point|null;locState:string;onLocate:()=>void;onLegend:()=>void;go:Go;services:Map<string,Vehicle>};
export default function Home /* refreshed */({vehicles,live,liveNote,onRetry,location,locState,onLocate,onLegend,go,services}:Props){
  const[q,setQ]=useState(''),[focus,setFocus]=useState(false),[results,setResults]=useState<any[]>([]),[sBusy,setSBusy]=useState(false),[sErr,setSErr]=useState('');
  const term=q.trim();
  useEffect(()=>{if(term.length<2){setResults([]);setSBusy(false);setSErr('');return}let on=true;setSBusy(true);setSErr('');const t=window.setTimeout(async()=>{try{const r=await api.search(term);if(on)setResults((r.results||[]).slice(0,40))}catch(e){if(on){setResults([]);setSErr((e as Error).message||'Search is unavailable.')}}finally{if(on)setSBusy(false)}},200);return()=>{on=false;window.clearTimeout(t)}},[term]);
  const open=(path:string)=>{setQ('');setFocus(false);(document.activeElement as HTMLElement|null)?.blur?.();go(path)};
  const chip=live==='loading'?'Connecting…':live==='ok'?vehicles.length.toLocaleString('en-IN')+' live':live==='stale'?'Last known':'Offline';
  return <div className="home" data-snap="peek">
    <header className="hdr"><img className="hdr-logo" src="/icon.svg" alt="United Delhi" width={34} height={34}/><div className="search"><Icon n="search" size={18}/><input type="search" inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Search routes and stops" placeholder="Search routes or stops" value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>setFocus(true)}/>{sBusy?<span className="spinner sm"/>:null}{q?<button className="clr" aria-label="Clear search" onClick={()=>{setQ('');setFocus(false)}}><Icon n="close" size={16}/></button>:null}</div><span className={'chip '+live} title={liveNote||undefined}><i/>{chip}</span></header>
    {focus&&term.length>=2?<><div className="scrim" onClick={()=>setFocus(false)}/><section className="results" aria-live="polite">{sBusy&&!results.length?<div className="state"><span className="spinner"/><span>Searching…</span></div>:sErr?<div className="state err"><b>Search failed</b><span>{sErr}</span></div>:results.length?results.map((x:any,i:number)=>{const isRoute=x.type==='route',name=isRoute?(routeName(x.label)||String(x.label||'Route')):x.label;return <button key={x.type+x.id+i} className="row" onClick={()=>open((isRoute?'/routes/':'/stops/')+encodeURIComponent(x.id))}>{isRoute?<RouteBadge name={name} color={x.routeColor||undefined}/>:<span className="pin"><Icon n="pin" size={18}/></span>}<span className="row-t"><b>{isRoute?(x.fromStop||'Start')+' → '+(x.toStop||'End'):x.label}</b><small>{isRoute?'Bus route '+name:(x.stopContext||'Bus stop')+(x.routeCount?' · '+x.routeCount+' routes':'')}</small></span><Icon n="chev" size={18}/></button>}):<div className="state empty"><b>No results</b><span>Try a route number like 801, or a stop name.</span></div>}</section></>:null}
    <div className="home-body"><MapView vehicles={vehicles} location={location} onLocate={onLocate} onLegend={onLegend} go={go}/>{live==='stale'||live==='unavailable'?<div className={'map-banner '+live} role="status"><span>{live==='stale'?(liveNote||'Showing last known bus positions.'):(vehicles.length?'Live data unavailable.':(liveNote||'Live data is unavailable.'))}</span><button onClick={onRetry}><Icon n="refresh" size={14}/>Retry</button></div>:null}<Sheet location={location} locState={locState} onLocate={onLocate} go={go}/></div>
  </div>;
}
function Sheet({location,locState,onLocate,go}:{location:Point|null;locState:string;onLocate:()=>void;go:Go}){
  const el=useRef<HTMLElement>(null),[stops,setStops]=useState<any[]>([]),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[snap,setSnap]=useState(0),drag=useRef<{y:number;h:number;t:number}|null>(null);
  const lastFetchedLocation=useRef<Point|null>(null),stopsRef=useRef<any[]>([]),requestId=useRef(0);
  stopsRef.current=stops;
  const load=useCallback((force=false)=>{
    if(!location)return;
    const previous=lastFetchedLocation.current;
    if(previous&&!force){
      const rad=(n:number)=>n*Math.PI/180, dLat=rad(location.lat-previous.lat),dLon=rad(location.lon-previous.lon);
      const a=Math.sin(dLat/2)**2+Math.cos(rad(previous.lat))*Math.cos(rad(location.lat))*Math.sin(dLon/2)**2;
      const metres=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      if(metres<100)return;
    }
    lastFetchedLocation.current=location;
    const id=++requestId.current;
    setBusy(true);setErr('');
    void api.nearby(location.lat,location.lon).then(r=>{
      if(id!==requestId.current)return;
      if(r.status==='OK'){stopsRef.current=r.stops;setStops(r.stops);setErr('');}
      else if(!stopsRef.current.length)setErr(r.reason||'Nearby stops unavailable.');
    }).catch(e=>{
      if(id===requestId.current&&!stopsRef.current.length)setErr((e as Error).message||'Nearby stops unavailable.');
    }).finally(()=>{if(id===requestId.current)setBusy(false)});
  },[location]);
  useEffect(()=>{load();},[load]);
  const heights=()=>{const H=el.current?.parentElement?.clientHeight||600;return[158,Math.round(H*.52),H-12]};
  const apply=useCallback((h:number,animate:boolean)=>{const s=el.current;if(!s)return;s.classList.toggle('anim',animate);s.style.setProperty('height',h+'px','important');s.parentElement?.style.setProperty('--sheet-h',h+'px','important')},[]);
  useEffect(()=>{apply(heights()[snap],true)},[snap,apply]);useEffect(()=>{const f=()=>apply(heights()[snap],false);window.addEventListener('resize',f);return()=>window.removeEventListener('resize',f)},[snap,apply]);
  const down=(e:RPE)=>{if(window.matchMedia('(min-width:920px)').matches)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag.current={y:e.clientY,h:el.current!.offsetHeight,t:performance.now()}};
  const move=(e:RPE)=>{const d=drag.current;if(!d)return;const hs=heights();apply(Math.max(110,Math.min(hs[2],d.h+(d.y-e.clientY))),false)};
  const up=(e:RPE)=>{const d=drag.current;if(!d)return;drag.current=null;const hs=heights(),cur=el.current!.offsetHeight,v=(d.y-e.clientY)/Math.max(1,performance.now()-d.t);let target=hs.reduce((b,h,i)=>Math.abs(h-cur)<Math.abs(hs[b]-cur)?i:b,0);if(Math.abs(v)>.5)target=Math.max(0,Math.min(2,snap+(v>0?1:-1)));if(Math.abs(e.clientY-d.y)<5)target=snap===0?1:snap===1?2:0;if(target===snap)apply(hs[target],true);else setSnap(target)};
  return <section ref={el} className={'sheet snap'+snap} aria-label="Nearby bus stops"><div className="sheet-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="button" tabIndex={0} aria-label="Resize stops panel" onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setSnap(s=>(s+1)%3)}}><span className="grab"/><div className="sheet-title"><b>Nearby bus stops</b>{stops.length?<small>{stops.length} within {dist(stops[stops.length-1]?.distanceMeters)}</small>:null}</div></div><div className="sheet-body">{!location?<div className="state empty"><b>{locState==='asking'?'Finding your location…':'See stops near you'}</b><span>{locState==='denied'?'Location permission is blocked. Allow it in your browser settings, then try again.':locState==='unavailable'?'Your location could not be found.':'Allow location to list nearby stops. You can still search for any route or stop.'}</span>{locState!=='asking'?<button className="btn sm" onClick={onLocate}>Use my location</button>:<span className="spinner"/>}</div>:busy&&!stops.length?<div className="skel">{[0,1,2,3].map(i=><div key={i}/>)}</div>:err?<div className="state err"><b>Couldn't load stops</b><span>{err}</span><button className="btn ghost sm" onClick={()=>load(true)}>Try again</button></div>:!stops.length?<div className="state empty"><b>No stops nearby</b><span>No bus stops found within 15 km of your location.</span></div>:stops.map((s:any,i:number)=><div className="stop-row" key={String(s.stop_id)+i}><button className="stop-main" onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}><span className="pin"><Icon n="pin" size={18}/></span><span className="row-t"><b>{s.name}</b><small>{dist(s.distanceMeters)} away</small></span></button><button className="btn ghost sm" onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}>View buses</button></div>)}</div></section>;
}
