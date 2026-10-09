import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {api} from './api';
import type {Vehicle} from './api';
import {parsePath,storageGet,storageSet} from './lib';
import type {Go,LiveStatus,Page,Point} from './lib';
import {Icon} from './components/ui';
import Home from './components/Home';
import Legend from './components/Legend';
import Metro from './components/Metro';
import MetroRoute from './components/MetroRoute';
import {Planner,RoutePage,StopPage,Hub,Help,Legal,Privacy,Terms,About} from './components/pages';

const CACHE_KEY='ud-live-vehicles-v4';
const readCache=():Vehicle[]=>{try{const d=JSON.parse(storageGet(CACHE_KEY)||'null');return Array.isArray(d?.vehicles)?d.vehicles:[]}catch{return[]}};

export default function App(){
  const[page,setPage]=useState<Page>(()=>parsePath());
  const[accepted,setAccepted]=useState(()=>storageGet('ud-consent-v1')==='1');
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const[live,setLive]=useState<LiveStatus>('loading');
  const[liveNote,setLiveNote]=useState('');
  const[online,setOnline]=useState(()=>navigator.onLine!==false);
  const[location,setLocation]=useState<Point|null>(null);
  const[locState,setLocState]=useState<'idle'|'asking'|'denied'|'unavailable'|'cached'>('idle');
  const[legend,setLegend]=useState(false);
  const busy=useRef(false);
  const hasData=useRef(false);

  const go:Go=useCallback((path,replace)=>{
    if(path===window.location.pathname)return;
    window.history[replace?'replaceState':'pushState']({},'',path);setPage(parsePath(path));
  },[]);
  useEffect(()=>{const f=()=>setPage(parsePath());window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f)},[]);
  useEffect(()=>{
    const on=()=>setOnline(true),off=()=>setOnline(false);
    window.addEventListener('online',on);window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
  },[]);

  const locate=useCallback(()=>{
    if(!navigator.geolocation){setLocState('unavailable');return}
    setLocState('asking');
    navigator.geolocation.getCurrentPosition(p=>{
      const next={lat:p.coords.latitude,lon:p.coords.longitude};
      setLocation(next);setLocState('idle');storageSet('ud-last-location',JSON.stringify(next));
    },err=>{setLocState(err?.code===1?'denied':'unavailable');},{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
  },[]);
  useEffect(()=>{
    if(!accepted||!navigator.geolocation)return;
    let watch:number|undefined;
    let cancelled=false;
    const start=()=>{
      if(cancelled||watch!==undefined)return;
      watch=navigator.geolocation.watchPosition(p=>{
        const next={lat:p.coords.latitude,lon:p.coords.longitude};
        setLocation(next);
        setLocState('idle');
        storageSet('ud-last-location',JSON.stringify(next));
      },err=>{
        if(err?.code===1)setLocState('denied');
        else if(!location)setLocState('unavailable');
      },{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
    };
    try{
      const permissions=(navigator as any).permissions;
      if(permissions?.query){
        permissions.query({name:'geolocation'}).then((status:any)=>{
          if(cancelled)return;
          if(status.state==='granted')start();
          status.onchange=()=>{if(status.state==='granted')start();};
        }).catch(start);
      }else start();
    }catch{start()}
    return()=>{cancelled=true;if(watch!==undefined)navigator.geolocation.clearWatch(watch)};
  },[accepted]);

  const load=useCallback(async()=>{
    if(busy.current)return;busy.current=true;
    try{
      const r=await api.vehicles();
      const list=Array.isArray(r.vehicles)?r.vehicles:[];
      if(list.length){hasData.current=true;setVehicles(list)}
      const age= r.fetchedAt ? Math.max(0,Date.now()-Date.parse(r.fetchedAt)) : Infinity;
      const fresh=list.length>0 && Number.isFinite(age) && age<=90000 && r.source!=='client-cache' && r.stale!==true;
      setLive(fresh?'ok':list.length||hasData.current?'stale':'unavailable');
      setLiveNote(fresh?'':(r.reason||''));
    }catch(e){
      setLive(hasData.current?'stale':'unavailable');
      setLiveNote(hasData.current?'Showing the last known bus positions.':((e as Error).message||'Live data is unavailable.'));
    }finally{busy.current=false}
  },[]);
  useEffect(()=>{
    if(!accepted)return;
    const c=readCache();if(c.length){hasData.current=true;setVehicles(c);setLive('stale');setLiveNote('Showing the last known bus positions while live data loads.')}
    void load();
    const tick=()=>{if(!document.hidden)void load()};
    const id=window.setInterval(tick,10000);
    document.addEventListener('visibilitychange',tick);window.addEventListener('online',tick);
    return()=>{window.clearInterval(id);document.removeEventListener('visibilitychange',tick);window.removeEventListener('online',tick)};
  },[accepted,load]);

  const services=useMemo(()=>{
    const m=new Map<string,Vehicle>();
    for(const v of vehicles)if(v.routeId&&!m.has(v.routeId))m.set(v.routeId,v);
    return m;
  },[vehicles]);

  if(!accepted){
    if(page.kind==='privacy')return <div className="app solo"><main className="view"><Privacy go={go}/></main></div>;
    if(page.kind==='terms')return <div className="app solo"><main className="view"><Terms go={go}/></main></div>;
    if(page.kind==='legal')return <div className="app solo"><main className="view"><Legal go={go}/></main></div>;
    return <Consent go={go} onAccept={()=>{storageSet('ud-consent-v1','1');setAccepted(true)}}/>;
  }

  const tab=page.kind==='home'||page.kind==='route'||page.kind==='stop'?'home':page.kind==='plan'?'plan':page.kind==='metro'||page.kind==='metroRoute'?'metro':page.kind==='settings'||page.kind==='hub'||page.kind==='legal'||page.kind==='privacy'||page.kind==='terms'||page.kind==='help'||page.kind==='about'?'settings':'home';
  const nav:[string,string,'bus'|'plan'|'metro'|'hub'|'help',string][]=[['home','/','bus','Bus'],['plan','/plan','plan','Trip Plan'],['metro','/metro','metro','Metro'],['settings','/settings','help','Settings']];

  return <div className="app">
    {!online?<div className="banner off" role="status">You're offline. Showing the last saved data.</div>:null}
    <main className={'view'+(page.kind==='home'?' view-home':'')}>
      {page.kind==='home'?<Home vehicles={vehicles} live={live} liveNote={liveNote} onRetry={()=>void load()} location={location} locState={locState} onLocate={locate} onLegend={()=>setLegend(true)} go={go} services={services}/>
      :page.kind==='plan'?<Planner go={go}/>
      :page.kind==='metro'?<Metro go={go}/>
      :page.kind==='metroRoute'?<MetroRoute id={page.id||''} go={go}/>
      :page.kind==='settings'?<Hub go={go} onLegend={()=>setLegend(true)}/>
      :page.kind==='hub'?<Hub go={go} onLegend={()=>setLegend(true)}/>
      :page.kind==='help'?<Help go={go}/>
      :page.kind==='legal'?<Legal go={go}/>
      :page.kind==='privacy'?<Privacy go={go}/>
      :page.kind==='terms'?<Terms go={go}/>
      :page.kind==='about'?<About go={go}/>
      :page.kind==='route'?<RoutePage id={page.id||''} go={go} services={services}/>
      :<StopPage id={page.id||''} go={go} services={services}/>}
    </main>
    <nav className="nav" aria-label="Main">
      {nav.map(([k,path,ic,label])=><button key={k} className={tab===k?'on':''} aria-current={tab===k?'page':undefined} onClick={()=>go(path)}><Icon n={ic}/><span>{label}</span></button>)}
    </nav>
    <Legend open={legend} onClose={()=>setLegend(false)}/>
  </div>;
}

function Consent({go,onAccept}:{go:Go;onAccept:()=>void}){
  const[ok,setOk]=useState(false);
  return <div className="app solo"><main className="view gate">
    <div className="gate-card">
      <img src="/icon.svg" alt="" width={56} height={56}/>
      <h1>United Delhi</h1>
      <p className="lead">Live Delhi bus tracking, routes, stops and trip planning.</p>
      <p>By continuing you agree to the <button className="link" onClick={()=>go('/legal/terms')}>Terms of Service</button> and acknowledge the <button className="link" onClick={()=>go('/legal/privacy')}>Privacy Policy</button>.</p>
      <label className="check"><input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/><span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span></label>
      <button className="btn" disabled={!ok} onClick={onAccept}>Continue</button>
      <small>No account or phone number needed. Location is optional and used only for nearby stops and map centring.</small>
    </div></main></div>;
}
