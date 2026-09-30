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

function Planner({go:_go}:{go:(path:string)=>void}){return <section className="screen"><h1>Plan your ride</h1></section>}
function Detail({detail:_detail,back:_back}:{detail:any;back:()=>void}){return <section className="screen"><h1>Details</h1></section>}
function LegalPage({go:_go}:{go:(path:string)=>void}){return <section className="screen"><h1>Legal</h1></section>}
function PrivacyPage({go:_go}:{go:(path:string)=>void}){return <section className="screen"><h1>Privacy</h1></section>}
function TermsPage({go:_go}:{go:(path:string)=>void}){return <section className="screen"><h1>Terms</h1></section>}
function backRoute(_path:string){}
