import {useEffect,useState} from 'react';
import {api} from '../api';
import {metroColor} from '../lib';
import type {Go} from '../lib';
import {Icon,Loading,ErrorState,TopBar} from './ui';

export default function MetroRoute({id,go}:{id:string;go:Go}){
 const[data,setData]=useState<any>(null),[err,setErr]=useState(''),[activeDirection,setActiveDirection]=useState('');
 useEffect(()=>{let on=true;setData(null);setActiveDirection('');setErr('');api.metroRoute(id).then(d=>{if(on)setData(d)}).catch(e=>{if(on)setErr(e instanceof Error?e.message:'Metro route unavailable')});return()=>{on=false}},[id]);
 if(err)return <div className="page"><TopBar title="Metro route" go={go}/><ErrorState text={err}/></div>;
 if(!data)return <div className="page"><TopBar title="Metro route" go={go}/><Loading text="Loading route…"/></div>;
 const r=data.route||{};
 const directions=(Array.isArray(data.directions)?data.directions:[]).map((d:any,i:number)=>({...d,key:String(d.directionId??i),stops:Array.isArray(d.stops)?d.stops:[]}));
 const selected=directions.find((d:any)=>d.key===activeDirection)||directions[0]||null;
 const stops=selected?selected.stops:(Array.isArray(data.stops)?data.stops:[]);
 return <div className="page"><TopBar title={r.short_name||'Metro route'} sub={r.long_name||'Delhi Metro'} go={go}/><div className="route-banner"><span className="badge" style={{background:r.route_color?(String(r.route_color).startsWith('#')?r.route_color:'#'+r.route_color):metroColor(r.long_name||r.short_name),color:'#fff'}}>{r.short_name||'Metro'}</span><b>{r.long_name||'Delhi Metro'}</b></div>
 {directions.length>1?<div className="metro-directions" role="group" aria-label="Metro travel direction">{directions.map((d:any,i:number)=><button type="button" key={d.key} className={selected?.key===d.key?'on':''} aria-pressed={selected?.key===d.key} onClick={()=>setActiveDirection(d.key)}><small>Direction {i+1}</small><b>{d.fromStop||d.stops[0]?.name||'Start'} → {d.toStop||d.stops[d.stops.length-1]?.name||'End'}</b></button>)}</div>:null}
 <h2 className="sec">{stops.length} stations</h2>
 {stops.length?<ol className="timeline">{stops.map((s:any,i:number)=><li key={String(s.stop_id)+i}><button onClick={()=>go('/metro')}><span className={'tl'+(i===0?' first':i===stops.length-1?' last':'')}><i/></span><b>{s.name}</b><Icon n="chev" size={16}/></button></li>)}</ol>:<div className="card about"><b>No stations listed</b><p>This metro route has no station sequence in the static data.</p></div>}
 </div>;
}
