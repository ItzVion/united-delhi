import {useEffect} from 'react';
import type {Vehicle} from '../api';
import {Icon} from './ui';

const isApiColor=(value:unknown):value is string=>/^#[0-9a-f]{6}$/i.test(String(value??'').trim());
const UNKNOWN_COLOR='#64748B';

type Props={open:boolean;onClose:()=>void;vehicles:Vehicle[]};

export default function Legend({open,onClose,vehicles}:Props){
  useEffect(()=>{
    if(!open)return;
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  },[open,onClose]);

  if(!open)return null;

  const counts=new Map<string,{color:string;count:number}>();
  for(const vehicle of vehicles){
    const color=String(vehicle.serviceColor??'').trim();
    if(!isApiColor(color))continue;
    const key=color.toUpperCase();
    const previous=counts.get(key);
    if(previous)previous.count++;
    else counts.set(key,{color,count:1});
  }
  const rows=[...counts.values()].sort((a,b)=>b.count-a.count||a.color.localeCompare(b.color));

  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus colour legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={event=>event.stopPropagation()}>
      <h2>Bus Colour Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>API-supplied colour</span></div>
      {rows.map(row=><div className="legend-exact-row" key={row.color.toUpperCase()}>
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:row.color}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">{row.color} · {row.count} {row.count===1?'vehicle':'vehicles'}</span>
      </div>)}
      {!rows.length?<p className="legend-exact-empty">The live API is not currently supplying a valid vehicle colour. Neutral grey means the physical colour is unknown; it does not mean the bus itself is grey.</p>:null}
      <div className="legend-exact-row">
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:UNKNOWN_COLOR}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">Colour not supplied by live API</span>
      </div>
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}
