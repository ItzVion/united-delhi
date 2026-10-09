import {useEffect} from 'react';
import {Icon} from './ui';

// These are fixed legend samples matching One Delhi. Live bus markers remain API-coloured.
const rows=[
  {key:'ev-ac',label:'EV AC (12 mtr)',color:'#0C7A94'},
  {key:'ev-devi',label:'EV DEVI AC (9 mtr)',color:'#0BA34F'},
  {key:'cng-ac',label:'CNG AC (12 mtr)',color:'#2451E8'},
  {key:'cng-nonac',label:'CNG NonAC (12 mtr)',color:'#FF720D'}
];
export default function Legend({open,onClose}:{open:boolean;onClose:()=>void}){
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
  if(!open)return null;
  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={e=>e.stopPropagation()}>
      <h2>Bus Color Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Type</span></div>
      {rows.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:row.color}}><Icon n="bus" size={22}/></span></div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      <button className="legend-understood" onClick={onClose}>Got it</button>
    </div>
  </div>;
}
