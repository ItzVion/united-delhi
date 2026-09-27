import {useEffect,useState} from 'react';
import {motion,AnimatePresence} from 'framer-motion';
import {MapContainer,TileLayer,CircleMarker,Polyline,useMap} from 'react-leaflet';
import {api,Vehicle} from './api';

const routeName=(s:string)=>String(s||'Bus').replace(/(?:UP|DOWN|DWN)$/i,'').replace(/^AIR-0+/i,'AIR-');
const fresh=(s?:string)=>{if(!s)return'Live';const n=Date.parse(s);if(!Number.isFinite(n))return'Live';const x=Math.max(0,Math.round((Date.now()-n)/1000));return x<60?'Just now':Math.floor(x/60)+' min ago'};
function Fit({points}:{points:[number,number][]}){const m=useMap();useEffect(()=>{if(points.length>1)m.fitBounds(points as any,{padding:[25,25],maxZoom:13})},[m,points]);return null}

export default function App(){
 const [accepted,setAccepted]=useState(sessionStorage.getItem('ud-age')==='1');
 const [tab,setTab]=useState('home'); const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [q,setQ]=useState(''); const [results,setResults]=useState<any[]>([]); const [detail,setDetail]=useState<any>(null);
 const [error,setError]=useState('');
 useEffect(()=>{if(!accepted)return;let on=true;const load=async()=>{try{const r=await api.vehicles();if(on)setVehicles(r.vehicles||[])}catch(e){if(on)setError((e as Error).message)}};load();const id=setInterval(load,30000);return()=>{on=false;clearInterval(id)}},[accepted]);
 if(!accepted)return <div className="gate"><motion.div className="card" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}}><div className="logo">UD</div><h1>United Delhi</h1><p>This production service is currently limited to people aged 18 or older because it can process location and online request data.</p><button className="btn" onClick={()=>{sessionStorage.setItem('ud-age','1');setAccepted(true)}}>I am 18 or older</button><p className="small">Your age is not saved by this screen.</p></motion.div></div>;

 const open=async(item:any)=>{setError('');try{if(item.type==='route')setDetail({kind:'route',data:await api.route(item.id)});else{const [stop,arr]=await api.stop(item.id);setDetail({kind:'stop',data:{...stop,arrivals:arr.arrivals||[]}})}}catch(e){setError((e as Error).message)}};
 const search=async()=>{if(q.trim().length<2)return;setError('');try{setResults((await api.search(q.trim())).results||[]);setTab('search')}catch(e){setError((e as Error).message)}};
 const nav=(x:string)=>{setTab(x);setDetail(null);setError('')};
 const points=vehicles.map(v=>[v.latitude,v.longitude] as [number,number]);
 return <div className="app">
  <header className="top"><div className="brand"><div className="logo">UD</div><div><b>UNITED DELHI</b><span>Delhi transit, made simple</span></div></div>
   <div className="search"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="Search routes, stops or places"/><button className="btn" onClick={search}>Search</button></div>
  </header>
  <nav className="nav">{[['home','Home'],['search','Search'],['planner','Plan trip'],['nearby','Nearby'],['legal','Legal']].map(([id,label])=><button className={tab===id?'active':''} onClick={()=>nav(id)} key={id}>{label}</button>)}</nav>
  <main>{error&&<div className="error">{error}</div>}
   <AnimatePresence mode="wait"><motion.div key={detail?'detail':tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.18}}>
    {detail?<Detail detail={detail} back={()=>setDetail(null)}/>:tab==='home'?<Home vehicles={vehicles} points={points} open={open}/>:tab==='search'?<Search results={results} open={open}/>:tab==='planner'?<Planner/>:tab==='nearby'?<Nearby open={open}/>:<Legal/>}
   </motion.div></AnimatePresence>
  </main>
  <footer><span>Live DTC data</span><span>{vehicles.length} buses online</span><span>United Delhi</span></footer>
 </div>
}

function Home({vehicles,points,open}:{vehicles:Vehicle[];points:[number,number][];open:(x:any)=>void}){
 return <><section className="hero"><div><div className="eyebrow">LIVE TRANSIT</div><h1>Delhi transit,<br/>made simple.</h1><p>Track DTC buses, explore routes and find your next stop.</p></div><div className="pill">{vehicles.length} buses live</div></section>
 <div className="map"><MapContainer center={[28.6139,77.209]} zoom={11} scrollWheelZoom><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/><Fit points={points}/>{vehicles.map(v=><CircleMarker key={v.id} center={[v.latitude,v.longitude]} radius={7} pathOptions={{color:'#fff',weight:2,fillColor:'#f28c28',fillOpacity:1}} eventHandlers={{click:()=>open({type:'route',id:v.routeId})}}/>)}</MapContainer></div>
 <div className="cards"><div className="card"><div className="eyebrow">LIVE NETWORK</div><b>{vehicles.length}</b><span>vehicles currently visible</span></div><div className="card"><div className="eyebrow">SEARCH</div><b>Routes & stops</b><span>Find exact route variants and directions.</span></div><div className="card"><div className="eyebrow">NEARBY</div><b>Stops around you</b><span>Location is requested only when needed.</span></div></div></>
}

