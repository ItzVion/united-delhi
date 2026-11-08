import {useEffect} from 'react';
import {Icon} from './ui';
import type {Vehicle} from '../api';
import {BUS_OPERATOR_MARKER_COLORS,UNKNOWN_BUS_MARKER_COLOR} from '../lib';

type Props={open:boolean;onClose:()=>void;vehicles:Vehicle[]};

export default function Legend({open,onClose,vehicles}:Props){
  const counts=new Map<string,{source:'upstream-api'|'verified-livery-record';color:string;count:number}>();
  let dtcCount=0,dimtsCount=0,unknownCount=0;
  for(const vehicle of vehicles){
    const source=vehicle.fleetColorSource;
    const color=String(vehicle.serviceColor||'').trim();
    if((source==='upstream-api'||source==='verified-livery-record')&&/^#[0-9a-f]{6}$/i.test(color)){
      const normalized=color.toUpperCase(),key=source+':'+normalized,prior=counts.get(key);
      if(prior)prior.count++;
      else counts.set(key,{source,color:normalized,count:1});
    }
    if(vehicle.operatorType==='dtc')dtcCount++;
    else if(vehicle.operatorType==='cluster')dimtsCount++;
    else unknownCount++;
  }
  const rows=[...counts.values()].sort((a,b)=>a.source.localeCompare(b.source)||b.count-a.count||a.color.localeCompare(b.color))
    .map(row=>({key:row.source+':'+row.color,label:(row.source==='upstream-api'?'Live API · physical colour':'Reviewed physical colour')+' · '+row.color+' ('+row.count+')',color:row.color}));
  useEffect(()=>{
    if(!open)return;
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  },[open,onClose]);
  if(!open)return null;

  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Map Marker Colour Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={event=>event.stopPropagation()}>
      <h2>Map Marker Colours</h2>
      <p className="legend-colour-note">Markers identify each live vehicle's operator, not its route or AC/CNG/EV type. A route can carry both DTC and DIMTS / Cluster vehicles, so vehicles on the same route can have different marker colours. Verified per-vehicle physical colours take priority when available.</p>
      <div className="legend-section-title">Operator markers</div>
      <div className="legend-route-counts">
        <span><i className="legend-route-swatch" style={{backgroundColor:BUS_OPERATOR_MARKER_COLORS.DTC}}/>DTC · green <b>{dtcCount}</b></span>
        <span><i className="legend-route-swatch" style={{backgroundColor:BUS_OPERATOR_MARKER_COLORS.DIMTS}}/>DIMTS / Cluster · orange <b>{dimtsCount}</b></span>
        <span><i className="legend-route-swatch" style={{backgroundColor:UNKNOWN_BUS_MARKER_COLOR}}/>Unknown operator · neutral <b>{unknownCount}</b></span>
      </div>
      <div className="legend-section-title">Verified physical bus colours</div>
      {rows.length?rows.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:row.color}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">{row.label}</span>
      </div>):<p className="legend-empty">No verified physical bus colours are currently supplied for the visible live fleet.</p>}
      <p className="legend-empty">Grey means the operator could not be identified from available vehicle data.</p>
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}
