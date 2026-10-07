import {useCallback,useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {api} from './api';

import type {Vehicle} from './api';

declare module 'leaflet' {
  interface Marker { _udBg?: string; _udKind?: 'label' | 'dot'; }
  interface CircleMarker { _udBg?: string; _udKind?: 'label' | 'dot'; }
}

type Page={kind:'home'|'plan'|'hub'|'help'|'legal'|'privacy'|'terms'|'route'|'stop';id?:string};
type Point={lat:number;lon:number};

const CENTER:[number,number]=[28.6139,77.209];
const BOUNDS:any=[[28.40,76.84],[28.88,77.35]];
const storageGet=(key:string)=>{try{return window.localStorage.getItem(key);}catch{return null;}};
const storageSet=(key:string,value:string)=>{try{window.localStorage.setItem(key,value);return true;}catch{return false;}};

const routeName=(value:any)=>{
  let text=String(value??'').trim().replace(/\\s+/g,' ');
  if(!text)return null;
  text=text.replace(/^route\\s*[:#-]?\\s*/i,'').trim();
  text=text.split(/\\s*[|:–—]\\s*/)[0].trim();
  text=text.replace(/\\s+(?:UP|DOWN|DWN)$/i,'').trim();
  const air=text.match(/^AIR[- ]*0*(\\d+[A-Z]?)/i);if(air)return 'AIR-'+air[1].toUpperCase();
  const numbered=text.match(/^(\\d{1,5}[A-Z]?)(?:\\s|$)/i);if(numbered)return numbered[1].toUpperCase();
  return text.length<=14?text:null;
};
const displayVehicleRoute=(v:any)=>routeName(v.routeShortName)||routeName(v.routeId)||'BUS';
const isHex=(v:any)=>/^#[0-9a-f]{6}$/i.test(String(v||''));
const textFor=(bg:string)=>{const h=bg.replace('#','');const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.55?'#17313B':'#FFFFFF';};
const BUS_COLORS:any={evAc:'#2FAFBC',evDeviOrange:'#E57D43',evDeviGreen:'#168F49',cngAcBlue:'#3D82CE',cngAcRed:'#E35F67',cngNonAcPeach:'#E5A16E',cngNonAcGreen:'#24C88B'};
const FALLBACK_ROUTE_COLORS=['#24C88B','#2FAFBC','#E57D43','#3D82CE','#E35F67','#8B5CF6','#C58B2A','#00897B'];
const routeFallbackColor=(routeId:any,vehicleId:any)=>{const key=String(routeId||vehicleId||'BUS');let h=0;for(let i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))>>>0;return FALLBACK_ROUTE_COLORS[h%FALLBACK_ROUTE_COLORS.length];};
const busColorFor=(v:any)=>isHex(v.routeColor)?String(v.routeColor):isHex(v.serviceColor)?String(v.serviceColor):routeFallbackColor(v.routeId,v.id);
const ageLabel=(value?:string)=>{const t=Date.parse(String(value||''));if(!Number.isFinite(t))return'Live';const s=Math.max(0,Math.round((Date.now()-t)/1000));return s<60?'Just now':Math.floor(s/60)+' min ago';};
const escapeHtml=(value:any)=>String(value??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));

function parsePath(path:string=window.location.pathname):Page{
  const p=path.replace(/\/+$/,'')||'/';
  if(p==='/')return{kind:'home'};
  if(p==='/plan')return{kind:'plan'};
  if(p==='/hub')return{kind:'hub'};
  if(p==='/help')return{kind:'help'};
  if(p==='/legal')return{kind:'legal'};
  if(p==='/legal/privacy')return{kind:'privacy'};
  if(p==='/legal/terms')return{kind:'terms'};
  if(p.startsWith('/routes/'))return{kind:'route',id:decodeURIComponent(p.slice(8))};
  if(p.startsWith('/stops/'))return{kind:'stop',id:decodeURIComponent(p.slice(7))};
  return{kind:'home'};
}

export default function App(){
  const[page,setPage]=useState<Page>(parsePath());
  const[accepted,setAccepted]=useState(()=>storageGet('ud-consent-v1')==='1');
  const[checked,setChecked]=useState(false);
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const lastVehiclesRef=useRef<Vehicle[]>([]);
  const[liveStatus,setLiveStatus]=useState<'loading'|'ok'|'stale'|'unavailable'>('loading');
  const vehicleCountRef=useRef(0);
  const[q,setQ]=useState('');
  const[searchOpen,setSearchOpen]=useState(false);
  const[searchResults,setSearchResults]=useState<any[]>([]);
  const[searchBusy,setSearchBusy]=useState(false);
  const[searchError,setSearchError]=useState('');
  const[location,setLocation]=useState<Point|null>(null);
  const[locationStatus,setLocationStatus]=useState('');
  const[error,setError]=useState('');
  const[locationRequesting,setLocationRequesting]=useState(false);
  const[detail,setDetail]=useState<any>(null);
  const[detailBusy,setDetailBusy]=useState(false);
  const[legendOpen,setLegendOpen]=useState(false);

  const go=useCallback((path:string)=>{window.history.pushState({},'',path);setPage(parsePath(path));setSearchOpen(false);setError('');window.scrollTo(0,0);},[]);
  useEffect(()=>{const pop=()=>setPage(parsePath());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);

  const locate=useCallback(()=>{
    if(locationRequesting)return;
    if(!navigator.geolocation){setLocationStatus('Location unavailable. Showing whole Delhi.');return;}
    setLocationRequesting(true);setLocationStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(p=>{
      const next={lat:p.coords.latitude,lon:p.coords.longitude};
      setLocation(next);setLocationRequesting(false);
      try{storageSet('ud-last-location',JSON.stringify(next));}catch{}
      setLocationStatus('');
    },()=>{
      setLocationRequesting(false);
      try{
        const cached=JSON.parse(storageGet('ud-last-location')||'null');
        if(Number.isFinite(cached?.lat)&&Number.isFinite(cached?.lon)){setLocation({lat:cached.lat,lon:cached.lon});setLocationStatus('Using your last known location.');return;}
      }catch{}
      setLocationStatus('Location not available. Showing whole Delhi.');
    },{enableHighAccuracy:true,maximumAge:300000,timeout:20000});
  },[locationRequesting]);

  useEffect(()=>{if(accepted)locate();},[accepted,locate]);

  const vehiclesRequestRef=useRef(false);
  const loadVehicles=useCallback(async()=>{
    if(vehiclesRequestRef.current)return;
    vehiclesRequestRef.current=true;
    try{
      const r=await api.vehicles();
      const next=Array.isArray(r.vehicles)?r.vehicles:[];
      if(next.length){
        vehicleCountRef.current=next.length;
        lastVehiclesRef.current=next;
        setVehicles(next);
      }else if(lastVehiclesRef.current.length){
        setVehicles(lastVehiclesRef.current);
      }
      setLiveStatus(r.status==='OK'?'ok':r.status==='STALE'?'stale':'unavailable');
      setError(r.status==='UNAVAILABLE'&&next.length===0&&lastVehiclesRef.current.length===0
        ?(r.reason||'Live data is currently unavailable.')
        :'');
    }catch(e){
      if(lastVehiclesRef.current.length)setVehicles(lastVehiclesRef.current);
      setLiveStatus(vehicleCountRef.current?'stale':'unavailable');
      if(!lastVehiclesRef.current.length)setError((e as Error).message||'Live data is unavailable.');
    }finally{
      vehiclesRequestRef.current=false;
    }
  },[]);

  useEffect(()=>{
    if(!accepted)return;
    void loadVehicles();
    const id=window.setInterval(()=>void loadVehicles(),15000);
    return()=>window.clearInterval(id);
  },[accepted,loadVehicles]);

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
      <img className="gate-mark" src="/icon.svg" alt="United Delhi logo"/>
      <span className="eyebrow">WELCOME TO UNITED DELHI</span>
      <h1>Delhi transit,<br/>made simple.</h1>
      <p>By continuing to United Delhi, you agree to our <button className="text-button inline" onClick={()=>go('/legal/terms')}>Terms of Service</button> and acknowledge our <button className="text-button inline" onClick={()=>go('/legal/privacy')}>Privacy Policy</button>.</p>
      <label className="check-row"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span></label>
      <button className="primary-button" disabled={!checked} onClick={()=>{storageSet('ud-consent-v1','1');setAccepted(true);}}>Continue to United Delhi</button>
      <small>No account or phone number is required. Location is optional and is requested after consent to support nearby stops and map centering.</small>
    </div></div>;
  }

  return <div className="app-shell">
    <header className="mobile-header one-delhi-header">
      <div className="one-header-row">
        <button className="brand brand-button one-brand" onClick={()=>go('/')}>
          <img className="brand-mark" src="/icon.svg" alt="United Delhi logo"/>
          <span className="brand-copy"><b>UNITED DELHI</b><small>Delhi transit</small></span>
        </button>
        <span className={'status '+(liveStatus==='ok'?'ok':'muted')}><i/>{liveStatus==='loading'?'…':vehicles.length?(liveStatus==='stale'?vehicles.length+' updating':vehicles.length+' live'):'Offline'}</span>
      </div>
    </header>

    <main className="app-main">
      <div className="search-box">
        <span className="search-icon">⌕</span>
        <input value={q} onChange={e=>{setQ(e.target.value);setSearchOpen(true);}} onFocus={()=>setSearchOpen(true)} placehconst FALLBACK_ROUTE_COLORS=['#24C88B','#2FAFBC','#E57D43','#3D82CE','#E35F67','#8B5CF6','#C58B2A','#00897B'];er="Search 500+ routes, stops or places"/>
        {searchBusy?<span className="spinner"/>:null}
        {q?<button className="clear" onClick={()=>{setQ('');setSearchOpen(false);}}>×</button>:null}
      </div>

      {searchOpen&&q.trim().length>=2?<SearchResults loading={searchBusy} error={searchError} results={searchResults} go={go}/>:null}
      {error?<div className="error-box"><b>Live data issue</b><span>{error}</span></div>:null}

      {page.kind==='home'?<Home vehicles={vehicles} location={location} locationStatus={locationStatus} liveStatus={liveStatus} locate={locate} go={go} onLegend={()=>setLegendOpen(true)}/>
       :page.kind==='plan'?<Planner go={go}/>
       :page.kind==='hub'?<SimpleTab title="Hub" subtitle="Delhi transit tools" icon="⌂" body="Transit tools and nearby services will appear here."/>
       :page.kind==='help'?<SimpleTab title="Help" subtitle="Need a hand?" icon="?" body="Use the map, search routes, or open a stop to see live buses."/>
       :page.kind==='legal'?<Legal go={go}/>
       :page.kind==='privacy'?<Privacy go={go}/>
       :page.kind==='terms'?<Terms go={go}/>
       :detailBusy?<div className="flat-card loading-card">Loading…</div>
       :detail?<Details detail={detail} go={go}/>:null}
    </main>

    <BusLegend open={legendOpen} onClose={()=>setLegendOpen(false)}/>
    <nav className="bottom-nav one-delhi-nav">
      <button className={page.kind==='home'?'active':''} onClick={()=>go('/')}><span>▣</span><small>Bus</small></button>
      <button className={page.kind==='hub'?'active':''} onClick={()=>go('/hub')}><span>⌂</span><small>Hub</small></button>
      <button className={page.kind==='plan'?'active':''} onClick={()=>go('/plan')}><span>↗</span><small>Trip Plan</small></button>
      <button className={page.kind==='help'?'active':''} onClick={()=>go('/help')}><span>?</span><small>Help</small></button>
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
        <span className="result-copy"><b>{x.type==='route'?'Bus route':x.label}</b><small>{x.type==='route'?(x.fromStop||'Start')+' → '+(x.toStop||'Destination'):(x.stopContext||'Bus stop')}</small></span>
        <span className="chevron">›</span>
      </button>;
    }):<div className="empty-line">No matching routes or stops found.</div>}
  </section>;
}

