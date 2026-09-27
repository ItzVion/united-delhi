import {useEffect,useState} from 'react';
import {motion,AnimatePresence} from 'framer-motion';
import {MapContainer,TileLayer,CircleMarker,Polyline,useMap} from 'react-leaflet';
import {api,Vehicle} from './api';

const routeName=(s:string)=>String(s||'Bus').replace(/(?:UP|DOWN|DWN)$/i,'').replace(/^AIR-0+/i,'AIR-');
const fresh=(s?:string)=>{if(!s)return'Live';const n=Date.parse(s);if(!Number.isFinite(n))return'Live';const x=Math.max(0,Math.round((Date.now()-n)/1000));return x<60?'Just now':Math.floor(x/60)+' min ago'};
function Fit({points}:{points:[number,number][]}){const m=useMap();useEffect(()=>{if(points.length>1)m.fitBounds(points as any,{padding:[25,25],maxZoom:13})},[m,points]);return null}

const metroLines=[
 ['Red','Rithala → Shaheed Sthal (New Bus Adda)','29'],
 ['Yellow','Samaypur Badli → Millennium City Centre Gurugram','37'],
 ['Blue','Dwarka Sector 21 → Noida Electronic City','50'],
 ['Blue','Yamuna Bank → Vaishali','8'],
 ['Green','Kirti Nagar / Inderlok → Brig. Hoshiar Singh','24'],
 ['Violet','Kashmere Gate → Raja Nahar Singh (Ballabhgarh)','34'],
 ['Pink','Majlis Park → Shiv Vihar','38'],
 ['Magenta','Krishna Park Extension / Janakpuri West → Botanical Garden','26'],
 ['Grey','Dwarka → Dhansa Bus Stand','4'],
 ['Airport Express','New Delhi → Yashobhoomi Dwarka Sector 25','7'],
];

const consentKey='ud-consent-v1';

export default function App(){
 const [accepted,setAccepted]=useState(localStorage.getItem(consentKey)==='1');
 const [consent,setConsent]=useState(false);
 const [tab,setTab]=useState('home'); const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [q,setQ]=useState(''); const [results,setResults]=useState<any[]>([]); const [detail,setDetail]=useState<any>(null);
 const [error,setError]=useState(''); const [legalView,setLegalView]=useState<'terms'|'privacy'|null>(null);
 useEffect(()=>{if(!accepted)return;let on=true;const load=async()=>{try{const r=await api.vehicles();if(on)setVehicles(r.vehicles||[])}catch(e){if(on)setError((e as Error).message)}};load();const id=setInterval(load,30000);return()=>{on=false;clearInterval(id)}},[accepted]);

 const openLegal=(view:'terms'|'privacy')=>setLegalView(view);
 if(!accepted)return <ConsentScreen checked={consent} setChecked={setConsent} onContinue={()=>{localStorage.setItem(consentKey,'1');setAccepted(true)}} onLegal={openLegal} legalView={legalView} closeLegal={()=>setLegalView(null)}/>;

 const open=async(item:any)=>{setError('');try{if(item.type==='route')setDetail({kind:'route',data:await api.route(item.id)});else{const [stop,arr]=await api.stop(item.id);setDetail({kind:'stop',data:{...stop,arrivals:arr.arrivals||[]}})}}catch(e){setError((e as Error).message)}};
 const search=async()=>{if(q.trim().length<2)return;setError('');try{setResults((await api.search(q.trim())).results||[]);setTab('search')}catch(e){setError((e as Error).message)}};
 const nav=(x:string)=>{setTab(x);setDetail(null);setError('')};
 const points=vehicles.map(v=>[v.latitude,v.longitude] as [number,number]);
 return <div className="app">
  <header className="top"><div className="brand"><div className="logo">UD</div><div><b>UNITED DELHI</b><span>Delhi transit, made simple</span></div></div>
   <div className="search"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="Search routes, stops or places"/><button className="btn" onClick={search}>Search</button></div>
  </header>
  <nav className="nav">{[['home','Home'],['search','Search'],['planner','Plan trip'],['metro','Metro'],['nearby','Nearby'],['legal','Legal']].map(([id,label])=><button className={tab===id?'active':''} onClick={()=>nav(id)} key={id}>{label}</button>)}</nav>
  <main>{error&&<div className="error">{error}</div>}
   <AnimatePresence mode="wait"><motion.div key={detail?'detail':tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.18}}>
    {detail?<Detail detail={detail} back={()=>setDetail(null)}/>:tab==='home'?<Home vehicles={vehicles} points={points} open={open}/>:tab==='search'?<Search results={results} open={open}/>:tab==='planner'?<Planner/>:tab==='metro'?<Metro/>:tab==='nearby'?<Nearby open={open}/>:<Legal onLegal={openLegal}/>}
   </motion.div></AnimatePresence>
  </main>
  <footer><span>Live DTC data</span><span>{vehicles.length} buses online</span><span>United Delhi</span></footer>
 </div>
}

