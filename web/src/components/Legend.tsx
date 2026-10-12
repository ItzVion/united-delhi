import {useEffect} from 'react';
import type {Vehicle} from '../api';
import {Icon} from './ui';

const isHexColor=(value:unknown):value is string=>/^#[0-9a-f]{6}$/i.test(String(value??'').trim());
const UNKNOWN_COLOR='#64748B';
type ColourSource='upstream-api'|'verified-livery-record'|'estimated-fleet-type';
type Props={open:boolean;onClose:()=>void;vehicles:Vehicle[]};
const sourceLabel=(source:ColourSource)=>source==='estimated-fleet-type'?'Estimated from fleet details':source==='verified-livery-record'?'Reviewed vehicle record':'Live API';

export default function Legend({open,onClose,vehicles}:Props){
  useEffect(()=>{
    if(!open)return;
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  },[open,onClose]);
  if(!open)return null;

  const counts=new Map<string,{color:string;source:ColourSource;count:number}>();
  for(const vehicle of vehicles){
    const color=String(vehicle.serviceColor??'').trim();
    if(!isHexColor(color))continue;
    const rawSource=vehicle.fleetColorSource||'upstream-api';
    if(rawSource!=='upstream-api'&&rawSource!=='verified-livery-record'&&rawSource!=='estimated-fleet-type')continue;
    const source=rawSource as ColourSource,key=source+':'+color.toUpperCase(),previous=counts.get(key);
    if(previous)previous.count++;
    else counts.set(key,{color:color.toUpperCase(),source,count:1});
  }
  const rows=[...counts.values()].sort((a,b)=>a.source.localeCompare(b.source)||b.count-a.count||a.color.localeCompare(b.color));
  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus colour legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={event=>event.stopPropagation()}>
      <h2>Bus Colour Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Colour source</span></div>
      {rows.map(row=><div className="legend-exact-row" key={row.source+row.color}>
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:row.color}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">{sourceLabel(row.source)} · {row.color} · {row.count} {row.count===1?'vehicle':'vehicles'}</span>
      </div>)}
      {!rows.length?<p className="legend-exact-empty">No colour information is available for the current buses. Neutral grey is used when the live API, a reviewed record and the available fleet details cannot provide a useful colour.</p>:null}
      <div className="legend-exact-row">
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:UNKNOWN_COLOR}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">Unknown colour · neutral grey</span>
      </div>
      <p className="legend-exact-empty">Estimated colours are visual hints only and can be wrong or outdated. Do not use colour alone to identify a bus, its operator, ownership or AC status.</p>
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}