function Home({vehicles,location,locationStatus,liveStatus,locate,go,onLegend}:{vehicles:Vehicle[];location:Point|null;locationStatus:string;liveStatus:'loading'|'ok'|'stale'|'unavailable';locate:()=>void;go:(path:string)=>void;onLegend:()=>void}){
  const[stops,setStops]=useState<any[]>([]);

  useEffect(()=>{
    if(!location){setStops([]);return;}
    let active=true;
    (async()=>{
      try{
        const r=await api.nearby(location.lat,location.lon);
        if(active)setStops(r.status==='OK'?r.stops:[]);
      }catch{if(active)setStops([])}
    })();
    return()=>{active=false;};
  },[location]);

  return <>
    <div className="home-layout">
      <section className="home-map">
        <section className="section-line live-section">
          <div><span className="eyebrow">LIVE TRANSIT</span><p className="live-subtitle">Real-time DTC positions across Delhi</p></div>
          <button className="text-button" onClick={locate}>{location?'Recenter':'Use my location'}</button>
        </section>
        <div className="map-card">
          <DtcMap vehicles={vehicles} location={location} onLegend={onLegend} go={go}/>
          <div className="map-topbar"><i/><b>{liveStatus==='loading'?'Checking live buses':vehicles.length?(liveStatus==='stale'?vehicles.length+' buses · updating':vehicles.length+' buses live'):'Live data unavailable'}</b></div>
          <div className="map-attribution">© OpenStreetMap contributors</div>
          <div className="map-legend">
            <span><i style={{background:BUS_COLORS.cngNonAcGreen}}/>DTC</span>
            <span><i style={{background:BUS_COLORS.evDeviOrange}}/>Cluster</span>
            <span><i style={{background:BUS_COLORS.evAc}}/>Electric</span>
          </div>
        </div>
        {locationStatus?<button className="location-notice" onClick={locate}><span>{locationStatus}</span><b>Retry</b></button>:null}
      </section>
      <aside className="home-side">
        <TransitSheet stops={stops} go={go}/>
        <button className="legal-link" onClick={()=>go('/legal')}>Legal & privacy</button>
      </aside>
    </div>
  </>;
}

