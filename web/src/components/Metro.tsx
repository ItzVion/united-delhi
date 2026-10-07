import {useEffect,useState} from 'react';
import {api} from '../api';
import {Icon,Loading,ErrorState,TopBar,RouteBadge} from './ui';
import {routeName} from '../lib';
import type {Go} from '../lib';

export default function Metro({go}:{go:Go}){
 const[data,setData]=useState<any>(null),[err,setErr]=useState('');
 useEffect(()=>{let on=true;api.metro().then(d=>{if(on)setData(d)}).catch(e=>{if(on)setErr(e instanceof Error?e.message:'Metro data is unavailable')});return()=>{on=false}},[]);
 if(err)return <div className="page"><TopBar title="Delhi Metro" sub="Metro routes and stations" go={go}/><ErrorState text={err}/></div>;
 if(!data)return <div className="page"><TopBar title="Delhi Metro" sub="Metro routes and stations" go={go}/><Loading text="Loading metro data…"/></div>;
 const routes=Array.isArray(data.routes)?data.routes:[],stops=Array.isArray(data.stops)?data.stops:[],meta=data.meta;
 return <div className="page"><TopBar title="Delhi Metro" sub={meta?.imported_at?'Static network data':'Metro network'} go={go}/>
 <div className="updated"><span>{meta?.imported_at?'Data imported '+new Date(meta.imported_at).toLocaleDateString():'Metro data available'}</span><span>{stops.length} stations</span></div>
 <h2 className="sec">Metro routes <span className="count">{routes.length}</span></h2>
 {routes.length?<div className="list">{routes.map((r:any)=><button className="row" key={r.route_id} onClick={()=>go('/metro/routes/'+encodeURIComponent(r.route_id))}><RouteBadge name={routeName(r.short_name)||r.short_name||'Metro'}/><span className="row-t"><b>{r.long_name||r.short_name||'Metro route'}</b><small>Metro route</small></span><Icon n="chev" size={18}/></button>)}</div>:<div className="card about"><b>No metro routes loaded</b><p>Metro static data is temporarily unavailable.</p></div>}
 <p className="note">Metro information is static network data. United Delhi does not show live metro train positions.</p></div>;
}