function ConsentScreen({checked,setChecked,onContinue,onLegal,legalView,closeLegal}:{checked:boolean;setChecked:(v:boolean)=>void;onContinue:()=>void;onLegal:(v:'terms'|'privacy')=>void;legalView:'terms'|'privacy'|null;closeLegal:()=>void}){
 return <div className="gate"><motion.div className="card consent-card" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}}>
   <div className="logo">UD</div><div className="eyebrow">WELCOME TO UNITED DELHI</div><h1>Delhi transit,<br/>made simple.</h1>
   <p>By continuing to United Delhi, you agree to our <button className="inline-link" onClick={()=>onLegal('terms')}>Terms of Service</button> and acknowledge our <button className="inline-link" onClick={()=>onLegal('privacy')}>Privacy Policy</button>.</p>
   <label className="consent-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span></label>
   <button className="btn continue" disabled={!checked} onClick={onContinue}>Continue to United Delhi</button>
   <p className="small">No account or phone number is required. Location is requested only when you choose a location-based feature.</p>
   {legalView&&<LegalModal view={legalView} close={closeLegal}/>}
 </motion.div></div>
}

function LegalModal({view,close}:{view:'terms'|'privacy';close:()=>void}){
 return <div className="legal-overlay" role="dialog" aria-modal="true"><div className="legal-modal"><div className="modal-head"><div><div className="eyebrow">UNITED DELHI</div><h2>{view==='terms'?'Terms of Service':'Privacy Policy'}</h2></div><button className="btn alt" onClick={close}>Close</button></div>
 {view==='terms'?<TermsText/>:<PrivacyText/>}</div></div>
}

function TermsText(){return <div className="legal-copy"><p><b>United Delhi is an independent transit-information service.</b> It provides route, stop, map, journey-planning and realtime vehicle information. It is not a transport operator, government agency, emergency service or traffic-control service.</p><h3>Using the service</h3><p>Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped or unavailable. Realtime positions and journey-planning times are estimates and should not be treated as guarantees.</p><h3>Acceptable use</h3><p>Use United Delhi lawfully. Do not attack, probe, bypass safeguards, obtain secrets, abuse upstream services, impersonate the service, stalk or profile people, transmit malicious code, or misrepresent United Delhi as an official government or transport service.</p><h3>Third-party services</h3><p>United Delhi relies on third-party transit data, maps, hosting and infrastructure. Their availability and terms can change independently. Third-party trademarks, data and software remain with their respective owners.</p><h3>Availability and changes</h3><p>The service can change, be suspended, or become unavailable. Nothing here guarantees continuous realtime data or compatibility with every device.</p><h3>Contact and legal review</h3><p>The full project Terms are published in the repository. Before a public or commercial launch, the final Terms, Privacy Policy, age/data requirements and third-party arrangements should be reviewed by a qualified Indian lawyer.</p></div>}

function PrivacyText(){return <div className="legal-copy"><p><b>United Delhi is designed to work without an account.</b> We do not currently ask for a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier or payment information.</p><h3>Location</h3><p>Location is optional. When you choose Nearby, your device location is used to find nearby DTC stops. The current web client does not intentionally store your location in the United Delhi database.</p><h3>Search and planning</h3><p>Search and journey-planning text is sent to the United Delhi API to return transit information. The app does not intentionally build a user profile from those requests.</p><h3>Technical information</h3><p>Normal network and security information such as IP addresses, timestamps and request metadata may be processed by hosting, network or security infrastructure.</p><h3>Tracking and advertising</h3><p>United Delhi does not currently use advertising SDKs, personalized advertising, behavioral tracking or advertising identifiers.</p><h3>Children and applicable law</h3><p>United Delhi does not use an age wall in the current interface. Where applicable law requires additional safeguards for children or other users, those requirements take priority and the service should be updated accordingly.</p><h3>Rights and contact</h3><p>Privacy requests should use the privacy contact published in the full Privacy Policy. Do not send passwords, API keys or database credentials in a privacy request.</p></div>}