function TransitSheet({stops,go}:{stops:any[];go:(path:string)=>void}){
  const stop=stops[0];
  return <section className="transit-sheet one-delhi-sheet">
    <div className="sheet-handle"><span/></div>
    <div className="sheet-tabs"><button className="active">Bus Stop</button><button>Metro Stop</button></div>
    <div className="sheet-stop-head"><div><b>{stop?.name||'Nearby Stops'}</b><small>{stop?'towards nearby stops':'Use your location to find nearby DTC stops'}</small></div>{stop?<button onClick={()=>go('/stops/'+encodeURIComponent(stop.stop_id))}>View Buses</button>:null}</div>
    {stops.slice(0,5).map((s:any,i:number)=><button className="sheet-stop-row" key={String(s.stop_id)+i} onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}>
      <span className="sheet-mini-icon">▣</span><span><b>{s.name}</b><small>{s.distanceMeters!=null?Math.round(s.distanceMeters)+' m away':'Bus stop'}</small></span><span className="chevron">›</span>
    </button>)}
    {!stops.length?<div className="flat-card empty-stop"><b>Find stops around you</b><small>Allow location or use the map to explore Delhi transit.</small></div>:null}
    <div className="sheet-actions one-delhi-actions"><button className="sheet-action" onClick={()=>go('/plan')}><span>↗</span><b>Trip Plan</b></button></div>
  </section>;
}

