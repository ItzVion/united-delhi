
import {useCallback,useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {api,Vehicle} from './api';

const routeName=(s:string|null|undefined)=>String(s||'Bus').replace(/(?:UP|DOWN|DWN)$/i,'').replace(/^AIR-0+(?=\\d)/i,'AIR-')||'Bus';
const vehicleRoute=(v:Vehicle)=>routeName(v.routeShortName || (v.routeId ? '#'+v.routeId : 'Bus'));
const fresh=(s?:string)=>{if(!s)return'Live';const n=Date.parse(s);if(!Number.isFinite(n))return'Live';const x=Math.max(0,Math.round((Date.now()-n)/1000));return x<60?'Just now':Math.floor(x/60)+' min ago'};
const DELHI_CENTER:[number,number]=[28.6139,77.209];
const DELHI_BOUNDS:L.LatLngBoundsExpression=[[28.40,76.84],[28.88,77.35]];
const metroLines=[['Red Line','Rithala → Shaheed Sthal (New Bus Adda)'],['Yellow Line','Samaypur Badli → Millennium City Centre Gurugram'],['Blue Line','Dwarka Sector 21 → Noida Electronic City'],['Blue Line','Yamuna Bank → Vaishali'],['Green Line','Kirti Nagar / Inderlok → Brig. Hoshiar Singh'],['Violet Line','Kashmere Gate → Raja Nahar Singh (Ballabhgarh)'],['Pink Line','Majlis Park → Shiv Vihar'],['Magenta Line','Krishna Park Extension / Janakpuri West → Botanical Garden'],['Grey Line','Dwarka → Dhansa Bus Stand'],['Orange Line','New Delhi → Yashobhoomi Dwarka Sector 25']];

type Page={kind:'home'|'plan'|'legal'|'privacy'|'terms'|'route'|'stop';id?:string};
function parsePath(path=window.location.pathname):Page{
  const p=path.replace(/\\/+$/,'')||'/';
  if(p==='/')return{kind:'home'};
  if(p==='/plan')return{kind:'plan'};
  if(p==='/legal')return{kind:'legal'};
  if(p==='/legal/privacy')return{kind:'privacy'};
  if(p==='/legal/terms')return{kind:'terms'};
  if(p.startsWith('/routes/'))return{kind:'route',id:decodeURIComponent(p.slice(8))};
  if(p.startsWith('/stops/'))return{kind:'stop',id:decodeURIComponent(p.slice(7))};
  return{kind:'home'};
}

export default function App(){
  const [page,setPage]=useState<Page>(parsePath());
  const [accepted,setAccepted]=useState(localStorage.getItem('ud-consent-v1')==='1');
  const [consent,setConsent]=useState(false);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [q,setQ]=useState('');
  const [results,setResults]=useState<any[]>([]);
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchLoading,setSearchLoading]=useState(false);
  const [searchError,setSearchError]=useState('');
  const [location,setLocation]=useState<{lat:number;lon:number}|null>(null);
  const [locationStatus,setLocationStatus]=useState('');
  const [error,setError]=useState('');
  const [detail,setDetail]=useState<any>(null);
  const [detailLoading,setDetailLoading]=useState(false);

  const go=useCallback((path:string)=>{history.pushState({},'',path);setPage(parsePath(path));setError('');setSearchOpen(false);window.scrollTo(0,0)},[]);
  useEffect(()=>{const onPop=()=>setPage(parsePath());window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);
  const requestLocation=useCallback(()=>{
    if(!navigator.geolocation){setLocationStatus('Location unavailable. Showing whole Delhi.');return}
    setLocationStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(p=>{setLocation({lat:p.coords.latitude,lon:p.coords.longitude});setLocationStatus('')},()=>{setLocationStatus('Location not available. Showing whole Delhi.')},{enableHighAccuracy:false,maximumAge:120000,timeout:15000});
  },[]);
  useEffect(()=>{if(accepted)requestLocation()},[accepted,requestLocation]);

  useEffect(()=>{
    if(!accepted)return;
    let on=true;
    const load=async()=>{try{const r=await api.vehicles();if(on)setVehicles(r.vehicles||[])}catch(e){if(on)setError((e as Error).message)}};
    void load();
    const id=setInterval(()=>void load(),15000);
    return()=>{on=false;clearInterval(id)};
  },[accepted]);

  useEffect(()=>{
    if(!accepted||q.trim().length<2){setResults([]);setSearchLoading(false);setSearchError('');return}
    let cancelled=false;
    setSearchLoading(true);setSearchError('');
    const timer=setTimeout(async()=>{
      try{
        const r=await api.search(q.trim());
        if(cancelled)return;
        const seen=new Set<string>();
        setResults((r.results||[]).filter((x:any)=>{const k=x.type+'|'+x.id+'|'+String(x.label||'').toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,20));
      }catch(e){if(!cancelled){setResults([]);setSearchError((e as Error).message||'Search is temporarily unavailable.')}}
      finally{if(!cancelled)setSearchLoading(false)}
    },220);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[q,accepted]);

  useEffect(()=>{
    if(!accepted||!['route','stop'].includes(page.kind))return;
    let alive=true;setDetail(null);setDetailLoading(true);
    (async()=>{
      try{
        if(page.kind==='route'){const d=await api.route(page.id||'');if(alive)setDetail({kind:'route',data:d})}
        else{const pair=await api.stop(page.id||'');if(alive)setDetail({kind:'stop',data:{...pair[0],arrivals:pair[1].arrivals||[]}})}
      }catch(e){if(alive)setError((e as Error).message||'Could not load this page.')}
      finally{if(alive)setDetailLoading(false)}
    })();
    return()=>{alive=false};
  },[page,accepted]);

  const openResult=(x:any)=>go(x.type==='route'?'/routes/'+encodeURIComponent(x.id):'/stops/'+encodeURIComponent(x.id));

  if(!accepted){
    if(page.kind==='privacy')return <PrivacyPage go={go}/>;
    if(page.kind==='terms')return <TermsPage go={go}/>;
    if(page.kind==='legal')return <Legal go={go}/>;
    return <ConsentScreen checked={consent} setChecked={setConsent} onContinue={()=>{localStorage.setItem('ud-consent-v1','1');setAccepted(true)}} go={go}/>;
  }

  return <div className="app-shell">
    <header className="mobile-header">
      <button className="brand brand-button" onClick={()=>go('/')}>
        <img className="brand-mark" src="/united-delhi-logo.png" alt="United Delhi logo"/>
        <span className="brand-copy"><b>UNITED DELHI</b><small>Delhi transit, made simple</small></span>
      </button>
      <Status label={vehicles.length?vehicles.length+' live buses':'Live data unavailable'} tone={vehicles.length?'ok':'muted'}/>
    </header>

    <main className="app-main">
      <div className="search-box">
        <span className="search-icon">⌕</span>
        <input value={q} onChange={e=>{setQ(e.target.value);setSearchOpen(true)}} onFocus={()=>setSearchOpen(true)} placeholder="Search routes, stops or places"/>
        {searchLoading?<span className="spinner"/>:null}
        {q?<button className="clear" onClick={()=>{setQ('');setSearchOpen(false)}}>×</button>:null}
      </div>

      {searchOpen&&q.trim().length>=2?<SearchResults loading={searchLoading} error={searchError} results={results} open={openResult} close={()=>setSearchOpen(false)}/>:null}
      {error?<div className="error-box">{error}</div>:null}

      {page.kind==='home'?<Home vehicles={vehicles} location={location} locationStatus={locationStatus} requestLocation={requestLocation} open={openResult}/>
       :page.kind==='plan'?<Planner go={go}/>
       :page.kind==='legal'?<Legal go={go}/>
       :page.kind==='privacy'?<PrivacyPage go={go}/>
       :page.kind==='terms'?<TermsPage go={go}/>
       :detailLoading?<div className="flat-card loading-card">Loading…</div>
       :detail?<Detail detail={detail} back={()=>go('/')}/>:null}
    </main>

    <nav className="bottom-nav">
      <button className={page.kind==='home'?'active':''} onClick={()=>go('/')}><span>⌂</span><small>Home</small></button>
      <button className={page.kind==='plan'?'active':''} onClick={()=>go('/plan')}><span>↗</span><small>Plan</small></button>
      <button className={['legal','privacy','terms'].includes(page.kind)?'active':''} onClick={()=>go('/legal')}><span>§</span><small>Legal</small></button>
    </nav>
  </div>;
}

function Status({label,tone}:{label:string;tone:'ok'|'muted'}){return <span className={'status '+tone}><i/>{label}</span>}

function SearchResults({loading,error,results,open,close}:{loading:boolean;error:string;results:any[];open:(x:any)=>void;close:()=>void}){
  return <section className="search-results">
    <div className="section-line"><b>Search results</b><button className="text-button" onClick={close}>Close</button></div>
    {loading?<div className="empty-line">Searching…</div>:error?<div className="empty-line danger-text">{error}</div>:results.length?results.map((x:any,i:number)=>{
      const name=x.type==='route'?routeName(x.label||x.short_name):x.label;
      return <button className="search-result" key={x.type+x.id+i}>
        <span className={x.type==='route'?'route-badge':'stop-square'}>{x.type==='route'?name:'●'}</span>
        <span className="result-copy"><b>{x.type==='route'?'Bus route':x.label}</b><small>{x.type==='route'?(x.fromStop||'Start')+' → '+(x.toStop||'Destination'):'Bus stop'}</small></span>
        <span className="chevron" onClick={()=>open(x)}>›</span>
      </button>
    }):<div className="empty-line">No matching routes or stops found.</div>}
  </section>;
}

function Home({vehicles,location,locationStatus,requestLocation,open}:{vehicles:Vehicle[];location:{lat:number;lon:number}|null;locationStatus:string;requestLocation:()=>void;open:(x:any)=>void}){
  const [stops,setStops]=useState<any[]>([]);
  const [selectedBus,setSelectedBus]=useState<Vehicle|null>(null);

  useEffect(()=>{
    if(!location){setStops([]);return}
    let live=true;
    (async()=>{try{const r=await api.nearby(location.lat,location.lon);if(live)setStops(r.status==='OK'?r.stops:[])}catch{if(live)setStops([])}})();
    return()=>{live=false};
  },[location]);

  return <>
    <section className="section-line live-section">
      <span className="eyebrow">LIVE TRANSIT</span>
      <button className="text-button" onClick={requestLocation}>{location?'Recenter':'Use my location'}</button>
    </section>

    <div className="map-card">
      <DtcMap vehicles={vehicles} location={location} onSelect={setSelectedBus}/>
      <div className="map-topbar"><i/><b>{vehicles.length?vehicles.length+' buses live':'Checking live buses'}</b></div>
      <div className="map-attribution">© OpenStreetMap contributors</div>
      {selectedBus?<BusPreview bus={selectedBus}/>:null}
    </div>

    {locationStatus?<button className="location-notice" onClick={requestLocation}><span>{locationStatus}</span><b>Retry</b></button>:null}

    <div className="quick-row">
      <button className="quick-card" onClick={()=>window.history.pushState({},'', '/plan')}><span className="quick-icon">↗</span><b>Plan trip</b><small>Find your bus</small></button>
      <button className="quick-card" onClick={requestLocation}><span className="quick-icon location">◎</span><b>Location</b><small>{location?'Recenter map':'Use my location'}</small></button>
    </div>

    <section className="section-head">
      <div><h2>Nearby stops</h2><p>Tap a stop for routes and live arrivals</p></div>
      <button className="text-button" onClick={requestLocation}>{location?'Recenter':'Use location'}</button>
    </section>

    {stops.length?stops.slice(0,4).map((s:any)=><button className="stop-card" key={s.stop_id} onClick={()=>window.history.pushState({},'', '/stops/'+encodeURIComponent(s.stop_id))}>
      <span className="stop-icon">●</span><span className="stop-copy"><b>{s.name}</b><small>{s.distance_m!=null?Math.round(s.distance_m)+' m away':'Nearby stop'}</small></span><span className="chevron">›</span>
    </button>):<div className="flat-card empty-stop"><b>No nearby stops yet</b><small>Location is optional; use the map or enable location to find nearby stops.</small></div>}

    <button className="legal-link" onClick={()=>window.history.pushState({},'', '/legal')}>Legal & privacy</button>
  </>;
}

function BusPreview({bus}:{bus:Vehicle}){
  const name=vehicleRoute(bus);
  return <div className="bus-preview">
    <button className="preview-close" onClick={()=>window.history.back()}>×</button>
    <button className="preview-body" onClick={()=>window.location.href='/routes/'+encodeURIComponent(bus.routeId||'')}>
      <span className="route-badge">{name}</span>
      <span><small>LIVE BUS</small><b>To {bus.toStop||'Destination'}</b><em>{bus.id} · {fresh(bus.observedAt)} · View route</em></span>
      <strong>›</strong>
    </button>
  </div>;
}

function DtcMap({vehicles,location,onSelect}:{vehicles:Vehicle[];location:{lat:number;lon:number}|null;onSelect:(v:Vehicle)=>void}){
  const mapEl=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<L.Map|null>(null);
  const layersRef=useRef<L.LayerGroup|null>(null);
  const userRef=useRef<L.LayerGroup|null>(null);
  const focused=useRef(false);
  useEffect(()=>{
    if(!mapEl.current||mapRef.current)return;
    const map=L.map(mapEl.current,{center:DELHI_CENTER,zoom:10.5,scrollWheelZoom:true,zoomControl:true,minZoom:9,maxBounds:DELHI_BOUNDS,maxBoundsViscosity:.85,attributionControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:['a','b','c'],maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true,attribution:'© OpenStreetMap contributors'}).addTo(map);
    layersRef.current=L.layerGroup().addTo(map);
    userRef.current=L.layerGroup().addTo(map);
    const locate=L.Control.extend({options:{position:'bottomright'},onAdd(){const button=L.DomUtil.create('button','map-locate');button.type='button';button.innerHTML='◎';button.title='Center on my location';L.DomEvent.disableClickPropagation(button);L.DomEvent.on(button,'click',()=>{if(location)map.flyTo([location.lat,location.lon],14,{duration:1.1,easeLinearity:.2})});return button}});
    map.addControl(new locate());
    const updateUser=()=>{userRef.current?.clearLayers();if(location)L.marker([location.lat,location.lon],{icon:L.divIcon({className:'user-marker-icon',html:'<div class="user-marker"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(userRef.current!)};
    map.on('move zoom resize',updateUser);
    setTimeout(()=>{map.invalidateSize();updateUser()},100);
    mapRef.current=map;
    return()=>{map.remove();mapRef.current=null};
  },[]);
  useEffect(()=>{
    const map=mapRef.current,layer=layersRef.current;if(!map||!layer)return;
    layer.clearLayers();
    for(const v of vehicles){
      const lat=Number(v.latitude),lon=Number(v.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const name=vehicleRoute(v);
      const bg=validHex(v.routeColor)?String(v.routeColor):'#00695C';
      const icon=L.divIcon({className:'web-bus-icon',html:'<div class="web-bus" style="background:'+escapeHtml(bg)+'">'+escapeHtml(name.slice(0,8))+'</div>',iconSize:[38,38],iconAnchor:[19,19]});
      L.marker([lat,lon],{icon,zIndexOffset:1000}).on('click',()=>onSelect(v)).addTo(layer);
    }
  },[vehicles,onSelect]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||!location)return;
    if(!focused.current){focused.current=true;setTimeout(()=>map.flyTo([location.lat,location.lon],14,{duration:1.25,easeLinearity:.2}),80)}
    if(userRef.current){userRef.current.clearLayers();L.marker([location.lat,location.lon],{icon:L.divIcon({className:'user-marker-icon',html:'<div class="user-marker"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(userRef.current)}
  },[location]);
  return <div ref={mapEl} className="dtc-map"/>;
}

function validHex(v:any){return /^#[0-9a-f]{6}$/i.test(String(v||''))}
function escapeHtml(x:any){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c])}

function Planner({go}:{go:(p:string)=>void}){
  const[from,setFrom]=useState('');const[to,setTo]=useState('');const[loading,setLoading]=useState(false);const[options,setOptions]=useState<any[]>([]);const[error,setError]=useState('');
  const swap=()=>{const value=from;setFrom(to);setTo(value)};
  const plan=async()=>{if(from.trim().length<2||to.trim().length<2){setError('Enter both a starting place and destination.');return}setLoading(true);setError('');setOptions([]);try{const r=await api.plan(from.trim(),to.trim());if(r.status==='OK')setOptions(r.options||[]);else setError(r.reason||'No journey could be planned.')}catch(e){setError((e as Error).message||'Journey planner is unavailable.')}finally{setLoading(false)}};
  return <section className="screen">
    <div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">JOURNEY PLANNER</span><h1>Plan your ride</h1><p>Bus journeys across Delhi</p></div></div>
    <div className="flat-card planner-form">
      <div className="planner-row"><div className="route-rail"><i/><b/><i/></div><div className="planner-fields"><label>FROM<input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Starting stop or place"/></label><label>TO<input value={to} onChange={e=>setTo(e.target.value)} placeholder="Where do you want to go?"/></label></div><button className="swap-button" onClick={swap}>↕</button></div>
      <button className="primary-button" onClick={plan} disabled={loading}>{loading?'Finding buses…':'Find buses'}</button>
    </div>
    {error?<div className="error-box"><b>Couldn't plan this trip</b><span>{error}</span></div>:null}
    {options.length?<h2 className="result-heading">{options.length} journey options</h2>:null}
    {options.map((o,i)=><div className={'flat-card journey '+(i===0?'featured':'')} key={i}>
      <div className="journey-top"><div><span className="eyebrow">{o.type==='direct'?'DIRECT BUS':'ONE CHANGE'}</span><strong>{o.durationMinutes} min</strong></div><span className="walk-tag">Walk {o.walkingMinutes} min</span></div>
      {(o.legs||[]).map((l:any,j:number)=><div className="journey-leg" key={l.routeId+j}><span className="route-badge">{routeName(l.routeName)}</span><div><b>Bus {routeName(l.routeName)}</b><small>{l.fromStop} → {l.toStop}</small></div></div>)}
      {o.transferStop?<div className="transfer">Change buses at {o.transferStop}</div>:null}
    </div>)}
    {!loading&&!error&&!options.length?<div className="empty-panel"><span className="empty-icon">↗</span><b>Where are you going?</b><p>Enter two Delhi stops or place names and United Delhi will find direct and one-change bus journeys.</p></div>:null}
    <MetroReference/>
  </section>;
}

function MetroReference(){
  return <section className="metro-section">
    <div className="metro-reference flat-card"><div><span className="eyebrow">DELHI METRO</span><h2>Current DMRC network</h2><p>United Delhi shows the published Metro network reference. It does not claim realtime Metro train tracking.</p></div><a className="secondary-button" href="https://delhimetrorail.com/pages/about-us/present-network" target="_blank" rel="noreferrer">Open DMRC network ↗</a></div>
    <div className="metro-grid">{metroLines.map(([line,route])=><div className="flat-card metro-card" key={line+route}><span>{line}</span><b>{route}</b></div>)}</div>
    <div className="flat-card"><b>Official network map</b><p>DMRC also publishes a downloadable network-map PDF.</p><a href="https://delhimetrorail.com/static/media/DMRC-Network-Map-Jan2026-Hindi-%26-English-20.02.26.70b6cd03.pdf" target="_blank" rel="noreferrer">Open / download official DMRC network map ↗</a></div>
  </section>;
}

function Detail({detail,back}:{detail:any;back:()=>void}){return detail.kind==='stop'?<StopDetail d={detail.data} back={back}/>:<RouteDetail d={detail.data} back={back}/>}

function StopDetail({d,back}:{d:any;back:()=>void}){
  const stop=d.stop||d;const arrivals=d.arrivals||[];const routes=d.routes||[];
  return <section className="screen">
    <div className="page-top"><button className="back-button" onClick={back}>‹</button><div><span className="eyebrow">BUS STOP</span><h1>{stop.name||'Bus stop'}</h1></div></div>
    <div className="flat-card stop-hero"><span className="square-icon">●</span><div><h2>{stop.name||'Bus stop'}</h2><p>{stop.stop_id||'DTC stop'}</p></div><Status label={arrivals.length?'Live':'Live unavailable'} tone={arrivals.length?'ok':'muted'}/></div>
    <section className="flat-card detail-section"><div className="section-head-inline"><h2>Buses at this stop</h2><small>Updates every 30s</small></div>{arrivals.length?arrivals.map((a:any)=><button className="arrival-row" key={a.vehicleId||a.id} onClick={()=>backRoute('/routes/'+(a.routeId||''))}><span className="route-badge">{vehicleRoute(a as Vehicle)}</span><span className="row-copy"><b>{vehicleRoute(a as Vehicle)}</b><small>To {a.toStop||'Destination'} · {a.observedAgeSeconds<60?'Updated just now':'Updated '+Math.floor((a.observedAgeSeconds||0)/60)+' min ago'}</small></span><strong>{Math.round(a.distanceMeters||0)} m</strong></button>):<p className="muted">No live buses are reporting on these routes right now.</p>}</section>
    <section className="flat-card detail-section"><div className="section-head-inline"><h2>Routes at this stop</h2><span className="count-box">{routes.length}</span></div>{routes.map((r:any)=><button className="route-row" key={r.route_id} onClick={()=>backRoute('/routes/'+encodeURIComponent(r.route_id))}><span className="route-badge">{routeName(r.short_name)}</span><span className="row-copy"><b>{r.fromStop||'Starting stop'}</b><small>to {r.toStop||'Ending stop'}</small></span><span className="chevron">›</span></button>)}</section>
  </section>;
}

function RouteDetail({d,back}:{d:any;back:()=>void}){
  const r=d.route||{},stops=d.stops||[],buses=d.vehicles||[];const name=routeName(r.publicRouteName||r.short_name);
  return <section className="screen">
    <div className="page-top"><button className="back-button" onClick={back}>‹</button><div><span className="eyebrow">BUS ROUTE</span><h1>{name}</h1></div><Status label={buses.length?buses.length+' live':'No live buses'} tone={buses.length?'ok':'muted'}/></div>
    <div className="flat-card route-hero"><span className="route-badge route-hero-badge">{name}</span><div className="direction-stack"><b>{r.fromStop||stops[0]?.name||'Starting stop'}</b><span><i/><b/><i/></span><b>{r.toStop||stops[stops.length-1]?.name||'Ending stop'}</b></div></div>
    <div className="route-map"><DtcMap vehicles={buses} location={null} onSelect={()=>{}}/><div className="map-topbar"><i/><b>{buses.length?buses.length+' live on route':'No live position on route'}</b></div><div className="map-attribution">© OpenStreetMap contributors</div></div>
    <div className="metric-row"><div><b>{stops.length}</b><small>stops</small></div><div><b>{buses.length}</b><small>live buses</small></div><div><b>DTC</b><small>service</small></div></div>
    <section className="flat-card detail-section"><div className="section-head-inline"><div><h2>Live buses</h2><small>Fresh positions on this route</small></div><span className="count-box">{buses.length}</span></div>{buses.length?buses.slice(0,6).map((v:Vehicle)=><div className="arrival-row" key={v.id}><span className="route-badge">{name}</span><span className="row-copy"><b>Live bus · {v.id}</b><small>To {v.toStop||r.toStop||'Destination'} · {fresh(v.observedAt)}</small></span><strong>›</strong></div>):<p className="muted">No live buses on this exact route variant right now.</p>}</section>
    <section className="flat-card detail-section"><div className="section-head-inline"><h2>Stops in order</h2><small>Tap a stop for live arrivals</small></div>{stops.map((s:any,i:number)=><button className="ordered-stop" key={s.stop_id} onClick={()=>backRoute('/stops/'+encodeURIComponent(s.stop_id))}><span className="timeline"><i/>{i<stops.length-1?<b/>:null}</span><span><small>{String(i+1).padStart(2,'0')}</small><b>{s.name}</b></span><span className="chevron">›</span></button>)}</section>
  </section>;
}

function Legal({go}:{go:(p:string)=>void}){return <section className="screen"><span className="eyebrow">UNITED DELHI</span><h1>Legal & privacy</h1><div className="flat-card"><p>United Delhi does not require an account or phone number. Location is optional.</p><button className="legal-row" onClick={()=>go('/legal/privacy')}><span><b>Privacy Policy</b><small>Location, search, transit and technical information.</small></span><span>›</span></button><button className="legal-row" onClick={()=>go('/legal/terms')}><span><b>Terms of Service</b><small>Service use, transit-data limitations and acceptable use.</small></span><span>›</span></button></div></section>}
function PrivacyPage({go}:{go:(p:string)=>void}){return <section className="screen"><button className="secondary-button back-link" onClick={()=>go('/legal')}>← Legal</button><span className="eyebrow">UNITED DELHI</span><h1>Privacy Policy</h1><LegalCopy privacy/></section>}
function TermsPage({go}:{go:(p:string)=>void}){return <section className="screen"><button className="secondary-button back-link" onClick={()=>go('/legal')}>← Legal</button><span className="eyebrow">UNITED DELHI</span><h1>Terms of Service</h1><LegalCopy privacy={false}/></section>}
function LegalCopy({privacy}:{privacy:boolean}){return <div className="legal-copy"><p><b>{privacy?'United Delhi is designed to work without an account.':'United Delhi is an independent transit-information service.'}</b> {privacy?'We do not currently ask for a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier or payment information.':'It is not a transport operator, government agency, emergency service or traffic-control service.'}</p><h3>{privacy?'Location':'Using the service'}</h3><p>{privacy?'Location is optional. When allowed, it is used to centre the map and find nearby DTC stops.':'Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped or unavailable. Realtime positions and journey-planning times are estimates and should not be treated as guarantees.'}</p><h3>{privacy?'Search and planning':'Acceptable use'}</h3><p>{privacy?'Search and journey-planning text is sent to the United Delhi API to return transit information.':'Do not attack, probe, bypass safeguards, obtain secrets, abuse upstream services, impersonate the service, stalk or profile people, transmit malicious code, or misrepresent United Delhi as an official government or transport service.'}</p><h3>{privacy?'Technical information':'Third-party services'}</h3><p>{privacy?'Normal network and security information such as IP addresses, timestamps and request metadata may be processed by hosting or security infrastructure.':'United Delhi relies on third-party transit data, maps, hosting and infrastructure.'}</p></div>}

function ConsentScreen({checked,setChecked,onContinue,go}:{checked:boolean;setChecked:(v:boolean)=>void;onContinue:()=>void;go:(p:string)=>void}){return <div className="gate"><div className="flat-card consent-card"><img className="gate-mark" src="/united-delhi-logo.png" alt="United Delhi logo"/><span className="eyebrow">WELCOME TO UNITED DELHI</span><h1>Delhi transit,<br/>made simple.</h1><p>By continuing to United Delhi, you agree to our <button className="text-button inline" onClick={()=>go('/legal/terms')}>Terms of Service</button> and acknowledge our <button className="text-button inline" onClick={()=>go('/legal/privacy')}>Privacy Policy</button>.</p><label className="check-row"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span></label><button className="primary-button" disabled={!checked} onClick={onContinue}>Continue to United Delhi</button><small>No account or phone number is required. Location is requested only when you choose a location-based feature.</small></div></div>}

function backRoute(path:string){window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))}