function Home({vehicles,points,open}:{vehicles:Vehicle[];points:[number,number][];open:(x:any)=>void}){
 return <><section className="hero"><div><div className="eyebrow">LIVE TRANSIT</div><h1>Delhi transit,<br/>made simple.</h1><p>Track DTC buses, explore routes, understand the Metro network and plan your next trip.</p></div><div className="pill">{vehicles.length} buses live</div></section>
 <div className="map"><MapContainer center={[28.6139,77.209]} zoom={11} scrollWheelZoom><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/><Fit points={points}/>{vehicles.map(v=><CircleMarker key={v.id} center={[v.latitude,v.longitude]} radius={7} pathOptions={{color:'#fff',weight:2,fillColor:'#f28c28',fillOpacity:1}} eventHandlers={{click:()=>open({type:'route',id:v.routeId})}}/>)}</MapContainer></div>
 <div className="cards"><div className="card"><div className="eyebrow">LIVE NETWORK</div><b>{vehicles.length}</b><span>vehicles currently visible</span></div><div className="card"><div className="eyebrow">BUS</div><b>Routes & stops</b><span>Find exact route variants, directions and live buses.</span></div><div className="card"><div className="eyebrow">METRO</div><b>Network & planning</b><span>Explore Delhi Metro lines and open the official planner when needed.</span></div></div></>
}

function Search({results,open}:{results:any[];open:(x:any)=>void}){return <section className="panel"><div className="eyebrow">SEARCH RESULTS</div><h2>Find your bus</h2>{!results.length?<div className="card"><p>Search for a route number, stop or place above.</p></div>:results.map((x,i)=><motion.button className="result" key={x.type+x.id+i} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} transition={{delay:i*.02}} onClick={()=>open(x)}><div className="badge">{routeName(x.label||x.short_name||'STOP')}</div><div><b>{x.type==='route'?'Bus route':'Bus stop'}</b><span>{x.type==='route'?(x.fromStop||'Start')+' → '+(x.toStop||'Destination'):x.label}</span></div><i>›</i></motion.button>)}</section>}

function Detail({detail,back}:{detail:any;back:()=>void}){const d=detail.data;if(detail.kind==='stop')return <section className="panel"><button className="btn alt" onClick={back}>← Back</button><h2>{d.stop.name}</h2><p>{d.stop.stop_id}</p><div className="card"><h3>Live arrivals</h3>{d.arrivals.length?d.arrivals.map((v:any)=><div className="stop" key={v.id}><b>{routeName(v.routeShortName)}</b><span>To {v.toStop||'Destination'} · {Math.round(v.distanceMeters||0)} m · {fresh(v.observedAt)}</span></div>):<p>No live buses are currently close to this stop.</p>}</div></section>;
 const r=d.route,stops=d.stops||[],buses=d.vehicles||[],pts=stops.map((s:any)=>[s.latitude,s.longitude] as [number,number]);
 return <section className="panel"><button className="btn alt" onClick={back}>← Back</button><div className="route-head"><div className="badge">{routeName(r.short_name)}</div><div><div className="eyebrow">ROUTE</div><h2>{r.fromStop||'Start'} → {r.toStop||'Destination'}</h2><p>{stops.length} stops · {buses.length} live buses</p></div></div><div className="grid2"><div className="map small-map"><MapContainer center={pts[0]||[28.6139,77.209]} zoom={11} scrollWheelZoom><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/><Fit points={pts}/>{pts.length>1&&<Polyline positions={pts} pathOptions={{color:'#0b746b',weight:5}}/>}</MapContainer></div><div className="card"><h3>Live buses</h3>{buses.length?buses.map((v:any)=><div className="stop" key={v.id}><b>{v.id}</b><span>To {v.toStop||r.toStop||'Destination'} · {fresh(v.observedAt)}</span></div>):<p>No live buses on this exact route variant right now.</p>}</div></div><div className="card"><h3>Ordered stops</h3>{stops.map((s:any,i:number)=><div className="stop" key={s.stop_id}><b>{i+1}. {s.name}</b><span>{s.stop_id}</span></div>)}</div></section>
}