function Search({results,open}:{results:any[];open:(x:any)=>void}){return <section className="panel"><div className="eyebrow">SEARCH RESULTS</div><h2>Find your bus</h2>{!results.length?<div className="card"><p>Search for a route number, stop or place above.</p></div>:results.map((x,i)=><motion.button className="result" key={x.type+x.id+i} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} transition={{delay:i*.02}} onClick={()=>open(x)}><div className="badge">{routeName(x.label||x.short_name||'STOP')}</div><div><b>{x.type==='route'?'Bus route':'Bus stop'}</b><span>{x.type==='route'?(x.fromStop||'Start')+' → '+(x.toStop||'Destination'):x.label}</span></div><i>›</i></motion.button>)}</section>}

function Detail({detail,back}:{detail:any;back:()=>void}){const d=detail.data;if(detail.kind==='stop')return <section className="panel"><button className="btn alt" onClick={back}>← Back</button><h2>{d.stop.name}</h2><p>{d.stop.stop_id}</p><div className="card"><h3>Live arrivals</h3>{d.arrivals.length?d.arrivals.map((v:any)=><div className="stop" key={v.id}><b>{routeName(v.routeShortName)}</b><span>To {v.toStop||'Destination'} · {Math.round(v.distanceMeters||0)} m · {fresh(v.observedAt)}</span></div>):<p>No live buses are currently close to this stop.</p>}</div></section>;
 const r=d.route,stops=d.stops||[],buses=d.vehicles||[],pts=stops.map((s:any)=>[s.latitude,s.longitude] as [number,number]);
 return <section className="panel"><button className="btn alt" onClick={back}>← Back</button><div className="route-head"><div className="badge">{routeName(r.short_name)}</div><div><div className="eyebrow">ROUTE</div><h2>{r.fromStop||'Start'} → {r.toStop||'Destination'}</h2><p>{stops.length} stops · {buses.length} live buses</p></div></div><div className="grid2"><div className="map small-map"><MapContainer center={pts[0]||[28.6139,77.209]} zoom={11} scrollWheelZoom><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/><Fit points={pts}/>{pts.length>1&&<Polyline positions={pts} pathOptions={{color:'#0b746b',weight:5}}/>}</MapContainer></div><div className="card"><h3>Live buses</h3>{buses.length?buses.map((v:any)=><div className="stop" key={v.id}><b>{v.id}</b><span>To {v.toStop||r.toStop||'Destination'} · {fresh(v.observedAt)}</span></div>):<p>No live buses on this exact route variant right now.</p>}</div></div><div className="card"><h3>Ordered stops</h3>{stops.map((s:any,i:number)=><div className="stop" key={s.stop_id}><b>{i+1}. {s.name}</b><span>{s.stop_id}</span></div>)}</div></section>
}

function Planner(){const [from,setFrom]=useState(''),[to,setTo]=useState(''),[out,setOut]=useState<any[]>([]),[busy,setBusy]=useState(false);return <section className="panel"><div className="eyebrow">TRIP PLANNER</div><h2>Plan your trip</h2><div className="card"><div className="field"><input value={from} onChange={e=>setFrom(e.target.value)} placeholder="From stop or place"/><input value={to} onChange={e=>setTo(e.target.value)} placeholder="To stop or place"/><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{setOut((await api.plan(from,to)).options||[])}finally{setBusy(false)}}}>{busy?'Planning…':'Find buses'}</button></div></div>{out.map((o,i)=><div className="card" key={i}><b>{o.type==='direct'?'DIRECT BUS':'ONE CHANGE'}</b><span>{o.durationMinutes} min · Walk {o.walkingMinutes} min</span>{(o.legs||[]).map((l:any)=><p key={l.routeId}>{routeName(l.routeName)} · {l.fromStop} → {l.toStop}</p>)}</div>)}</section>}

function Nearby({open}:{open:(x:any)=>void}){const [stops,setStops]=useState<any[]>([]);const [msg,setMsg]=useState('Press the button to find nearby DTC stops.');const find=()=>navigator.geolocation?.getCurrentPosition(async p=>{setMsg('Loading…');try{setStops((await api.nearby(p.coords.latitude,p.coords.longitude)).stops||[]);setMsg('')}catch(e){setMsg((e as Error).message)}},()=>setMsg('Location permission was not granted.'),{enableHighAccuracy:false,maximumAge:300000,timeout:10000});return <section className="panel"><div className="eyebrow">AROUND YOU</div><h2>Nearby DTC stops</h2><button className="btn" onClick={find}>Use my location</button><p>{msg}</p>{stops.map(s=><button className="result" key={s.stop_id} onClick={()=>open({type:'stop',id:s.stop_id})}><div><b>{s.name}</b><span>{Math.round(s.distance_m||0)} m away</span></div><i>›</i></button>)}</section>}

function Legal(){return <section className="panel"><div className="eyebrow">UNITED DELHI</div><h2>Privacy & security</h2><div className="card"><p>Location is requested only for nearby-stop features. Private DTC and database credentials remain on the backend and are never shipped to this website.</p><p>Live vehicle data is served through the United Delhi backend.</p><p><a href="https://github.com/ItzVion/united-delhi/blob/main/PRIVACY_POLICY.md" target="_blank" rel="noreferrer">Privacy Policy</a> · <a href="https://github.com/ItzVion/united-delhi/blob/main/TERMS_OF_SERVICE.md" target="_blank" rel="noreferrer">Terms</a> · <a href="https://github.com/ItzVion/united-delhi/blob/main/SECURITY.md" target="_blank" rel="noreferrer">Security</a></p></div></section>}
