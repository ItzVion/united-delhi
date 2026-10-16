import {useEffect} from 'react';
import {Icon} from './ui';
import type {Vehicle} from '../api';
import {ROUTE_MARKER_PALETTE,busMarkerKind} from '../lib';

type Props={open:boolean;onClose:()=>void;vehicles:Vehicle[]};

export default function Legend({open,onClose,vehicles}:Props){
  const counts=new Map<string,{source:'upstream-api'|'verified-livery-record';color:string;count:number}>();
  let routeColourCount=0,displayPaletteCount=0,physicalCount=0;
  for(const vehicle of vehicles){
    const source=vehicle.fleetColorSource;
    const color=String(vehicle.serviceColor||'').trim();
    if((source==='upstream-api'||source==='verified-livery-record')&&/^#[0-9a-f]{6}$/i.test(color)){
      const normalized=color.toUpperCase(),key=source+':'+normalized,prior=counts.get(key);
      if(prior)prior.count++;
      else counts.set(key,{source,color:normalized,count:1});
      physicalCount++;
    }else{
      const kind=busMarkerKind(vehicle);
      if(kind==='route')routeColourCount++;
      else displayPaletteCount++;
    }
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
      <p className="legend-colour-note">A marker's colour distinguishes a route; it is not necessarily the physical paint on that bus. We show a real vehicle colour only when the live API supplies it or reviewed vehicle evidence verifies it.</p>
      <div className="legend-section-title">Verified physical bus colours</div>
      {rows.length?rows.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:row.color}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">{row.label}</span>
      </div>):<p className="legend-empty">No verified physical bus colours are currently supplied for the visible live fleet.</p>}
      <div className="legend-section-title">Route distinction colours</div>
      <div className="legend-route-counts">
        <span><i className="legend-route-swatch" style={{backgroundColor:"#2563EB"}}/>Static GTFS route colour <b>{routeColourCount}</b></span>
        <span><i className="legend-route-swatch" style={{backgroundColor:ROUTE_MARKER_PALETTE[1]}}/>Display-only palette colour <b>{displayPaletteCount}</b></span>
      </div>
      <div className="legend-palette" aria-label="Display-only marker palette">
        {ROUTE_MARKER_PALETTE.map((color,index)=><span key={color} title={'Display-only marker palette colour '+(index+1)} style={{backgroundColor:color}}/>)}
      </div>
      <p className="legend-empty">A ? on a marker means that bus's physical paint is not verified. Palette colours are stable for the same route between refreshes.</p>
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}