function BusLegend({open,onClose}:{open:boolean;onClose:()=>void}){
  if(!open)return null;
  const rows=[
    [['#2FAFBC','EV AC (12 mtr)']],
    [['#E57D43','EV DEVI AC (9 mtr)'],['#168F49','EV DEVI AC (9 mtr)']],
    [['#3D82CE','CNG AC (12 mtr)'],['#E35F67','CNG AC (12 mtr)']],
    [['#E5A16E','CNG NonAC (12 mtr)'],['#24C88B','CNG NonAC (12 mtr)']]
  ];
  return <div className="legend-overlay" role="dialog" aria-modal="true" aria-label="Bus Color Legend" onClick={onClose}>
    <div className="legend-dialog" onClick={e=>e.stopPropagation()}>
      <div className="legend-title">Bus Color Legend</div>
      <div className="legend-head"><span>Bus Icon</span><span>Type</span></div>
      <div className="legend-body">
        {rows.map((row,i)=><div className="legend-row" key={i}>
          <div className="legend-icons">{row.map(([color],j)=><span className="legend-bus" style={{background:color}} key={j}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" fill="none" stroke="white" stroke-width="1.8"/><path d="M7 15V9h10v6M8 17h2m4 0h2M8 11h8" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg></span>)}</div>
          <span className="legend-type">{row[0][1]}</span>
        </div>)}
      </div>
      <button className="legend-close" onClick={onClose}>Got it</button>
    </div>
  </div>;
}

function DtcMap({vehicles,location,onLegend,go}:{vehicles:Vehicle[];location:Point|null;onLegend:()=>void;go:(path:string)=>void}){
  const el=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<any>(null);
  type BusMarker=L.Marker&{_udBg?:string;_udText?:string;_udLabel?:string};
  const markersRef=useRef<Map<string,BusMarker>>(new Map());
  const userRef=useRef<any>(null);
  const vehiclesRef=useRef<Vehicle[]>([]);
  const locationRef=useRef<Point|null>(location);
  const legendRef=useRef<()=>void>(onLegend);
  const focused=useRef(false);
  const selectedRef=useRef<BusMarker|null>(null);

  useEffect(()=>{locationRef.current=location;},[location]);
  useEffect(()=>{legendRef.current=onLegend;},[onLegend]);

  useEffect(()=>{
    if(!el.current||mapRef.current)return;
    let initial:[number,number]=[CENTER[0],CENTER[1]],initialZoom=10.5;
    try{
      const saved=storageGet('ud-map-center'),p=saved?JSON.parse(saved):null;
      if(Number.isFinite(p?.lat)&&Number.isFinite(p?.lon)){initial=[p.lat,p.lon];initialZoom=14;}
    }catch{}

    const map:any=L.map(el.current,{
      center:initial,zoom:initialZoom,scrollWheelZoom:true,zoomControl:true,minZoom:9,maxBounds:BOUNDS,
      maxBoundsViscosity:.18,attributionControl:true,preferCanvas:true,inertia:false,bounceAtZoomLimits:false
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,keepBuffer:1,updateWhenZooming:false,updateWhenIdle:true,
      attribution:'© OpenStreetMap contributors'
    }).addTo(map);
    userRef.current=L.layerGroup().addTo(map);

    const locate=L.Control.extend({options:{position:'bottomright'},onAdd:function(){
      const b:any=L.DomUtil.create('button','map-locate');b.type='button';b.innerHTML='◎';b.title='Center on my location';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b,'click',()=>{
        const current=locationRef.current;
        if(current){map.stop();map.setView([current.lat,current.lon],14,{animate:false});}
      });
      return b;
    }});
    map.addControl(new locate());

    const legendControl=L.Control.extend({options:{position:'bottomright'},onAdd:function(){
      const b:any=L.DomUtil.create('button','map-legend-control');b.type='button';b.title='Bus color legend';b.setAttribute('aria-label','Bus color legend');
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 15V9h10v6M8 17h2m4 0h2M8 11h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      L.DomEvent.disableClickPropagation(b);L.DomEvent.on(b,'click',()=>legendRef.current());return b;
    }});
    map.addControl(new legendControl());

    const popupHtml=(v:Vehicle)=>{
      const route=displayVehicleRoute(v);
      const destination=escapeHtml(v.toStop||'Destination unknown');
      const vehicle=escapeHtml(v.vehicleLabel||v.licensePlate||v.id||'Vehicle');
      const age=escapeHtml(ageLabel(v.observedAt));
      const routeId=escapeHtml(v.routeId||route);
      const routePath=v.routeId?'/routes/'+encodeURIComponent(v.routeId):'';
      return '<div class="bus-popup-card">'+
        '<div class="bus-popup-top"><span class="bus-popup-icon"><span class="bus-popup-dot" style="background:'+escapeHtml(busColorFor(v))+'"></span></span><div><b>'+escapeHtml(route)+'</b><small>'+routeId+'</small></div></div>'+
        '<div class="bus-popup-destination">'+destination+'</div>'+
        '<div class="bus-popup-meta"><span>'+vehicle+'</span><span>'+age+'</span></div>'+
        (routePath?'<button type="button" class="bus-popup-route" data-route="'+escapeHtml(routePath)+'">View route</button>':'')+
      '</div>';
    };

    const makeIcon=(v:Vehicle)=>{
      const bg=busColorFor(v),fg=isHex(v.routeTextColor)?String(v.routeTextColor):textFor(bg);
      const label=displayVehicleRoute(v).trim();
      const width=Math.max(62,label.length*9+43);
      return L.divIcon({
        className:'web-bus-icon',
        html:'<div class="web-bus one-delhi-bus" style="background:'+escapeHtml(bg)+';color:'+escapeHtml(fg)+';width:'+width+'px"><span class="bus-glyph">'+
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 15V9h10v6M8 17h2m4 0h2M8 11h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'+
        '</span><span class="web-bus-label">'+escapeHtml(label)+'</span></div>',
        iconSize:[width,28],iconAnchor:[width/2,14]
      });
    };

    const busLayer:any=L.layerGroup().addTo(map);

    const syncMarkers=()=>{
      const vehiclesNow=vehiclesRef.current;
      const seen=new Set<string>();
      const markers=markersRef.current;
      const addQueue:BusMarker[]=[];
      const viewport=map.getBounds().pad(.12);
      for(const v of vehiclesNow){
        const lat=Number(v.latitude),lon=Number(v.longitude);
        if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
        if(lat<BOUNDS[0][0]||lat>BOUNDS[1][0]||lon<BOUNDS[0][1]||lon>BOUNDS[1][1])continue;
        if(!viewport.contains([lat,lon]))continue;
        const id=String(v.id);
        const labelForViewport=displayVehicleRoute(v).trim();
        const markerWidth=Math.max(62,labelForViewport.length*9+43);
        const point=map.latLngToContainerPoint([lat,lon]);
        const size=map.getSize();
        if(point.x<markerWidth/2+4||point.x>size.x-markerWidth/2-4||point.y<18||point.y>size.y-18)continue;
        seen.add(id);
        const bg=busColorFor(v),label=displayVehicleRoute(v),existing=markers.get(id);
        if(existing){
          existing.setLatLng([lat,lon]);
          if(existing._udBg!==bg||existing._udLabel!==label){
            existing.setIcon(makeIcon(v));
            existing._udBg=bg;existing._udLabel=label;
          }
          existing.setPopupContent(popupHtml(v));
          continue;
        }

        const marker=L.marker([lat,lon],{icon:makeIcon(v),zIndexOffset:500}) as BusMarker;
        marker._udBg=bg;marker._udLabel=label;
        marker.bindPopup(popupHtml(v),{
          closeButton:false,autoClose:true,closeOnClick:true,autoPan:true,keepInView:true,
          autoPanPaddingTopLeft:[24,80],autoPanPaddingBottomRight:[24,100],
          className:'one-delhi-bus-popup',maxWidth:290,minWidth:220,offset:[0,-16]
        });
        marker.on('click',()=>{
          if(selectedRef.current&&selectedRef.current!==marker){
            const old=selectedRef.current;
            old.setZIndexOffset(500);
            old.getElement()?.querySelector('.web-bus')?.classList.remove('ud-bus-selected');
          }
          selectedRef.current=marker;
          marker.setZIndexOffset(1500);
          marker.getElement()?.querySelector('.web-bus')?.classList.add('ud-bus-selected');
          const ll=marker.getLatLng();
          map.stop();
          map.setView(ll,18,{animate:true,duration:.35,easeLinearity:.25});
          window.setTimeout(()=>marker.openPopup(),380);
        });
        marker.on('popupclose',()=>{
          if(selectedRef.current===marker){
            marker.setZIndexOffset(500);
            marker.getElement()?.querySelector('.web-bus')?.classList.remove('ud-bus-selected');
            selectedRef.current=null;
          }
        });
        marker.on('popupopen',(event:any)=>{
          const button=event.popup?.getElement?.()?.querySelector?.('.bus-popup-route') as HTMLButtonElement|null;
          if(button)button.onclick=()=>go(button.dataset.route||'/');
        });
        markers.set(id,marker);
        addQueue.push(marker);
      }

      const removeQueue:BusMarker[]=[];
      for(const [id,marker] of markers){
        if(!seen.has(id)){
          if(selectedRef.current===marker)selectedRef.current=null;
          removeQueue.push(marker);
          markers.delete(id);
        }
      }
      for(const marker of removeQueue)busLayer.removeLayer(marker);
      for(const marker of addQueue)marker.addTo(busLayer);
    };

    const report=()=>{
      try{const cc=map.getCenter();storageSet('ud-map-center',JSON.stringify({lat:cc.lat,lon:cc.lng}));}catch{}
    };
    map.on('moveend',()=>{report();syncMarkers();});
    map.on('zoomend',()=>{report();syncMarkers();});
    window.setTimeout(()=>{map.invalidateSize();syncMarkers();},100);
    mapRef.current=map;(map as any)._udSyncMarkers=syncMarkers;
    return()=>{map.remove();mapRef.current=null;markersRef.current.clear();userRef.current=null;selectedRef.current=null;};
  },[]);

  useEffect(()=>{vehiclesRef.current=vehicles;(mapRef.current as any)?._udSyncMarkers?.();},[vehicles]);

  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    userRef.current?.clearLayers();
    if(location){
      L.marker([location.lat,location.lon],{
        icon:L.divIcon({className:'user-marker-icon',html:'<div class="user-marker"></div>',iconSize:[16,16],iconAnchor:[8,8]})
      }).addTo(userRef.current);
      if(!focused.current){
        focused.current=true;
        window.setTimeout(()=>{map.stop();map.setView([location.lat,location.lon],14,{animate:false});},40);
      }
    }
  },[location]);

  return <div ref={el} className="dtc-map" aria-label="Live DTC bus map"/>;
}

