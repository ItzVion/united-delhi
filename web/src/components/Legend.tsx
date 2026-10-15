import {useEffect} from 'react';
import {Icon} from './ui';
import type {Vehicle} from '../api';

type Props={open:boolean;onClose:()=>void;vehicles:Vehicle[]};

export default function Legend({open,onClose,vehicles}:Props){
  const counts=new Map<string,{source:'upstream-api'|'verified-livery-record';color:string;count:number}>();
  for(const vehicle of vehicles){
    const source=vehicle.fleetColorSource;
    const color=String(vehicle.serviceColor||'').trim();
    if((source!=='upstream-api'&&source!=='verified-livery-record')||!/^#[0-9a-f]{6}$/i.test(color))continue;
    const normalized=color.toUpperCase(),key=source+':'+normalized,prior=counts.get(key);
    if(prior)prior.count++;
    else counts.set(key,{source,color:normalized,count:1});
  }
  const rows=[...counts.values()].sort((a,b)=>a.source.localeCompare(b.source)||b.count-a.count||a.color.localeCompare(b.color))
    .map(row=>({key:row.source+':'+row.color,label:(row.source==='upstream-api'?'Live API':'Reviewed')+' · '+row.color+' ('+row.count+')',color:row.color}));
  rows.push({key:'unknown',label:'Unknown / no verified physical colour',color:'#64748B'});
  useEffect(()=>{
    if(!open)return;
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  },[open,onClose]);
  if(!open)return null;

  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={event=>event.stopPropagation()}>
      <h2>Bus Color Legend</h2>
      <p className="legend-colour-note">Only exact live API colours and reviewed vehicle evidence are shown as physical colours. Unknown vehicles are neutral grey.</p>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Colour source</span></div>
      {rows.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:row.color}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      <button className="legend-understood" onClick={onClose}>Understood!</button>
    </div>
  </div>;
}
