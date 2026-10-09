import {useEffect} from 'react';
import {Icon} from './ui';

// Palette sampled from the One Delhi reference legend. These are examples only;
// live vehicle markers continue to use the colour supplied by the API.
const rows=[
  {key:'ev-ac',label:'EV AC (12 mtr)',colors:['#54C4D8']},
  {key:'ev-devi-ac',label:'EV DEVI AC (9 mtr)',colors:['#FF7F21','#219653']},
  {key:'cng-ac',label:'CNG AC (12 mtr)',colors:['#2F80ED','#EB4B4B']},
  {key:'cng-nonac',label:'CNG NonAC (12 mtr)',colors:['#F2A76D','#62E099']}
];
export default function Legend({open,onClose}:{open:boolean;onClose:()=>void}){
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
  if(!open)return null;
  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={e=>e.stopPropagation()}>
      <h2>Bus Color Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Type</span></div>
      {rows.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons">{row.colors.map((color,index)=><span key={row.key+'-'+index} className="legend-exact-bus" style={{backgroundColor:color}}><Icon n="bus" size={22}/></span>)}</div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}
