import {useCallback,useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {api} from './api';
import type {Vehicle} from './api';

type Page={kind:'home'|'plan'|'legal'|'privacy'|'terms'|'route'|'stop';id?:string};
type Point={lat:number;lon:number};

const CENTER:[number,number]=[28.6139,77.209];
const BOUNDS:any=[[28.40,76.84],[28.88,77.35]];

const routeName=(value:any)=>{const text=String(value||'').trim();if(!text)return null;return text.replace(/(?:UP|DOWN|DWN)$/i,'').replace(/^AIR-0+/i,'AIR-')||null;};
const displayVehicleRoute=(v:any)=>routeName(v.routeShortName)||(v.routeId?'ID '+v.routeId:'LIVE BUS');
const isHex=(v:any)=>/^#[0-9a-f]{6}$/i.test(String(v||''));
const textFor=(bg:string)=>{const h=bg.replace('#','');const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.55?'#17313B':'#FFFFFF';};
const ageLabel=(value?:string)=>{const t=Date.parse(String(value||''));if(!Number.isFinite(t))return'Live';const s=Math.max(0,Math.round((Date.now()-t)/1000));return s<60?'Just now':Math.floor(s/60)+' min ago';};

function parsePath(path:string=window.location.pathname):Page{
  const p=path.replace(/\/+$/,'')||'/';
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
  const[page,setPage]=useState<Page>(parsePath());
  const[accepted,setAccepted]=useState(localStorage.getItem('ud-consent-v1')==='1');
  const[checked,setChecked]=useState(false);
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const[q,setQ]=useState('');
  const[searchOpen,setSearchOpen]=useState(false);
  const[searchResults,setSearchResults]=useState<any[]>([]);
  const[searchBusy,setSearchBusy]=useState(false);
  const[searchError,setSearchError]=useState('');
  const[location,setLocation]=useState<Point|null>(null);
  const[locationStatus,setLocationStatus]=useState('');
  const[error,setError]=useState('');
  const[detail,setDetail]=useState<any>(null);
  const[detailBusy,setDetailBusy]=useState(false);

  const go=useCallback((path:string)=>{window.history.pushState({},'',path);setPage(parsePath(path));setSearchOpen(false);setError('');window.scrollTo(0,0);},[]);
  useEffect(()=>{const pop=()=>setPage(parsePath());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);

  const locate=useCallback(()=>{
    if(!navigator.geolocation){setLocationStatus('Location unavailable. Showing whole Delhi.');return;}
    setLocationStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(p=>{setLocation({lat:p.coords.latitude,lon:p.coords.longitude});setLocationStatus('');},()=>setLocationStatus('Location not available. Showing whole Delhi.'),{enableHighAccuracy:false,maximumAge:120000,timeout:15000});
  },[]);

  useEffect(()=>{if(accepted)locate();},[accepted,locate]);

  useEffect(()=>{
    if(!accepted)return;
    let active=true;
    const load=async()=>{try{const r=await api.vehicles();if(active)setVehicles(Array.isArray(r.vehicles)?r.vehicles:[]);}catch(e){if(active)setError((e as Error).message||'Live data is unavailable.');}};
    void load();
    const id=window.setInterval(()=>void load(),15000);
    return()=>{active=false;window.clearInterval(id);};
  },[accepted]);

  useEffect(()=>{
    const term=q.trim();
    if(!accepted||term.length<2){setSearchResults([]);setSearchBusy(false);setSearchError('');return;}
    let active=true;
    setSearchBusy(true);setSearchError('');
    const id=window.setTimeout(async()=>{
      try{const r=await api.search(term);if(active)setSearchResults((r.results||[]).slice(0,20));}
      catch(e){if(active){setSearchResults([]);setSearchError((e as Error).message||'Search is temporarily unavailable.');}}
      finally{if(active)setSearchBusy(false);}
    },220);
    return()=>{active=false;window.clearTimeout(id);};
  },[q,accepted]);

  useEffect(()=>{
    if(!accepted||!['route','stop'].includes(page.kind))return;
    let active=true;
    setDetail(null);setDetailBusy(true);
    (async()=>{
      try{
        if(page.kind==='route'){const r=await api.route(page.id||'');if(active)setDetail({kind:'route',data:r});}
        else{const pair=await api.stop(page.id||'');if(active)setDetail({kind:'stop',data:{...pair[0],arrivals:(pair[1] as any)?.arrivals||[]}});}
      }catch(e){if(active)setError((e as Error).message||'Could not load this page.');}
      finally{if(active)setDetailBusy(false);}
    })();
    return()=>{active=false;};
  },[page,accepted]);

  if(!accepted){
    if(page.kind==='privacy')return <Privacy go={go}/>;
    if(page.kind==='terms')return <Terms go={go}/>;
    if(page.kind==='legal')return <Legal go={go}/>;
    return <div className="gate"><div className="flat-card consent-card">
      <img className="gate-mark" src="/united-delhi-logo.png" alt="United Delhi logo"/>
      <span className="eyebrow">WELCOME TO UNITED DELHI</span>
      <h1>Delhi transit,<br/>made simple.</h1>
      <p>By continuing to United Delhi, you agree to our <button className="text-button inline" onClick={()=>go('/legal/terms')}>Terms of Service</button> and acknowledge our <button className="text-button inline" onClick={()=>go('/legal/privacy')}>Privacy Policy</button>.</p>
      <label className="check-row"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span></label>
      <button className="primary-button" disabled={!checked} onClick={()=>{localStorage.setItem('ud-consent-v1','1');setAccepted(true);}}>Continue to United Delhi</button>
      <small>No account or phone number is required. Location is requested only when you choose a location-based feature.</small>
    </div></div>;
  }

  return <div className="app-shell">
    <header className="mobile-header">
      <button className="brand brand-button" onClick={()=>go('/')}>
        <img className="brand-mark" src="/united-delhi-logo.png" alt="United Delhi logo"/>
        <span className="brand-copy"><b>UNITED DELHI</b><small>Delhi transit, made simple</small></span>
      </button>
      <span className={'status '+(vehicles.length?'ok':'muted')}><i/>{vehicles.length?vehicles.length+' live buses':'Live data unavailable'}</span>
    </header>

    <main className="app-main">
      <div className="search-box">
        <span className="search-icon">⌕</span>
        <input value={q} onChange={e=>{setQ(e.target.value);setSearchOpen(true);}} onFocus={()=>setSearchOpen(true)} placeholder="Search routes, stops or places"/>
        {searchBusy?<span className="spinner"/>:null}
        {q?<button className="clear" onClick={()=>{setQ('');setSearchOpen(false);}}>×</button>:null}
      </div>

      {searchOpen&&q.trim().length>=2?<SearchResults loading={searchBusy} error={searchError} results={searchResults} go={go}/>:null}
      {error?<div className="error-box"><b>Live data issue</b><span>{error}</span></div>:null}

      {page.kind==='home'?<Home vehicles={vehicles} location={location} locationStatus={locationStatus} locate={locate} go={go}/>
       :page.kind==='plan'?<Planner go={go}/>
       :page.kind==='legal'?<Legal go={go}/>
       :page.kind==='privacy'?<Privacy go={go}/>
       :page.kind==='terms'?<Terms go={go}/>
       :detailBusy?<div className="flat-card loading-card">Loading…</div>
       :detail?<Details detail={detail} go={go}/>:null}
    </main>

    <nav className="bottom-nav">
      <button className={page.kind==='home'?'active':''} onClick={()=>go('/')}><span>⌂</span><small>Home</small></button>
      <button className={page.kind==='plan'?'active':''} onClick={()=>go('/plan')}><span>↗</span><small>Plan</small></button>
      <button className={['legal','privacy','terms'].includes(page.kind)?'active':''} onClick={()=>go('/legal')}><span>§</span><small>Legal</small></button>
    </nav>
  </div>;
}

function SearchResults({loading,error,results,go}:{loading:boolean;error:string;results:any[];go:(path:string)=>void}){
  return <section className="search-results">
    <div className="section-line"><b>Search results</b></div>
    {loading?<div className="empty-line">Searching…</div>:error?<div className="empty-line danger-text">{error}</div>:results.length?results.map((x:any,i:number)=>{
      const name=x.type==='route'?(routeName(x.label||x.short_name)||'Route'):x.label;
      return <button className="search-result" key={String(x.type)+String(x.id)+i} onClick={()=>go(x.type==='route'?'/routes/'+encodeURIComponent(x.id):'/stops/'+encodeURIComponent(x.id))}>
        {x.type==='route'?<RouteBadge name={name} color={x.routeColor} textColor={x.routeTextColor}/>:<span className="stop-square">●</span>}
        <span className="result-copy"><b>{x.type==='route'?'Bus route':x.label}</b><small>{x.type==='route'?(x.fromStop||'Start')+' → '+(x.toStop||'Destination'):'Bus stop'}</small></span>
        <span className="chevron">›</span>
      </button>;
    }):<div className="empty-line">No matching routes or stops found.</div>}
  </section>;
}

function Home({vehicles,location,locationStatus,locate,go}:{vehicles:Vehicle[];location:Point|null;locationStatus:string;locate:()=>void;go:(path:string)=>void}){
  const[stops,setStops]=useState<any[]>([]);
  const[selected,setSelected]=useState<Vehicle|null>(null);

  useEffect(()=>{
    if(!location){setStops([]);return;}
    let active=true;
    (async()=>{try{const r=await api.nearby(location.lat,location.lon);if(active)setStops(r.status==='OK'?r.stops:[]);}catch{if(active)setStops([])}})();
    return()=>{active=false;};
  },[location]);

  return <>
    <section className="section-line live-section"><span className="eyebrow">LIVE TRANSIT</span><button className="text-button" onClick={locate}>{location?'Recenter':'Use my location'}</button></section>
    <div className="map-card">
      <DtcMap vehicles={vehicles} location={location} onSelect={setSelected}/>
      <div className="map-topbar"><i/><b>{vehicles.length?vehicles.length+' buses live':'Checking live buses'}</b></div>
      <div className="map-attribution">© OpenStreetMap contributors</div>
      {selected?<BusPreview bus={selected} go={go}/>:null}
    </div>
    {locationStatus?<button className="location-notice" onClick={locate}><span>{locationStatus}</span><b>Retry</b></button>:null}

    <div className="quick-row">
      <button className="quick-card" onClick={()=>go('/plan')}><span className="quick-icon">↗</span><b>Plan trip</b><small>Find your bus</small></button>
      <button className="quick-card" onClick={locate}><span className="quick-icon location">◎</span><b>Location</b><small>{location?'Recenter map':'Use my location'}</small></button>
    </div>

    <section className="section-head"><div><h2>Nearby stops</h2><p>Tap a stop for routes and live arrivals</p></div><button className="text-button" onClick={locate}>{location?'Recenter':'Use location'}</button></section>
    {stops.length?stops.slice(0,4).map((s:any)=><button className="stop-card" key={s.stop_id} onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}><span className="stop-icon">●</span><span className="stop-copy"><b>{s.name}</b><small>{s.distance_m!=null?Math.round(s.distance_m)+' m away':'Nearby stop'}</small></span><span className="chevron">›</span></button>):<div className="flat-card empty-stop"><b>No nearby stops yet</b><small>Location is optional; use the map or enable location to find nearby stops.</small></div>}
    <button className="legal-link" onClick={()=>go('/legal')}>Legal & privacy</button>
  </>;
}

function DtcMap({vehicles,location,onSelect}:{vehicles:Vehicle[];location:Point|null;onSelect:(v:Vehicle)=>void}){
  const el=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<any>(null);
  const layersRef=useRef<any>(null);
  const userRef=useRef<any>(null);
  const focused=useRef(false);

  useEffect(()=>{
    if(!el.current||mapRef.current)return;
    const map:any=L.map(el.current,{center:CENTER,zoom:10.5,scrollWheelZoom:true,zoomControl:true,minZoom:9,maxBounds:BOUNDS,maxBoundsViscosity:.85,attributionControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:['a','b','c'],maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true,attribution:'© OpenStreetMap contributors'}).addTo(map);
    layersRef.current=L.layerGroup().addTo(map);
    userRef.current=L.layerGroup().addTo(map);
    const locate=L.Control.extend({options:{position:'bottomright'},onAdd:function(){const b:any=L.DomUtil.create('button','map-locate');b.type='button';b.innerHTML='◎';b.title='Center on my location';L.DomEvent.disableClickPropagation(b);L.DomEvent.on(b,'click',()=>{if(location)map.flyTo([location.lat,location.lon],14,{duration:1.1})});return b;}});
    map.addControl(new locate());
    window.setTimeout(()=>map.invalidateSize(),100);
    mapRef.current=map;
    return()=>{map.remove();mapRef.current=null;layersRef.current=null;userRef.current=null;};
  },[]);

  useEffect(()=>{
    const layer=layersRef.current;
    if(!layer)return;
    layer.clearLayers();
    vehicles.forEach(v=>{
      const lat=Number(v.latitude),lon=Number(v.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
      const name=displayVehicleRoute(v);
      const bg=isHex(v.routeColor)?String(v.routeColor):'#00695C';
      const html='<div class="web-bus" style="background:'+escapeHtml(bg)+'">'+escapeHtml(name.slice(0,8))+'</div>';
      const icon=L.divIcon({className:'web-bus-icon',html,iconSize:[38,38],iconAnchor:[19,19]});
      L.marker([lat,lon],{icon,zIndexOffset:1000}).on('click',()=>onSelect(v)).addTo(layer);
    });
  },[vehicles,onSelect]);

  useEffect(()=>{
    const map=mapRef.current;
    if(!map)return;
    userRef.current?.clearLayers();
    if(location){
      L.marker([location.lat,location.lon],{icon:L.divIcon({className:'user-marker-icon',html:'<div class="user-marker"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(userRef.current);
      if(!focused.current){focused.current=true;window.setTimeout(()=>map.flyTo([location.lat,location.lon],14,{duration:1.2}),80);}
    }
  },[location]);

  return <div ref={el} className="dtc-map"/>;
}

function BusPreview({bus,go}:{bus:Vehicle;go:(path:string)=>void}){
  return <div className="bus-preview">
    <button className="preview-close" onClick={()=>go('/')}>×</button>
    <button className="preview-body" onClick={()=>{if(bus.routeShortName&&bus.routeId)go('/routes/'+encodeURIComponent(bus.routeId));}} disabled={!bus.routeShortName||!bus.routeId}>
      <RouteBadge name={displayVehicleRoute(bus)} color={bus.routeColor} textColor={bus.routeTextColor}/>
      <span><small>LIVE BUS</small><b>To {bus.toStop||'Destination'}</b><em>{bus.id} · {ageLabel(bus.observedAt)} · View route</em></span><strong>›</strong>
    </button>
  </div>;
}

function RouteBadge({name,color,textColor}:{name:string;color?:string|null;textColor?:string|null}){
  const bg=isHex(color)?String(color):'#00695C';
  return <span className="route-badge" style={{backgroundColor:bg,color:isHex(textColor)?String(textColor):textFor(bg)}}>{name}</span>;
}

function Planner({go}:{go:(path:string)=>void}){
  const[from,setFrom]=useState('');const[to,setTo]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[options,setOptions]=useState<any[]>([]);
  const plan=async()=>{if(from.trim().length<2||to.trim().length<2){setError('Enter both a starting place and destination.');return;}setBusy(true);setError('');setOptions([]);try{const r=await api.plan(from.trim(),to.trim());if(r.status==='OK')setOptions(r.options||[]);else setError(r.reason||'No journey could be planned.');}catch(e){setError((e as Error).message||'Journey planner is unavailable.');}finally{setBusy(false);}};
  return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">JOURNEY PLANNER</span><h1>Plan your ride</h1><p>Bus journeys across Delhi</p></div></div><div className="flat-card planner-form"><div className="planner-row"><div className="route-rail"><i/><b/><i/></div><div className="planner-fields"><label>FROM<input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Starting stop or place"/></label><label>TO<input value={to} onChange={e=>setTo(e.target.value)} placeholder="Where do you want to go?"/></label></div><button className="swap-button" onClick={()=>{const v=from;setFrom(to);setTo(v);}}>↕</button></div><button className="primary-button" onClick={plan} disabled={busy}>{busy?'Finding buses…':'Find buses'}</button></div>{error?<div className="error-box"><b>Couldn't plan this trip</b><span>{error}</span></div>:null}{options.map((o:any,i:number)=><div className="flat-card journey" key={i}><div className="journey-top"><div><span className="eyebrow">{o.type==='direct'?'DIRECT BUS':'ONE CHANGE'}</span><strong>{o.durationMinutes} min</strong></div><span className="walk-tag">Walk {o.walkingMinutes} min</span></div>{(o.legs||[]).map((l:any,j:number)=><div className="journey-leg" key={String(l.routeId)+j}><RouteBadge name={routeName(l.routeName)} color={l.routeColor} textColor={l.routeTextColor}/><div><b>Bus {routeName(l.routeName)}</b><small>{l.fromStop} → {l.toStop}</small></div></div>)}</div>)}{!busy&&!error&&!options.length?<div className="empty-panel"><span className="empty-icon">↗</span><b>Where are you going?</b><p>Enter two Delhi stops or place names and United Delhi will find direct and one-change bus journeys.</p></div>:null}</section>;
}

function Details({detail,go}:{detail:any;go:(path:string)=>void}){
  const d=detail.data;
  if(detail.kind==='stop')return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">BUS STOP</span><h1>{d.stop?.name||'Bus stop'}</h1></div></div><div className="flat-card stop-hero"><span className="square-icon">●</span><div><h2>{d.stop?.name||'Bus stop'}</h2><p>{d.stop?.stop_id||'DTC stop'}</p></div></div><section className="flat-card detail-section"><div className="section-head-inline"><h2>Buses at this stop</h2><small>Updates every 30s</small></div>{(d.arrivals||[]).length?(d.arrivals||[]).map((a:any)=><button className="arrival-row" key={a.vehicleId||a.id} onClick={()=>go('/routes/'+encodeURIComponent(a.routeId||''))}><RouteBadge name={routeName(a.routeShortName)||(a.routeId?'#'+a.routeId:'Bus')} color={a.routeColor} textColor={a.routeTextColor}/><span className="row-copy"><b>{routeName(a.routeShortName)||(a.routeId?'#'+a.routeId:'Bus')}</b><small>To {a.toStop||'Destination'} · {ageLabel(new Date(Date.now()-Number(a.observedAgeSeconds||0)*1000).toISOString())}</small></span><strong>{Math.round(a.distanceMeters||0)} m</strong></button>):<p className="muted">No live buses are reporting on these routes right now.</p>}</section></section>;
  const r=d.route||{},stops=d.stops||[],buses=d.vehicles||[],name=routeName(r.publicRouteName||r.short_name);
  return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">BUS ROUTE</span><h1>{name}</h1></div><span className={'status '+(buses.length?'ok':'muted')}><i/>{buses.length?buses.length+' live':'No live buses'}</span></div><div className="flat-card route-hero"><RouteBadge name={name} color={r.route_color} textColor={r.route_text_color}/><div className="direction-stack"><b>{r.fromStop||stops[0]?.name||'Starting stop'}</b><span><i/><b/><i/></span><b>{r.toStop||stops[stops.length-1]?.name||'Ending stop'}</b></div></div><div className="route-map"><DtcMap vehicles={buses} location={null} onSelect={()=>{}}/><div className="map-topbar"><i/><b>{buses.length?buses.length+' live on route':'No live position on route'}</b></div><div className="map-attribution">© OpenStreetMap contributors</div></div><div className="metric-row"><div><b>{stops.length}</b><small>stops</small></div><div><b>{buses.length}</b><small>live buses</small></div><div><b>DTC</b><small>service</small></div></div><section className="flat-card detail-section"><div className="section-head-inline"><h2>Stops in order</h2><small>Tap a stop for live arrivals</small></div>{stops.map((s:any,i:number)=><button className="ordered-stop" key={s.stop_id} onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}><span className="timeline"><i/>{i<stops.length-1?<b/>:null}</span><span><small>{String(i+1).padStart(2,'0')}</small><b>{s.name}</b></span><span className="chevron">›</span></button>)}</section></section>;
}

function Legal({go}:{go:(path:string)=>void}){return <section className="screen"><span className="eyebrow">UNITED DELHI</span><h1>Legal & privacy</h1><div className="flat-card"><p>United Delhi does not require an account or phone number. Location is optional.</p><button className="legal-row" onClick={()=>go('/legal/privacy')}><span><b>Privacy Policy</b><small>Location, search, transit and technical information.</small></span><span>›</span></button><button className="legal-row" onClick={()=>go('/legal/terms')}><span><b>Terms of Service</b><small>Service use, transit-data limitations and acceptable use.</small></span><span>›</span></button></div></section>}

function Privacy({go}:{go:(path:string)=>void}){return <section className="screen"><button className="secondary-button back-link" onClick={()=>go('/legal')}>← Legal</button><span className="eyebrow">UNITED DELHI</span><h1>Privacy Policy</h1><div className="legal-copy"><p><b>United Delhi is designed to work without an account.</b> We do not currently ask for a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier or payment information.</p><h3>Location</h3><p>Location is optional. When allowed, it is used to centre the map and find nearby DTC stops.</p><h3>Search and planning</h3><p>Search and journey-planning text is sent to the United Delhi API to return transit information.</p><h3>Technical information</h3><p>Normal network and security information such as IP addresses, timestamps and request metadata may be processed by hosting or security infrastructure.</p></div></section>}

function Terms({go}:{go:(path:string)=>void}){return <section className="screen"><button className="secondary-button back-link" onClick={()=>go('/legal')}>← Legal</button><span className="eyebrow">UNITED DELHI</span><h1>Terms of Service</h1><div className="legal-copy"><p><b>United Delhi is an independent transit-information service.</b> It is not a transport operator, government agency, emergency service or traffic-control service.</p><h3>Using the service</h3><p>Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped or unavailable. Realtime positions and journey-planning times are estimates and should not be treated as guarantees.</p><h3>Acceptable use</h3><p>Do not attack, probe, bypass safeguards, obtain secrets, abuse upstream services, impersonate the service, stalk or profile people, transmit malicious code, or misrepresent United Delhi as an official government or transport service.</p><h3>Third-party services</h3><p>United Delhi relies on third-party transit data, maps, hosting and infrastructure.</p></div></section>}

function escapeHtml(value:any){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);}