function Planner(){const [from,setFrom]=useState(''),[to,setTo]=useState(''),[out,setOut]=useState<any[]>([]),[busy,setBusy]=useState(false);return <section className="panel"><div className="eyebrow">TRIP PLANNER</div><h2>Plan your trip</h2><div className="planner-choice"><div className="card choice active"><b>🚌 DTC bus</b><span>Search the United Delhi bus planner.</span></div><a className="card choice" href="https://delhimetrorail.com/" target="_blank" rel="noreferrer"><b>🚇 Delhi Metro</b><span>Open the official DMRC journey planner, route and fare tools.</span><strong>Open DMRC →</strong></a></div><div className="card"><div className="field"><input value={from} onChange={e=>setFrom(e.target.value)} placeholder="From stop or place"/><input value={to} onChange={e=>setTo(e.target.value)} placeholder="To stop or place"/><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{setOut((await api.plan(from,to)).options||[])}catch(e){setOut([])}finally{setBusy(false)}}}>{busy?'Planning…':'Find buses'}</button></div></div>{out.map((o,i)=><div className="card" key={i}><b>{o.type==='direct'?'DIRECT BUS':'ONE CHANGE'}</b><span>{o.durationMinutes} min · Walk {o.walkingMinutes} min</span>{(o.legs||[]).map((l:any)=><p key={l.routeId}>{routeName(l.routeName)} · {l.fromStop} → {l.toStop}</p>)}</div>)}</section>}

function Metro(){return <section className="panel"><div className="eyebrow">DELHI METRO</div><h2>Metro network</h2><p>United Delhi does not track individual Metro trains. This section focuses on network, station and journey information using official DMRC information.</p><a className="btn metro-link" href="https://delhimetrorail.com/" target="_blank" rel="noreferrer">Open official DMRC journey planner ↗</a><div className="metro-grid">{metroLines.map(([line,route,count])=><div className="card metro-card" key={line+route}><div className="metro-line">{line}</div><b>{route}</b><span>{count} stations</span></div>)}</div><div className="card"><h3>Current network reference</h3><p>DMRC's current network information includes Delhi Metro and connected NCR systems. Line openings and service information can change, so use the official DMRC service status for operational changes.</p><a href="https://delhimetrorail.com/pages/about-us/present-network" target="_blank" rel="noreferrer">View DMRC network details ↗</a></div></section>}

function Nearby({open}:{open:(x:any)=>void}){const [stops,setStops]=useState<any[]>([]);const [msg,setMsg]=useState('Press the button to find nearby DTC stops.');const find=()=>navigator.geolocation?.getCurrentPosition(async p=>{setMsg('Loading…');try{setStops((await api.nearby(p.coords.latitude,p.coords.longitude)).stops||[]);setMsg('')}catch(e){setMsg((e as Error).message)}},()=>setMsg('Location permission was not granted.'),{enableHighAccuracy:false,maximumAge:300000,timeout:10000});return <section className="panel"><div className="eyebrow">AROUND YOU</div><h2>Nearby DTC stops</h2><p>We only ask for your location after you press the button.</p><button className="btn" onClick={find}>Use my location</button><p>{msg}</p>{stops.map(s=><button className="result" key={s.stop_id} onClick={()=>open({type:'stop',id:s.stop_id})}><div><b>{s.name}</b><span>{Math.round(s.distance_m||0)} m away</span></div><i>›</i></button>)}</section>}

function Legal({onLegal}:{onLegal:(v:'terms'|'privacy')=>void}){return <section className="panel"><div className="eyebrow">UNITED DELHI</div><h2>Legal & privacy</h2><div className="card"><p>United Delhi does not require an account or phone number. Location is requested only for location-based features such as Nearby.</p><p><button className="inline-link" onClick={()=>onLegal('privacy')}>Privacy Policy</button> · <button className="inline-link" onClick={()=>onLegal('terms')}>Terms of Service</button> · <a href="https://github.com/ItzVion/united-delhi/blob/main/SECURITY.md" target="_blank" rel="noreferrer">Security</a></p><p className="small">The repository contains the full legal documents. Final public/commercial launch should use a monitored legal contact and appropriate legal review.</p></div></section>}