function RouteMiniMap({stops,buses}:{stops:any[];buses:Vehicle[]}) {
  const el=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!el.current)return;
    const validStops=stops.filter((s:any)=>Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude)));
    if(!validStops.length)return;
    const map:any=L.map(el.current,{zoomControl:true,attributionControl:true,preferCanvas:true,scrollWheelZoom:false,dragging:true}).setView([Number(validStops[0].latitude),Number(validStops[0].longitude)],13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:1,updateWhenZooming:false,updateWhenIdle:true,attribution:'© OpenStreetMap contributors'}).addTo(map);
    const linePoints=validStops.map((s:any)=>[Number(s.latitude),Number(s.longitude)] as [number,number]);
    L.polyline(linePoints,{color:'#00695C',weight:4,opacity:.78}).addTo(map);
    const stopLayer=L.layerGroup().addTo(map);
    validStops.forEach((s:any,i:number)=>{
      L.circleMarker([Number(s.latitude),Number(s.longitude)],{radius:i===0||i===validStops.length-1?6:4,color:'#fff',weight:2,fillColor:i===0||i===validStops.length-1?'#00695C':'#1976D2',fillOpacity:1})
        .bindTooltip(String(s.name||'Stop'),{direction:'top',offset:[0,-5]})
        .addTo(stopLayer);
    });
    const busLayer=L.layerGroup().addTo(map);
    buses.forEach((bus:any)=>{
      const lat=Number(bus.latitude),lon=Number(bus.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
      const color=busColorFor(bus),label=displayVehicleRoute(bus).slice(0,14),fg=isHex(bus.routeTextColor)?String(bus.routeTextColor):textFor(color);
      L.marker([lat,lon],{icon:L.divIcon({className:'web-bus-icon route-mini-bus',html:'<div class="web-bus mini" style="background:'+escapeHtml(color)+';color:'+escapeHtml(fg)+'"><span class="web-bus-label">'+escapeHtml(label)+'</span></div>',iconSize:[46,22],iconAnchor:[23,11]})})
        .bindTooltip(displayVehicleRoute(bus),{direction:'top',offset:[0,-6]})
        .addTo(busLayer);
    });
    const bounds=L.latLngBounds(linePoints as any);
    if(bounds.isValid())map.fitBounds(bounds.pad(.12),{maxZoom:14});
    window.setTimeout(()=>map.invalidateSize(),80);
    return()=>map.remove();
  },[stops,buses]);
  return <div className="route-map"><div ref={el} style={{width:'100%',height:'100%'}}/>{!buses.length?<div className="route-map-status">No live buses are reporting on this route right now.</div>:null}</div>;
}

