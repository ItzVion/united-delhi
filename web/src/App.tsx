import {useCallback,useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {api,Vehicle} from './api';

type Page={kind:'home'|'plan'|'legal'|'privacy'|'terms'|'route'|'stop';id?:string};
type LocationPoint={lat:number;lon:number};

const DELHI_CENTER:[number,number]=[28.6139,77.209];
const DELHI_BOUNDS:L.LatLngBoundsExpression=[[28.40,76.84],[28.88,77.35]];
const metroLines=[
  ['Red Line','Rithala → Shaheed Sthal (New Bus Adda)'],
  ['Yellow Line','Samaypur Badli → Millennium City Centre Gurugram'],
  ['Blue Line','Dwarka Sector 21 → Noida Electronic City'],
  ['Blue Line','Yamuna Bank → Vaishali'],
  ['Green Line','Kirti Nagar / Inderlok → Brig. Hoshiar Singh'],
  ['Violet Line','Kashmere Gate → Raja Nahar Singh (Ballabhgarh)'],
  ['Pink Line','Majlis Park → Shiv Vihar'],
  ['Magenta Line','Krishna Park Extension / Janakpuri West → Botanical Garden'],
  ['Grey Line','Dwarka → Dhansa Bus Stand'],
  ['Orange Line','New Delhi → Yashobhoomi Dwarka Sector 25']
];

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

function cleanRoute(value:string|null|undefined){
  const route=String(value||'').trim();
  if(!route)return'Bus';
  return route.replace(/(?:UP|DOWN|DWN)$/i,'').replace(/^AIR-0+(?=\\d)/i,'AIR-')||'Bus';
}

function vehicleRoute(v:Vehicle){return cleanRoute(v.routeShortName)||(v.routeId?('#'+v.routeId):'Bus');}
function fresh(value?:string){if(!value)return'Live';const n=Date.parse(value);if(!Number.isFinite(n))return'Live';const age=Math.max(0,Math.round((Date.now()-n)/1000));return age<60?'Just now':Math.floor(age/60)+' min ago';}
function validHex(value:any){return/^#[0-9a-f]{6}$/i.test(String(value||''));}
function routeText(background:string){const h=background.replace('#','');const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.55?'#17313B':'#FFFFFF';}

export default function App(){
  const [page,setPage]=useState<Page>(parsePath());
  const [accepted,setAccepted]=useState(localStorage.getItem('ud-consent-v1')==='1');
  const [checked,setChecked]=useState(false);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [q,setQ]=useState('');
  const [results,setResults]=useState<any[]>([]);
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchLoading,setSearchLoading]=useState(false);
  const [searchError,setSearchError]=useState('');
  const [location,setLocation]=useState<LocationPoint|null>(null);
  const [locationStatus,setLocationStatus]=useState('');
  const [error,setError]=useState('');
  const [detail,setDetail]=useState<any>(null);
  const [detailLoading,setDetailLoading]=useState(false);

  const go=useCallback((path:string)=>{
    window.history.pushState({},'',path);
    setPage(parsePath(path));
    setSearchOpen(false);
    setError('');
    window.scrollTo(0,0);
  },[]);

  useEffect(()=>{const onPop=()=>setPage(parsePath());window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);

  const requestLocation=useCallback(()=>{
    if(!navigator.geolocation){setLocationStatus('Location unavailable. Showing whole Delhi.');return;}
    setLocationStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      p=>{setLocation({lat:p.coords.latitude,lon:p.coords.longitude});setLocationStatus('');},
      ()=>setLocationStatus('Location not available. Showing whole Delhi.'),
      {enableHighAccuracy:false,maximumAge:120000,timeout:15000}
    );
  },[]);

  useEffect(()=>{if(accepted)requestLocation()},[accepted,requestLocation]);

  useEffect(()=>{
    if(!accepted)return;
    let alive=true;
    const load=async()=>{try{const r=await api.vehicles();if(alive)setVehicles(r.vehicles||[])}catch(e){if(alive)setError((e as Error).message||'Live data is unavailable.')}};
    void load();
    const timer=window.setInterval(()=>void load(),15000);
    return()=>{alive=false;window.clearInterval(timer)};
  },[accepted]);

  useEffect(()=>{
    if(!accepted||q.trim().length<2){setResults([]);setSearchLoading(false);setSearchError('');return;}
    let alive=true;
    setSearchLoading(true);setSearchError('');
    const timer=window.setTimeout(async()=>{
      try{
        const r=await api.search(q.trim());
        if(!alive)return;
        const seen=new Set<string>();
        const clean=(r.results||[]).filter((item:any)=>{
          const key=item.type+'|'+item.id+'|'+String(item.label||'').toLowerCase();
          if(seen.has(key))return false;seen.add(key);return true;
        }).slice(0,20);
        setResults(clean);
      }catch(e){if(alive){setResults([]);setSearchError((e as Error).message||'Search is temporarily unavailable.')}}
      finally{if(alive)setSearchLoading(false);}
    },220);
    return()=>{alive=false;window.clearTimeout(timer)};
  },[q,accepted]);

  useEffect(()=>{
    if(!accepted||!['route','stop'].includes(page.kind))return;
    let alive=true;setDetail(null);setDetailLoading(true);
    (async()=>{
      try{
        if(page.kind==='route'){const r=await api.route(page.id||'');if(alive)setDetail({kind:'route',data:r});}
        else{const pair=await api.stop(page.id||'');if(alive)setDetail({kind:'stop',data:{...pair[0],arrivals:pair[1].arrivals||[]}});}
      }catch(e){if(alive)setError((e as Error).message||'Could not load this page.')}
      finally{if(alive)setDetailLoading(false);}
    })();
    return()=>{alive=false};
  },[page,accepted]);

  const openSearchResult=(item:any)=>go(item.type==='route'?'/routes/'+encodeURIComponent(item.id):'/stops/'+encodeURIComponent(item.id));

  if(!accepted){
    if(page.kind==='privacy')return <PrivacyPage go={go}/>;
    if(page.kind==='terms')return <TermsPage go={go}/>;
    if(page.kind==='legal')return <LegalPage go={go}/>;
    return <div className="gate"><div className="flat-card consent-card">
      <img className="gate-mark" src="/united-delhi-logo.png" alt="United Delhi logo"/>
      <span className="eyebrow">WELCOME TO UNITED DELHI</span>
      <h1>Delhi transit,<br/>made simple.</h1>
      <p>By continuing to United Delhi, you agree to our <button className="text-button inline" onClick={()=>go('/legal/terms')}>Terms of Service</button> and acknowledge our <button className="text-button inline" onClick={()=>go('/legal/privacy')}>Privacy Policy</button>.</p>
      <label className="check-row"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span></label>
      <button className="primary-button" disabled={!checked} onClick={()=>{localStorage.setItem('ud-consent-v1','1');setAccepted(true)}}>Continue to United Delhi</button>
      <small>No account or phone number is required. Location is requested only when you choose a location-based feature.</small>
    </div></div>;
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
      {searchOpen&&q.trim().length>=2?<SearchResults loading={searchLoading} error={searchError} results={results} open={openSearchResult} close={()=>setSearchOpen(false)}/>:null}
      {error?<div className="error-box"><b>Live data issue</b><span>{error}</span></div>:null}
      {page.kind==='home'?<Home vehicles={vehicles} location={location} locationStatus={locationStatus} requestLocation={requestLocation} go={go}/>
       :page.kind==='plan'?<Planner go={go}/>
       :page.kind==='legal'?<LegalPage go={go}/>
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
    {loading?<div className="empty-line">Searching…</div>:error?<div className="empty-line danger-text">{error}</div>:results.length?results.map((item:any,i:number)=>{
      const name=item.type==='route'?cleanRoute(item.label||item.short_name):item.label;
      return <button className="search-result" key={item.type+item.id+i} onClick={()=>open(item)}>
        {item.type==='route'?<span className="route-badge" style={{backgroundColor:validHex(item.routeColor)?item.routeColor:'#00695C',color:validHex(item.routeTextColor)?item.routeTextColor:routeText(validHex(item.routeColor)?item.routeColor:'#00695C')}}>{name}</span>:<span className="stop-square">●</span>}
        <span className="result-copy"><b>{item.type==='route'?'Bus route':item.label}</b><small>{item.type==='route'?(item.fromStop||'Start')+' → '+(item.toStop||'Destination'):'Bus stop'}</small></span>
        <span className="chevron">›</span>
      </button>;
    }):<div className="empty-line">No matching routes or stops found.</div>}
  </section>;
}

function Home({vehicles,location,locationStatus,requestLocation,go}:{vehicles:Vehicle[];location:LocationPoint|null;locationStatus:string;requestLocation:()=>void;go:(path:string)=>void}){
  const [stops,setStops]=useState<any[]>([]);
  const [selected,setSelected]=useState<Vehicle|null>(null);
  useEffect(()=>{
    if(!location){setStops([]);return;}
    let alive=true;
    (async()=>{try{const r=await api.nearby(location.lat,location.lon);if(alive)setStops(r.status==='OK'?r.stops:[])}catch{if(alive)setStops([])}})();
    return()=>{alive=false};
  },[location]);

  return <>
    <section className="section-line live-section"><span className="eyebrow">LIVE TRANSIT</span><button className="text-button" onClick={requestLocation}>{location?'Recenter':'Use my location'}</button></section>
    <div className="map-card">
      <DtcMap vehicles={vehicles} location={location} onSelect={setSelected}/>
      <div className="map-topbar"><i/><b>{vehicles.length?vehicles.length+' buses live':'Checking live buses'}</b></div>
      <div className="map-attribution">© OpenStreetMap contributors</div>
      {selected?<BusPreview bus={selected} go={go}/>:null}
    </div>
    {locationStatus?<button className="location-notice" onClick={requestLocation}><span>{locationStatus}</span><b>Retry</b></button>:null}
    <div className="quick-row">
      <button className="quick-card" onClick={()=>go('/plan')}><span className="quick-icon">↗</span><b>Plan trip</b><small>Find your bus</small></button>
      <button className="quick-card" onClick={requestLocation}><span className="quick-icon location">◎</span><b>Location</b><small>{location?'Recenter map':'Use my location'}</small></button>
    </div>
    <section className="section-head"><div><h2>Nearby stops</h2><p>Tap a stop for routes and live arrivals</p></div><button className="text-button" onClick={requestLocation}>{location?'Recenter':'Use location'}</button></section>
    {stops.length?stops.slice(0,4).map((s:any)=><button className="stop-card" key={s.stop_id} onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}><span className="stop-icon">●</span><span className="stop-copy"><b>{s.name}</b><small>{s.distance_m!=null?Math.round(s.distance_m)+' m away':'Nearby stop'}</small></span><span className="chevron">›</span></button>):<div className="flat-card empty-stop"><b>No nearby stops yet</b><small>Location is optional; use the map or enable location to find nearby stops.</small></div>}
    <button className="legal-link" onClick={()=>go('/legal')}>Legal & privacy</button>
  </>;
}

function BusPreview({bus,go}:{bus:Vehicle;go:(path:string)=>void}){
  return <div className="bus-preview">
    <button className="preview-close" onClick={()=>go('/')}>×</button>
    <button className="preview-body" onClick={()=>go('/routes/'+encodeURIComponent(bus.routeId||''))}>
      <RouteBadge name={vehicleRoute(bus)} routeColor={bus.routeColor} routeTextColor={bus.routeTextColor}/>
      <span><small>LIVE BUS</small><b>To {bus.toStop||'Destination'}</b><em>{bus.id} · {fresh(bus.observedAt)} · View route</em></span>
      <strong>›</strong>
    </button>
  </div>;
}

function RouteBadge({name,routeColor,routeTextColor}:{name:string;routeColor?:string|null;routeTextColor?:string|null}){
  const bg=validHex(routeColor)?String(routeColor):'#00695C';
  return <span className="route-badge" style={{backgroundColor:bg,color:validHex(routeTextColor)?String(routeTextColor):routeText(bg)}}>{name}</span>;
}

function DtcMap({vehicles: _vehicles, location: _location, onSelect: _onSelect}:{vehicles:Vehicle[];location:LocationPoint|null;onSelect:(v:Vehicle)=>void}){return <div className="dtc-map"/>}
function escapeHtml(value:any){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);}

function Planner({go}:{go:(path:string)=>void}){
  const[from,setFrom]=useState('');const[to,setTo]=useState('');const[loading,setLoading]=useState(false);const[error,setError]=useState('');const[options,setOptions]=useState<any[]>([]);
  const plan=async()=>{if(from.trim().length<2||to.trim().length<2){setError('Enter both a starting place and destination.');return;}setLoading(true);setError('');setOptions([]);try{const r=await api.plan(from.trim(),to.trim());if(r.status==='OK')setOptions(r.options||[]);else setError(r.reason||'No journey could be planned.')}catch(e){setError((e as Error).message||'Journey planner is unavailable.')}finally{setLoading(false)}};
  return <section className="screen">
    <div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">JOURNEY PLANNER</span><h1>Plan your ride</h1><p>Bus journeys across Delhi</p></div></div>
    <div className="flat-card planner-form"><div className="planner-row"><div className="route-rail"><i/><b/><i/></div><div className="planner-fields"><label>FROM<input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Starting stop or place"/></label><label>TO<input value={to} onChange={e=>setTo(e.target.value)} placeholder="Where do you want to go?"/></label></div><button className="swap-button" onClick={()=>{const v=from;setFrom(to);setTo(v)}}>↕</button></div><button className="primary-button" onClick={plan} disabled={loading}>{loading?'Finding buses…':'Find buses'}</button></div>
    {error?<div className="error-box"><b>Couldn't plan this trip</b><span>{error}</span></div>:null}
    {options.length?<h2 className="result-heading">{options.length} journey options</h2>:null}
    {options.map((o:any,i:number)=><div className={'flat-card journey '+(i===0?'featured':'')} key={i}><div className="journey-top"><div><span className="eyebrow">{o.type==='direct'?'DIRECT BUS':'ONE CHANGE'}</span><strong>{o.durationMinutes} min</strong></div><span className="walk-tag">Walk {o.walkingMinutes} min</span></div>{(o.legs||[]).map((l:any,j:number)=><div className="journey-leg" key={String(l.routeId)+j}><RouteBadge name={cleanRoute(l.routeName)} routeColor={l.routeColor} routeTextColor={l.routeTextColor}/><div><b>Bus {cleanRoute(l.routeName)}</b><small>{l.fromStop} → {l.toStop}</small></div></div>)}{o.transferStop?<div className="transfer">Change buses at {o.transferStop}</div>:null}</div>)}
    {!loading&&!error&&!options.length?<div className="empty-panel"><span className="empty-icon">↗</span><b>Where are you going?</b><p>Enter two Delhi stops or place names and United Delhi will find direct and one-change bus journeys.</p></div>:null}
    <section className="metro-section"><div className="metro-reference flat-card"><div><span className="eyebrow">DELHI METRO</span><h2>Current DMRC network</h2><p>United Delhi shows the published Metro network reference. It does not claim realtime Metro train tracking.</p></div><a className="secondary-button" href="https://delhimetrorail.com/pages/about-us/present-network" target="_blank" rel="noreferrer">Open DMRC network ↗</a></div><div className="metro-grid">{metroLines.map(([line,route])=><div className="flat-card metro-card" key={line+route}><span>{line}</span><b>{route}</b></div>)}</div><div className="flat-card"><b>Official network map</b><p>DMRC also publishes a downloadable network-map PDF.</p><a href="https://delhimetrorail.com/static/media/DMRC-Network-Map-Jan2026-Hindi-%26-English-20.02.26.70b6cd03.pdf" target="_blank" rel="noreferrer">Open / download official DMRC network map ↗</a></div></section>
  </section>;
}

function Detail({detail,back}:{detail:any;back:()=>void}){
  const d=detail.data;
  if(detail.kind==='stop')return <StopDetail d={d} back={back}/>;
  const r=d.route||{},stops=d.stops||[],buses=d.vehicles||[];const name=cleanRoute(r.publicRouteName||r.short_name);
  return <section className="screen">
    <div className="page-top"><button className="back-button" onClick={back}>‹</button><div><span className="eyebrow">BUS ROUTE</span><h1>{name}</h1></div><Status label={buses.length?buses.length+' live':'No live buses'} tone={buses.length?'ok':'muted'}/></div>
    <div className="flat-card route-hero"><RouteBadge name={name} routeColor={r.route_color} routeTextColor={r.route_text_color}/><div className="direction-stack"><b>{r.fromStop||stops[0]?.name||'Starting stop'}</b><span><i/><b/><i/></span><b>{r.toStop||stops[stops.length-1]?.name||'Ending stop'}</b></div></div>
    <div className="route-map"><DtcMap vehicles={buses} location={null} onSelect={()=>{}}/><div className="map-topbar"><i/><b>{buses.length?buses.length+' live on route':'No live position on route'}</b></div><div className="map-attribution">© OpenStreetMap contributors</div></div>
    <div className="metric-row"><div><b>{stops.length}</b><small>stops</small></div><div><b>{buses.length}</b><small>live buses</small></div><div><b>DTC</b><small>service</small></div></div>
    <section className="flat-card detail-section"><div className="section-head-inline"><div><h2>Live buses</h2><small>Fresh positions on this route</small></div><span className="count-box">{buses.length}</span></div>{buses.length?buses.slice(0,6).map((v:Vehicle)=><div className="arrival-row" key={v.id}><RouteBadge name={vehicleRoute(v)} routeColor={v.routeColor} routeTextColor={v.routeTextColor}/><span className="row-copy"><b>Live bus · {v.id}</b><small>To {v.toStop||r.toStop||'Destination'} · {fresh(v.observedAt)}</small></span><strong>›</strong></div>):<p className="muted">No live buses on this exact route variant right now.</p>}</section>
    <section className="flat-card detail-section"><div className="section-head-inline"><h2>Stops in order</h2><small>Tap a stop for live arrivals</small></div>{stops.map((s:any,i:number)=><button className="ordered-stop" key={s.stop_id} onClick={()=>backRoute('/stops/'+encodeURIComponent(s.stop_id))}><span className="timeline"><i/>{i<stops.length-1?<b/>:null}</span><span><small>{String(i+1).padStart(2,'0')}</small><b>{s.name}</b></span><span className="chevron">›</span></button>)}</section>
  </section>;
}

function StopDetail({d,back}:{d:any;back:(path?:string)=>void}){
  const stop=d.stop||d;const arrivals=d.arrivals||[];const routes=d.routes||[];
  return <section className="screen">
    <div className="page-top"><button className="back-button" onClick={()=>back()}>‹</button><div><span className="eyebrow">BUS STOP</span><h1>{stop.name||'Bus stop'}</h1></div></div>
    <div className="flat-card stop-hero"><span className="square-icon">●</span><div><h2>{stop.name||'Bus stop'}</h2><p>{stop.stop_id||'DTC stop'}</p></div><Status label={arrivals.length?'Live':'Live unavailable'} tone={arrivals.length?'ok':'muted'}/></div>
    <section className="flat-card detail-section"><div className="section-head-inline"><h2>Buses at this stop</h2><small>Updates every 30s</small></div>{arrivals.length?arrivals.map((a:any)=><button className="arrival-row" key={a.vehicleId||a.id} onClick={()=>backRoute('/routes/'+(a.routeId||''))}><RouteBadge name={cleanRoute(a.routeShortName)||(a.routeId?'#'+a.routeId:'Bus')} routeColor={a.routeColor} routeTextColor={a.routeTextColor}/><span className="row-copy"><b>{cleanRoute(a.routeShortName)||(a.routeId?'#'+a.routeId:'Bus')}</b><small>To {a.toStop||'Destination'} · {a.observedAgeSeconds<60?'Updated just now':'Updated '+Math.floor((a.observedAgeSeconds||0)/60)+' min ago'}</small></span><strong>{Math.round(a.distanceMeters||0)} m</strong></button>):<p className="muted">No live buses are reporting on these routes right now.</p>}</section>
    <section className="flat-card detail-section"><div className="section-head-inline"><h2>Routes at this stop</h2><span className="count-box">{routes.length}</span></div>{routes.map((r:any)=><button className="route-row" key={r.route_id} onClick={()=>backRoute('/routes/'+encodeURIComponent(r.route_id))}><RouteBadge name={cleanRoute(r.short_name)} routeColor={r.route_color} routeTextColor={r.route_text_color}/><span className="row-copy"><b>{r.fromStop||'Starting stop'}</b><small>to {r.toStop||'Ending stop'}</small></span><span className="chevron">›</span></button>)}</section>
  </section>;
}

function LegalPage({go}:{go:(path:string)=>void}){return <section className="screen"><span className="eyebrow">UNITED DELHI</span><h1>Legal & privacy</h1><div className="flat-card"><p>United Delhi does not require an account or phone number. Location is optional.</p><button className="legal-row" onClick={()=>go('/legal/privacy')}><span><b>Privacy Policy</b><small>Location, search, transit and technical information.</small></span><span>›</span></button><button className="legal-row" onClick={()=>go('/legal/terms')}><span><b>Terms of Service</b><small>Service use, transit-data limitations and acceptable use.</small></span><span>›</span></button></div></section>}
function PrivacyPage({go}:{go:(path:string)=>void}){return <section className="screen"><button className="secondary-button back-link" onClick={()=>go('/legal')}>← Legal</button><span className="eyebrow">UNITED DELHI</span><h1>Privacy Policy</h1><LegalCopy privacy/></section>}
function TermsPage({go}:{go:(path:string)=>void}){return <section className="screen"><button className="secondary-button back-link" onClick={()=>go('/legal')}>← Legal</button><span className="eyebrow">UNITED DELHI</span><h1>Terms of Service</h1><LegalCopy privacy={false}/></section>}
function LegalCopy({privacy}:{privacy:boolean}){return <div className="legal-copy"><p><b>{privacy?'United Delhi is designed to work without an account.':'United Delhi is an independent transit-information service.'}</b> {privacy?'We do not currently ask for a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier or payment information.':'It is not a transport operator, government agency, emergency service or traffic-control service.'}</p><h3>{privacy?'Location':'Using the service'}</h3><p>{privacy?'Location is optional. When allowed, it is used to centre the map and find nearby DTC stops.':'Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped or unavailable. Realtime positions and journey-planning times are estimates and should not be treated as guarantees.'}</p><h3>{privacy?'Search and planning':'Acceptable use'}</h3><p>{privacy?'Search and journey-planning text is sent to the United Delhi API to return transit information.':'Do not attack, probe, bypass safeguards, obtain secrets, abuse upstream services, impersonate the service, stalk or profile people, transmit malicious code, or misrepresent United Delhi as an official government or transport service.'}</p><h3>{privacy?'Technical information':'Third-party services'}</h3><p>{privacy?'Normal network and security information such as IP addresses, timestamps and request metadata may be processed by hosting or security infrastructure.':'United Delhi relies on third-party transit data, maps, hosting and infrastructure.'}</p></div>}

function backRoute(path:string){window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));}

