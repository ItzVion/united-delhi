import {useEffect,useMemo} from 'react';
import type {Vehicle} from '../api';
import {Icon} from './ui';

const categories=[
  {key:'ev-ac',label:'EV AC (12 mtr)'},
  {key:'ev-devi',label:'EV DEVI AC (9 mtr)'},
  {key:'cng-ac',label:'CNG AC (12 mtr)'},
  {key:'cng-nonac',label:'CNG NonAC (12 mtr)'}
];
const categoryFor=(value:string)=>{
 const type=String(value||'').toUpperCase().replace(/[\s-]/g,'');
 if(type.startsWith('EVDEVIAC'))return 'ev-devi';
 if(type.startsWith('EVAC'))return 'ev-ac';
 if(type.startsWith('CNGNONAC'))return 'cng-nonac';
 if(type.startsWith('CNGAC'))return 'cng-ac';
 return null;
};
function apiLegendRows(vehicles:Vehicle[]){
 const tallies=new Map<string,Map<string,number>>();
 for(const vehicle of vehicles){
  const key=categoryFor(vehicle.busType||''),color=String(vehicle.serviceColor||'').trim();
  if(!key||!/^#[0-9a-f]{6}$/i.test(color))continue;
  const colors=tallies.get(key)||new Map<string,number>();
  colors.set(color,(colors.get(color)||0)+1);
  tallies.set(key,colors);
 }
 return categories.map(category=>{
  const colors=[...(tallies.get(category.key)||new Map<string,number>())].sort((a,b)=>b[1]-a[1]);
  return colors.length?{...category,color:colors[0][0]}:null;
 }).filter((row):row is {key:string;label:string;color:string}=>row!==null);
}
export default function Legend({open,onClose,vehicles}:{open:boolean;onClose:()=>void;vehicles:Vehicle[]}){
  const rows=useMemo(()=>apiLegendRows(vehicles),[vehicles]);
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
  if(!open)return null;
  return <div className="modal legend-modal" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="modal-card legend-exact" onClick={e=>e.stopPropagation()}>
      <h2>Bus Color Legend</h2>
      <div className="legend-head-exact"><span>Bus Icon</span><span>Type</span></div>
      {rows.map(row=><div className="legend-exact-row" key={row.key}>
        <div className="legend-exact-icons"><span className="legend-exact-bus" style={{backgroundColor:row.color}}><Icon n="bus" size={26}/></span></div>
        <span className="legend-exact-type">{row.label}</span>
      </div>)}
      {!rows.length?<p className="legend-exact-type">Live colour data is unavailable.</p>:null}
      <button className="legend-understood" onClick={onClose}>Understood</button>
    </div>
  </div>;
}