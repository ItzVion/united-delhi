import {useEffect} from 'react';
import {Icon} from './ui';
import type {Vehicle} from '../api';

type Props={open:boolean;onClose:()=>void;vehicles:Vehicle[]};
const LEGEND_ROWS=[
  {key:'ev-ac-12',label:'EV AC (12 mtr)',colors:['#52C2D6']},
  {key:'ev-devi-ac-9',label:'EV DEVI AC (9 mtr)',colors:['#52C2D6','#229552']},
  {key:'cng-ac-12',label:'CNG AC (12 mtr)',colors:['#3081EB','#ED4A4D']},
  {key:'cng-nonac-12',label:'CNG NonAC (12 mtr)',colors:['#F1A96E','#61E29A']}
];

export default function Legend({open,onClose}:Props){
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
      <div className="legend-head-exact"><span>Bus Icon</span><span>Type</span></div>
      {LEGEND_ROWS.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons">{row.colors.map(color=><span key={color} className="legend-exact-bus" style={{backgroundColor:color}}><Icon n="bus" size={22}/></span>)}</div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      <button className="legend-understood" onClick={onClose}>Understood!</button>
    </div>
  </div>;
}