function RouteBadge({name,color,textColor}:{name:string;color?:string|null;textColor?:string|null}){
  const bg=isHex(color)?String(color):'#00695C';
  return <span className="route-badge" style={{backgroundColor:bg,color:isHex(textColor)?String(textColor):textFor(bg)}}>{name}</span>;
}

function Planner({go}:{go:(path:string)=>void}){
  const[from,setFrom]=useState('');const[to,setTo]=useState('');const[fromStopId,setFromStopId]=useState<string|null>(null);const[toStopId,setToStopId]=useState<string|null>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const[fromSuggestions,setFromSuggestions]=useState<any[]>([]);const[toSuggestions,setToSuggestions]=useState<any[]>([]);
  const[fromFocus,setFromFocus]=useState(false);const[toFocus,setToFocus]=useState(false);const[options,setOptions]=useState<any[]>([]);
  const loadSuggestions=async(value:string,setter:(v:any[])=>void)=>{
    const term=value.trim();if(term.length<2){setter([]);return;}
    try{const r=await api.search(term);setter((r.results||[]).filter((x:any)=>x.type==='stop').slice(0,8));}catch{setter([]);}
  };
  useEffect(()=>{const id=window.setTimeout(()=>void loadSuggestions(from,setFromSuggestions),180);return()=>window.clearTimeout(id);},[from]);
  useEffect(()=>{const id=window.setTimeout(()=>void loadSuggestions(to,setToSuggestions),180);return()=>window.clearTimeout(id);},[to]);
  const plan=async()=>{if(from.trim().length<2||to.trim().length<2){setError('Select a starting stop and destination.');return;}setBusy(true);setError('');setOptions([]);setFromFocus(false);setToFocus(false);try{const r=await api.plan(from.trim(),to.trim(),fromStopId||undefined,toStopId||undefined);if(r.status==='OK')setOptions(r.options||[]);else setError(r.reason||'No journey could be planned.');}catch(e){setError((e as Error).message||'Journey planner is unavailable.');}finally{setBusy(false);}};
  const suggestions=(items:any[],active:boolean,setter:(v:string)=>void,setId:(v:string)=>void)=><>{active&&items.length?<div className="planner-suggestions">{items.map((x:any)=><button type="button" className="planner-suggestion" key={x.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{setter(x.label);setId(String(x.id));setFromFocus(false);setToFocus(false);}}><span className="stop-square">●</span><span><b>{x.label}</b><small>{x.stopContext||('Bus stop · '+x.id)}</small></span><span>›</span></button>)}</div>:null}</>;
  return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">JOURNEY PLANNER</span><h1>Plan your ride</h1><p>Bus journeys across Delhi</p></div></div><div className="flat-card planner-form"><div className="planner-row"><div className="route-rail"><i/><b/><i/></div><div className="planner-fields"><label>FROM<div className="planner-input-wrap"><input value={from} onFocus={()=>setFromFocus(true)} onChange={e=>{setFrom(e.target.value);setFromStopId(null);setFromFocus(true);}} placeholder="Starting stop or place"/>{suggestions(fromSuggestions,fromFocus,setFrom,setFromStopId)}</div></label><label>TO<div className="planner-input-wrap"><input value={to} onFocus={()=>setToFocus(true)} onChange={e=>{setTo(e.target.value);setToStopId(null);setToFocus(true);}} placeholder="Where do you want to go?"/>{suggestions(toSuggestions,toFocus,setTo,setToStopId)}</div></label></div><button className="swap-button" onClick={()=>{const v=from;const id=fromStopId;setFrom(to);setTo(v);setFromStopId(toStopId);setToStopId(id);}}>↕</button></div><button className="primary-button" onClick={plan} disabled={busy}>{busy?'Finding buses…':'Find buses'}</button></div>{error?<div className="error-box"><b>Couldn't plan this trip</b><span>{error}</span></div>:null}{options.map((o:any,i:number)=><div className="flat-card journey" key={i}><div className="journey-top"><div><span className="eyebrow">{o.type==='direct'?'DIRECT BUS':'ONE CHANGE'}</span><strong>{o.durationMinutes} min</strong></div><span className="walk-tag">Walking time not estimated</span></div>{(o.legs||[]).map((l:any,j:number)=><div className="journey-leg" key={String(l.routeId)+j}><RouteBadge name={routeName(l.routeName)} color={l.routeColor} textColor={l.routeTextColor}/><div><b>Bus {routeName(l.routeName)}</b><small>{l.fromStop} → {l.toStop}</small></div></div>)}</div>)}{!busy&&!error&&!options.length?<div className="empty-panel"><span className="empty-icon">↗</span><b>Where are you going?</b><p>Start typing a Delhi bus stop in either field to choose it from the list.</p></div>:null}</section>;
}


