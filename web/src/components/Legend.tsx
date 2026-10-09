import {useEffect} from 'react';

const rows=[
  {key:'ev-ac',colors:['#0E7490'],label:'EV AC (12 mtr) — larger teal markers'},
  {key:'ev-devi',colors:['#16A34A'],label:'EV DEVI AC (9 mtr) — green markers'},
  {key:'cng-ac',colors:['#1D4ED8'],label:'CNG AC (12 mtr) — smaller blue markers'},
  {key:'cng-nonac',colors:['#F97316'],label:'CNG NonAC (12 mtr) — orange markers'}
];

export default function Legend({open,onClose}:{open:boolean;onClose:()=>void}){
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
  if(!open)return null;
  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={e=>e.stopPropagation()}>
      <h2>Bus Color Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Type</span></div>
      {rows.map((row,i)=><div className="legend-exact-row" key={i}>
        <div className="legend-exact-icons"><span className={'legend-map-dot '+row.key} style={{backgroundColor:row.colors[0]}} aria-hidden="true"/></div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      <button className="legend-understood" onClick={onClose}>Understood</button>
    </div>
  </div>;
}