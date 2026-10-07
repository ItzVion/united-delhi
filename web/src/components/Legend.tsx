import {useEffect} from 'react';
import {Icon} from './ui';

const rows=[
  {colors:['#58B8C7'],label:'EV AC (12 mtr)'},
  {colors:['#E7A05F','#42A968'],label:'EV DEVI AC (9 mtr)'},
  {colors:['#4D8FD0','#DE737B'],label:'CNG AC (12 mtr)'},
  {colors:['#E8B083','#55B98E'],label:'CNG NonAC (12 mtr)'}
];

export default function Legend({open,onClose}:{open:boolean;onClose:()=>void}){
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
  if(!open)return null;
  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={e=>e.stopPropagation()}>
      <h2>Bus Color Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Type</span></div>
      {rows.map((row,i)=><div className="legend-exact-row" key={i}>
        <div className="legend-exact-icons">{row.colors.map((color,j)=><span className="legend-exact-bus" key={j} style={{backgroundColor:color}}><Icon n="bus" size={26}/></span>)}</div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}