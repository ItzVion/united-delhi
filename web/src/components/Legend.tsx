import {useEffect} from 'react';
import {Icon} from './ui';
import {BUS_TYPE_COLOR_LEGEND} from '../lib';
type Props={open:boolean;onClose:()=>void};
export default function Legend({open,onClose}:Props){
  useEffect(()=>{if(!open)return;const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown)},[open,onClose]);
  if(!open)return null;
  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={event=>event.stopPropagation()}>
      <h2>Bus Color Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Type</span></div>
      {BUS_TYPE_COLOR_LEGEND.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons">{row.colors.map((color,index)=><span className="legend-exact-bus" key={color+index} style={{backgroundColor:color}}><Icon n="bus" size={18}/></span>)}</div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}
