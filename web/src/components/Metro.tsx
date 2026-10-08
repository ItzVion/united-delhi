import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import {Icon,Loading,ErrorState,TopBar,RouteBadge} from './ui';
import {routeName} from '../lib';
import type {Go} from '../lib';

export default function Metro({go}:{go:Go}){
 const[data,setData]=useState<any>(null),[err,setErr]=useState(''),[q,setQ]=useState('');
 const load=()=>{setErr('');api.metro().then(d=>setData(d)).catch(e=>setErr(e instanceof Error?e.message:'Metro data is unavailable'))};
 useEffect(()=>{let on=true;api.metro().then(d=>{if(on)setData(d)}).catch(e=>{if(on)setErr(e instanceof Error?e.message:'Metro data is unavailable')});return()=>{on=false}},[]);
 const term=q.trim().toLowerCase();
 const routes=useMemo(()=>{const a=Array.isArray(data?.routes)?data.routes:[];return term?a.filter((r:any)=>String(r.short_name||'').toLowerCase().includes(term)||String(r.long_name||'').toLowerCase().includes(term)):a},[data,term]);
 const stops=useMemo(()=>{const a=Array.isArray(data?.stops)?data.stops:[];return term?a.filter((s:any)=>String(s.name||'').toLowerCase().includes(term)).slice(0,40):a},[data,term]);
 if(err)return <div className="page"><TopBar title="Delhi Metro" sub="Metro routes and stations" go={go}/><ErrorState text={err} onRetry={load}/></div>;
 if(!data)return <div className="page"><TopBar title="Delhi Metro" sub="Metro routes and stations" go={go}/><Loading text="Loading metro data…"/></div>;
 const meta=data.meta;
 return <div className="page"><TopBar title="Delhi Metro" sub={meta?.imported_at?'Static network data':'Metro network'} go={go}/>
 <div className="updated"><span>{meta?.imported_at?'Data imported '+new Date(meta.imported_at).toLocaleDateString():'Metro data available'}</span><span>{(Array.isArray(data?.stops)?data.stops.length:0)} stations</span></div>
 <div className="search metro-search"><Icon n="search" size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search metro route or station" aria-label="Search metro route or station"/>{q?<button className="clr" onClick={()=>setQ('')} aria-label="Clear search"><Icon n="close" size={16}/></button>:null}</div>
 <h2 className="sec">Metro routes <span className="count">{routes.length}</span></h2>
 {routes.length?<div className="list">{routes.map((r:any)=><button className="row" key={r.route_id} onClick={()=>go('/metro/routes/'+encodeURIComponent(r.route_id))}><RouteBadge name={routeName(r.short_name)||r.short_name||'Metro'} color={r.route_color?(String(r.route_color).startsWith('#')?r.route_color:'#'+r.route_color):undefined}/><span className="row-t"><b>{r.long_name||r.short_name||'Metro route'}</b><small>Metro route · {r.route_id}</small></span><Icon n="chev" size={18}/></button>)}</div>:<div className="card about"><b>No matching metro routes</b><p>Try a line name, route code or station.</p></div>}
 {term?<><h2 className="sec">Stations <span className="count">{stops.length}</span></h2>{stops.length?<div className="list">{stops.map((s:any)=><div className="row" key={s.stop_id}><span className="pin"><Icon n="pin" size={18}/></span><span className="row-t"><b>{s.name}</b><small>Metro station · {s.stop_id}</small></span></div>)}</div>:<div className="state empty"><span>No matching stations</span></div>}</>:null}
 <p className="note">Metro information is static network data. United Delhi does not show live metro train positions.</p></div>;
}