function SimpleTab({title,subtitle,icon,body}:{title:string;subtitle:string;icon:string;body:string}){
  return <section className="screen simple-tab"><div className="simple-tab-hero"><span>{icon}</span><div><span className="eyebrow">UNITED DELHI</span><h1>{title}</h1><p>{subtitle}</p></div></div><div className="flat-card simple-tab-card"><b>{body}</b><small>United Delhi is still focused on live DTC bus information while these sections are being connected.</small></div></section>;
}

function Legal({go}:{go:(path:string)=>void}){
  return <section className="screen">
    <div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">UNITED DELHI</span><h1>Legal & privacy</h1><p>How United Delhi handles transit information and privacy.</p></div></div>
    <div className="flat-card detail-section"><button className="legal-row" onClick={()=>go('/legal/privacy')}><span><b>Privacy Policy</b><small>Data, location and privacy information</small></span><span className="chevron">›</span></button><button className="legal-row" onClick={()=>go('/legal/terms')}><span><b>Terms of Service</b><small>Rules for using United Delhi</small></span><span className="chevron">›</span></button></div>
  </section>;
}
function Privacy({go}:{go:(path:string)=>void}){
  return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/legal')}>‹</button><div><span className="eyebrow">PRIVACY</span><h1>Privacy Policy</h1><p>Effective 4 October 2026</p></div></div>
    <div className="flat-card detail-section legal-copy">
      <h3>Information we collect</h3><p>United Delhi is designed to work without an account. We do not intentionally request a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier, or payment information.</p>
      <h3>Location</h3><p>Location is optional. Foreground device location may be used to find nearby DTC stops and centre the map. The app does not intentionally upload a personal location history to the transit database.</p>
      <h3>Search and journey planning</h3><p>Search terms and journey-planning inputs are sent to the United Delhi API to return transit information and are not intentionally used to create a user profile.</p>
      <h3>Technical information</h3><p>Hosting, network, security and error-handling infrastructure may process ordinary technical information such as IP addresses, timestamps, request metadata and diagnostics.</p>
      <h3>Third-party services</h3><p>United Delhi uses Delhi Open Transit Data, OpenStreetMap/Leaflet, Render, Vercel and Neon. Third parties have their own terms and privacy policies.</p>\n      <h3>Design and feature inspiration</h3><p>United Delhi is inspired by familiar transit apps such as Chartr and One Delhi, including live bus maps, route and stop information, route visualisation and journey planning. These are inspirations rather than a claim of identical design, code, or assets. United Delhi is an independent project and is not affiliated with, endorsed by, or operated by Chartr or One Delhi. Its branding, implementation and backend are independently maintained.</p>
      <h3>Retention and rights</h3><p>We aim to retain personal data only as reasonably necessary for stated purposes, security, legal obligations and service operation. Where applicable law provides rights such as access, correction or deletion, requests may be made through the published developer contact mechanism.</p>
      <h3>Children and applicable law</h3><p>United Delhi does not use targeted advertising, behavioural profiling or tracking of children. Where applicable law requires parental or guardian consent, additional safeguards or other obligations for children, those requirements take priority.</p>
      <h3>Security</h3><p>Reasonable safeguards include HTTPS, input validation, rate limiting, server-side secrets and database controls. No internet service can guarantee absolute security.</p>
    </div></section>;
}
function Terms({go}:{go:(path:string)=>void}){
  return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/legal')}>‹</button><div><span className="eyebrow">LEGAL</span><h1>Terms of Service</h1><p>Effective 4 October 2026</p></div></div>
    <div className="flat-card detail-section legal-copy">
      <h3>Service</h3><p>United Delhi is an independent transit-information service providing route, stop, map, journey-planning and realtime vehicle information. It is not a transport operator, government agency, emergency service, or official DTC/Delhi Government application.</p>
      <h3>Accuracy and availability</h3><p>Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped, unavailable or inaccurate. Realtime positions, arrivals and journey-planning results are estimates and are not guarantees.</p>
      <h3>Acceptable use</h3><p>Do not attack or interfere with the service, bypass safeguards, obtain secrets, abuse upstream services, transmit malicious code, attempt unauthorised access, harmful scraping, stalking or profiling, or misrepresent United Delhi as an official authority.</p>
      <h3>Third-party services</h3><p>Maps, transit feeds, hosting, databases and other third-party components may change or become unavailable and have their own terms.</p>
      <h3>No warranty</h3><p>To the maximum extent permitted by applicable law, the service is provided as-is and as-available without guarantees of uninterrupted, error-free, complete or fit-for-purpose service.</p>
      <h3>Limitation of liability</h3><p>To the maximum extent permitted by applicable law, United Delhi and its developers are not liable for indirect, incidental, special, consequential or reliance-related losses arising from use of or inability to use the service. Nothing excludes liability that cannot lawfully be excluded.</p>
      <h3>Changes and contact</h3><p>We may update the service or these terms. Privacy, security and legal requests should use the developer contact mechanism published with the official app listing. These terms are a product policy and are not a substitute for qualified legal advice.</p>
    </div></section>;
}
function Details({detail,go}:{detail:any;go:(path:string)=>void}){
  const kind=detail?.kind, data=detail?.data||{};
  if(kind==='route'){
    const route=data.route||{},stops=Array.isArray(data.stops)?data.stops:[],buses=Array.isArray(data.vehicles)?data.vehicles:[];
    const name=route.publicRouteName||routeName(route.short_name)||routeName(route.long_name)||'Bus route';
    const bg=isHex(route.route_color)?route.route_color:BUS_COLORS.cngAcBlue,fg=isHex(route.route_text_color)?route.route_text_color:textFor(bg);
    return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">BUS ROUTE</span><h1>{name}</h1><p>{route.fromStop||stops[0]?.name||'Starting stop'} → {route.toStop||stops[stops.length-1]?.name||'Ending stop'}</p></div></div>
      <div className="flat-card route-hero"><span className="route-badge route-hero-badge" style={{backgroundColor:bg,color:fg}}>{name}</span><div className="direction-stack"><b>{route.fromStop||stops[0]?.name||'Starting stop'}</b><span><i/><b/><i/></span><b>{route.toStop||stops[stops.length-1]?.name||'Ending stop'}</b></div></div>
      <RouteMiniMap stops={stops} buses={buses}/>
      <div className="metric-row"><div><b>{stops.length}</b><small>stops</small></div><div><b>{buses.length}</b><small>live buses</small></div><div><b>{String(buses[0]?.operator||'BUS')}</b><small>service</small></div></div>
      <div className="flat-card detail-section"><div className="section-head-inline"><h2>Stops in order</h2><small>Tap a stop for live arrivals</small></div>{stops.map((s:any,i:number)=><button className="ordered-stop" key={s.stop_id} onClick={()=>go('/stops/'+encodeURIComponent(s.stop_id))}><span className="timeline"><i/>{i<stops.length-1?<b/>:null}</span><span><small>{String(i+1).padStart(2,'0')}</small><b>{s.name}</b></span><span className="chevron">›</span></button>)}</div>
    </section>;
  }
  const pair=data||{},stop=pair.stop||{},routes=Array.isArray(pair.routes)?pair.routes:[],arrivals=Array.isArray(pair.arrivals)?pair.arrivals:[];
  const title=stop.name||'Bus stop';
  return <section className="screen"><div className="page-top"><button className="back-button" onClick={()=>go('/')}>‹</button><div><span className="eyebrow">BUS STOP</span><h1>{title}</h1><p>{stop.stop_id||'Stop details'}</p></div></div>
    <div className="flat-card stop-hero"><span className="square-icon">●</span><div><h2>{title}</h2><p>Bus stop</p></div></div>
    <div className="flat-card detail-section"><div className="section-head-inline"><h2>Buses at this stop</h2><small>Live positions</small></div>{arrivals.length?arrivals.map((a:any)=><button className="arrival-row" key={a.vehicleId}><strong style={{background:a.serviceColor||BUS_COLORS.cngAcBlue,color:'#fff',padding:'6px 8px'}}>{routeName(a.routeShortName)||'Bus'}</strong><span className="row-copy"><b>To {a.toStop||'Destination'}</b><small>{a.observedAgeSeconds<60?'Updated just now':'Updated '+Math.floor(a.observedAgeSeconds/60)+' min ago'}</small></span><span className="chevron">›</span></button>):<p className="muted">No live buses are reporting at this stop right now.</p>}</div>
    <div className="flat-card detail-section"><div className="section-head-inline"><h2>Routes at this stop</h2><span className="count-box">{routes.length}</span></div>{routes.map((r:any)=><button className="route-row" key={r.route_id} onClick={()=>go('/routes/'+encodeURIComponent(r.route_id))}><RouteBadge name={routeName(r.publicRouteName||r.short_name)||'Bus'} color={r.route_color} textColor={r.route_text_color}/><span className="row-copy"><b>{r.fromStop||'Starting stop'}</b><small>to {r.toStop||'Ending stop'}</small></span><span className="chevron">›</span></button>)}</div>
  </section>;
}
