import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { rateLimit } from 'express-rate-limit';
import { spawn } from 'node:child_process';
import {syncMetroStatic} from './metro-sync.js';

const {Pool}=pg,app=express();
const PORT=Number(process.env.PORT)||10000;
const DB=String(process.env.DATABASE_URL||'').trim();
const KEY=String(process.env.DTC_API_KEY||'').trim();
const FEED=String(process.env.DTC_REALTIME_URL||'https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb').trim();
const KEY_PARAM=String(process.env.DTC_API_KEY_PARAM||'key').trim()||'key';
const REALTIME_PERSIST_INTERVAL_MS=Math.max(15000,Number(process.env.REALTIME_PERSIST_INTERVAL_MS)||60000);
let DB_CONNECTION=DB;try{if(DB){const u=new URL(DB);u.searchParams.delete('sslmode');DB_CONNECTION=u.toString()}}catch{} const pool=DB?new Pool({connectionString:DB_CONNECTION,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,ssl:/localhost|127(?:\.\d+){3}|::1/i.test(DB)?false:{rejectUnauthorized:true}}):null;

const str=(v,max=160)=>{const x=String(v??'').trim();return x&&x.length<=max?x:null};
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const coord=(v,a,b)=>{const x=num(v);return x!==null&&x>=a&&x<=b?x:null};
const dist=(a,b,c,d)=>{const R=6371000,r=Math.PI/180,la=(c-a)*r,lo=(d-b)*r,x=Math.sin(la/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(lo/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const SERVICE_COLORS={
 electricAc:'#58B8C7',
 electricDevi:'#42A968',
 cngAc:'#4D8FD0',
 cngNonAc:'#E8B083',
 unknown:'#8B959B'
};
const classifyFleet=(id,...aliases)=>{
 const candidates=[id,...aliases].map(x=>String(x||'').toUpperCase().replace(/[-_\s]/g,'')).filter(Boolean);
 const v=candidates.find(x=>x.startsWith('DL51EV')||x.startsWith('DL51GD')||x.startsWith('DL1PD')||x.startsWith('DL1PE')||x.startsWith('DL1PB')||x.startsWith('DL1PC'))||candidates[0]||'';
 if(v.startsWith('DL51EV'))return{serviceType:'electric',busType:'EV AC (12 mtr)',serviceColor:SERVICE_COLORS.electricAc};
 if(v.startsWith('DL51GD'))return{serviceType:'electric',busType:'EV DEVI AC (9 mtr)',serviceColor:SERVICE_COLORS.electricDevi};
 if(v.startsWith('DL1PD')||v.startsWith('DL1PE'))return{serviceType:'dtc',busType:'CNG AC (12 mtr)',serviceColor:SERVICE_COLORS.cngAc};
 if(v.startsWith('DL1PB')||v.startsWith('DL1PC'))return{serviceType:'dtc',busType:'CNG NonAC (12 mtr)',serviceColor:SERVICE_COLORS.cngNonAc};
 return{serviceType:'unknown',busType:'Unknown',serviceColor:SERVICE_COLORS.unknown};
};
const service=(id,agency,routeShortName,routeId,licensePlate,vehicleLabel)=>classifyFleet(id,licensePlate,vehicleLabel);
const fallbackColor=()=>SERVICE_COLORS.unknown; // fleet colours are resolved from vehicle identity first
const cache={vehicles:[],status:KEY?'STARTING':'UNAVAILABLE',reason:KEY?'Render API is starting':'DTC_API_KEY is not configured',fetchedAt:null,source:'memory',persistedAt:null};
let refreshing=null,poll=null,routeMetaLoadedAt=0,persistPromise=null,lastPersistAt=0,dtcAutoImportRunning=false;
const routeMeta=new Map();

async function loadRouteMeta(){if(!pool)return;try{const rows=(await pool.query(`SELECT r.route_id,r.agency_id,r.short_name,r.long_name,r.route_color,r.route_text_color,first_stop.name AS from_stop,last_stop.name AS to_stop FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.stop_id ASC LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true`)).rows;routeMeta.clear();for(const x of rows)routeMeta.set(String(x.route_id),x);routeMetaLoadedAt=Date.now();console.log('Loaded route metadata: '+routeMeta.size+' routes.')}catch(e){console.error('Route metadata load failed:',e?.message||e)}}
const applyRouteMeta=v=>{const x=routeMeta.get(String(v.routeId||''));const svc=service(v.id,x?.agency_id,x?.short_name,v.routeId,v.licensePlate,v.vehicleLabel);return {...v,routeShortName:x?.short_name||v.routeShortName||v.routeId||null,routeColor:svc.serviceColor||fallbackColor(),routeTextColor:x?.route_text_color||null,routeLongName:x?.long_name||null,fromStop:x?.from_stop||null,toStop:x?.to_stop||null,operator:x?.agency_id||null,...svc}};
const DTC_STATIC_SOURCE_KEY='uploaded-dtc-static-gtfs-v1-20260902';
const DTC_STATIC_BUNDLE_URL='https://br-long-salad-b3b9l7ld.storage.c-4.ap-southeast-1.aws.neon.tech/united-delhi-static-v1/dtc-static-gtfs-v1.zip';
function scheduleDtcStaticRetry(){
 const retry=setTimeout(autoImportDtcStaticIfEmpty,5*60*1000);
 retry.unref?.();
}
function autoImportDtcStaticIfEmpty(){
 if(!pool||String(process.env.DTC_STATIC_AUTO_IMPORT??'true').toLowerCase()==='false'||dtcAutoImportRunning)return;
 void (async()=>{
  try{
   const [countResult,metaResult]=await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM routes'),
    pool.query('SELECT source_key,imported_route_count,imported_stop_count FROM static_feed_meta WHERE id=1').catch(()=>({rows:[]}))
   ]);
   const routeCount=Number(countResult.rows[0]?.count)||0;
   const meta=metaResult.rows[0]||{};
   if(meta.source_key===DTC_STATIC_SOURCE_KEY&&routeCount>=2500&&Number(meta.imported_stop_count)>=6000)return;
   // Don't touch existing rows until the uploaded ZIP is present and reachable.
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
   let response;
   try{response=await fetch(DTC_STATIC_BUNDLE_URL,{method:'HEAD',signal:controller.signal})}
   finally{clearTimeout(timer)}
   if(!response.ok){
    console.warn('Uploaded DTC GTFS ZIP is not available yet (HTTP '+response.status+'); retaining existing static data and retrying shortly.');
    scheduleDtcStaticRetry();
    return;
   }
   if(dtcAutoImportRunning)return;
   dtcAutoImportRunning=true;
   console.log('Uploaded DTC GTFS ZIP is available; importing the supplied static feed.');
   const child=spawn(process.execPath,['scripts/import-dtc-static.mjs'],{cwd:process.cwd(),env:{...process.env,DTC_STATIC_URL:DTC_STATIC_BUNDLE_URL,DTC_STATIC_SOURCE_KEY:DTC_STATIC_SOURCE_KEY},stdio:['ignore','pipe','pipe']});
   child.stdout.setEncoding('utf8');
   child.stderr.setEncoding('utf8');
   child.stdout.on('data',chunk=>console.log('[DTC static importer] '+String(chunk).trimEnd()));
   child.stderr.on('data',chunk=>console.warn('[DTC static importer] '+String(chunk).trimEnd()));
   child.on('error',error=>{
    dtcAutoImportRunning=false;
    console.error('Could not start DTC static importer:',error?.message||error);
    scheduleDtcStaticRetry();
   });
   child.on('close',code=>{
    dtcAutoImportRunning=false;
    if(code===0){
     routeMetaLoadedAt=0;
     void (async()=>{
      await loadRouteMeta();
      cache.vehicles=cache.vehicles.map(applyRouteMeta);
      console.log('Supplied DTC static feed imported; route metadata and cached vehicles refreshed.');
     })().catch(error=>console.error('Post-import metadata refresh failed:',error?.message||error));
    }else{
     console.error('Supplied DTC static importer exited with code '+code+'. Retrying in five minutes.');
     scheduleDtcStaticRetry();
    }
   });
  }catch(error){
   dtcAutoImportRunning=false;
   console.error('DTC static sync check failed:',error?.message||error);
   scheduleDtcStaticRetry();
  }
 })();
}

async function loadDatabaseVehicleCache(){
 if(!pool)return;
 try{
  const rows=(await pool.query("SELECT vehicle_id,route_id,trip_id,stop_id,latitude,longitude,bearing,observed_at FROM vehicle_positions WHERE observed_at > NOW() - INTERVAL '24 hours' ORDER BY observed_at DESC")).rows;
  const latest=new Map();
  for(const row of rows){
   const id=str(row.vehicle_id);
   if(!id||latest.has(id))continue;
   latest.set(id,{id,routeId:str(row.route_id),tripId:str(row.trip_id),stopId:str(row.stop_id),vehicleLabel:null,licensePlate:null,latitude:Number(row.latitude),longitude:Number(row.longitude),bearing:num(row.bearing),observedAt:new Date(row.observed_at).toISOString()});
  }
  const hydrated=[...latest.values()].filter(v=>Number.isFinite(v.latitude)&&Number.isFinite(v.longitude));
  if(!hydrated.length)return;
  cache.vehicles=hydrated.map(applyRouteMeta);
  const timestamps=hydrated.map(v=>Date.parse(v.observedAt)).filter(Number.isFinite);
  const newest=timestamps.length?Math.max(...timestamps):NaN;
  cache.fetchedAt=Number.isFinite(newest)?new Date(newest).toISOString():null;
  cache.status='STALE';
  cache.source='neon-cache';
  cache.reason='Showing the last known cached bus positions while live data reconnects.';
  cache.persistedAt=new Date().toISOString();
  console.log('Loaded Neon realtime cache: '+cache.vehicles.length+' vehicles.');
 }catch(e){console.error('Neon realtime cache load failed:',e?.message||e)}
}

app.disable('x-powered-by');app.set('trust proxy',1);
const DEFAULT_ORIGINS=['https://united-delhi.vercel.app'];
const ALLOWED_ORIGINS=String(process.env.APP_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean).length?String(process.env.APP_ORIGINS).split(',').map(x=>x.trim()).filter(Boolean):DEFAULT_ORIGINS;
app.use(cors({origin:(o,cb)=>{if(!o||ALLOWED_ORIGINS.includes(o))return cb(null,true);cb(new Error('Origin not allowed'))},methods:['GET','POST'],optionsSuccessStatus:204}));
app.use(express.json({limit:'32kb'}));
app.use((_q,r,n)=>{r.setHeader('X-Content-Type-Options','nosniff');r.setHeader('Referrer-Policy','no-referrer');r.setHeader('X-Frame-Options','DENY');r.setHeader('Permissions-Policy','geolocation=(self)');if(_q.secure||String(_q.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https')r.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');n()});
app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}));

async function ensureRuntimeSchema(){if(!pool)return;const c=await pool.connect();try{await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS trip_id TEXT');await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS route_id TEXT');await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS stop_id TEXT');await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS bearing DOUBLE PRECISION');console.log('Runtime database schema verified.')}finally{c.release()}}


/* Static GTFS is DB-only: the current feed is imported into Neon outside the web service. */
function parseVehicle(e,feedTs){
 const v=e?.vehicle,p=v?.position;if(!p)return null;
 const lat=coord(p.latitude,-90,90),lon=coord(p.longitude,-180,180),id=str(v?.vehicle?.id||v?.id||e?.id);if(lat===null||lon===null||!id)return null;
 const ts=num(v?.timestamp||feedTs);if(!ts)return null;
 const ageMs=Date.now()-(ts*1000);if(ageMs>90000||ageMs<-60000)return null;
 return{id,routeId:str(v?.trip?.routeId),tripId:str(v?.trip?.tripId),stopId:str(v?.stopId),vehicleLabel:str(v?.vehicle?.label),licensePlate:str(v?.vehicle?.licensePlate),latitude:lat,longitude:lon,bearing:num(p.bearing),observedAt:new Date(ts*1000).toISOString()};
}
async function fetchLive(){
 if(!KEY)throw new Error('DTC_API_KEY is not configured');
 const u=new URL(FEED);u.searchParams.set(KEY_PARAM,KEY);const ac=new AbortController(),t=setTimeout(()=>ac.abort(),12000);
 try{const r=await fetch(u,{signal:ac.signal,headers:{accept:'application/x-protobuf, application/octet-stream','user-agent':'United-Delhi/2.0'}});if(!r.ok)throw new Error('DTC realtime HTTP '+r.status);const b=new Uint8Array(await r.arrayBuffer());if(b.length>10*1024*1024)throw new Error('Realtime feed exceeds safety limit');const f=GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(b),m=new Map();for(const e of f.entity||[]){const v=parseVehicle(e,Number(f.header?.timestamp||0));if(v)m.set(v.id,v)}return[...m.values()]}catch(e){if(e?.name==='AbortError')throw new Error('DTC realtime request timed out');throw e}finally{clearTimeout(t)}
}
async function enrich(vs){
 if(!pool||!vs.length)return vs.map(v=>{const svc=service(v.id,null,v.routeShortName,v.routeId,v.licensePlate,v.vehicleLabel);return {...v,routeColor:svc.serviceColor||fallbackColor(),routeLongName:null,...svc}});
 const ids=[...new Set(vs.map(v=>v.routeId).filter(Boolean))];if(!ids.length)return vs.map(v=>{const svc=service(v.id,null,v.routeShortName,v.routeId);return {...v,routeColor:svc.serviceColor||fallbackColor(),routeLongName:null,...svc}});
 try{const rows=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_color,route_text_color FROM routes WHERE route_id=ANY($1::text[])',[ids])).rows;const map=new Map(rows.map(x=>[String(x.route_id),x]));return vs.map(v=>{const x=map.get(String(v.routeId||'')),svc=service(v.id,x?.agency_id,x?.short_name,v.routeId);return {...v,routeShortName:x?.short_name||v.routeId||null,routeColor:svc.serviceColor||fallbackColor(),routeTextColor:x?.route_text_color||null,routeLongName:x?.long_name||null,operator:x?.agency_id||null,...svc}})}catch{return vs.map(v=>{const svc=service(v.id,null,v.routeShortName,v.routeId);return {...v,routeShortName:v.routeId||null,routeColor:svc.serviceColor||fallbackColor(),routeTextColor:null,routeLongName:null,operator:null,...svc}})}
}
async function persist(vs){if(!pool||!vs.length)return false;const c=await pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='10000'");for(let i=0;i<Math.min(vs.length,5000);i+=250){const chunk=vs.slice(i,i+250),values=[];const p=chunk.map((v,j)=>{const b=j*8;values.push(v.id,v.routeId,v.tripId,v.stopId,v.latitude,v.longitude,v.bearing,v.observedAt);return '($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',$'+(b+5)+',$'+(b+6)+',$'+(b+7)+',$'+(b+8)+',NOW())'}).join(',');await c.query('INSERT INTO vehicle_positions(vehicle_id,route_id,trip_id,stop_id,latitude,longitude,bearing,observed_at,updated_at) VALUES '+p+' ON CONFLICT(vehicle_id) DO UPDATE SET route_id=EXCLUDED.route_id,trip_id=EXCLUDED.trip_id,stop_id=EXCLUDED.stop_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,bearing=EXCLUDED.bearing,observed_at=EXCLUDED.observed_at,updated_at=NOW()',values)}await c.query("DELETE FROM vehicle_positions WHERE observed_at < NOW() - INTERVAL '24 hours'");await c.query('COMMIT');return true}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('Vehicle persistence failed:',e.message);return false}finally{c.release()}}

function queuePersist(vs){
 if(!pool||!vs.length||persistPromise||Date.now()-lastPersistAt<REALTIME_PERSIST_INTERVAL_MS)return;
 lastPersistAt=Date.now();
 persistPromise=persist(vs).then(ok=>{if(ok)cache.persistedAt=new Date().toISOString()}).catch(e=>console.error('Vehicle persistence queue failed:',e?.message||e)).finally(()=>{persistPromise=null});
}
async function refresh(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  try{
   if(pool && (routeMetaLoadedAt===0 || Date.now()-routeMetaLoadedAt>15*60*1000))await loadRouteMeta();
   const raw=await fetchLive();
   if(!raw.length)throw new Error('DTC realtime feed returned no valid vehicles');
   cache.vehicles=raw.map(applyRouteMeta);
   cache.status='OK';cache.reason=null;cache.fetchedAt=new Date().toISOString();
   cache.source='dtc-live';
   queuePersist(cache.vehicles);
   console.log('Realtime feed decoded: '+raw.length+' vehicles; Neon/client caches refreshed.');
  }catch(e){
   cache.status=cache.fetchedAt?'STALE':'UNAVAILABLE';
   const message=e instanceof Error?e.message:String(e||'Realtime request failed');
   cache.reason=cache.vehicles.length?'Live DTC data is temporarily unavailable; showing the last known bus positions.':message;
   console.error('Realtime poll failed:',message);
  }
 })().finally(()=>{refreshing=null});
 return refreshing;
}

app.get('/',(_q,r)=>r.json({status:'OK',service:'united-delhi',message:'API is running. Use /health or /api/status.'}));
app.get('/health',(_q,r)=>r.json({status:'OK',service:'united-delhi',realtime:cache.status,time:new Date().toISOString(),cachedVehicles:cache.vehicles.length}));
app.get('/healthz',(_q,r)=>r.json({status:'OK'}));
app.get('/ready',(_q,r)=>r.json({status:'OK',database:Boolean(pool),realtime:cache.status,cachedVehicles:cache.vehicles.length}));
app.get('/api/status',async(_q,r)=>{let database='NOT_CONFIGURED';if(pool){try{await pool.query('SELECT 1');database='OK'}catch{database='ERROR'}}r.json({status:'OK',database,realtime:cache.status,realtimeVehicles:cache.vehicles.length,fetchedAt:cache.fetchedAt,source:cache.source,persistedAt:cache.persistedAt,reason:cache.reason})});
app.get('/api/realtime/vehicles',async(_q,r)=>{
 let stale=!cache.fetchedAt||Date.now()-Date.parse(cache.fetchedAt)>90000;
 if(stale&&KEY)await refresh().catch(()=>{});
 stale=!cache.fetchedAt||Date.now()-Date.parse(cache.fetchedAt)>90000;
 const hasData=cache.vehicles.length>0;
 r.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
 r.setHeader('Pragma','no-cache');
 r.json({status:hasData?'OK':cache.status,count:cache.vehicles.length,vehicles:cache.vehicles,fetchedAt:cache.fetchedAt,stale:stale||cache.status==='STALE',source:cache.source,cacheAgeSeconds:cache.fetchedAt?Math.max(0,Math.round((Date.now()-Date.parse(cache.fetchedAt))/1000)):null,reason:cache.reason});
});

app.get('/api/metro',async(_q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',routes:[],stops:[],reason:'Database is not configured'});try{const meta=(await pool.query('SELECT * FROM metro_feed_meta WHERE id=1')).rows[0]||null;const routes=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_type,route_color,route_text_color FROM metro_routes ORDER BY short_name,route_id')).rows;const stops=(await pool.query('SELECT stop_id,name,latitude,longitude FROM metro_stops ORDER BY name,stop_id')).rows;r.json({status:'OK',routes,stops,meta})}catch(e){r.status(500).json({status:'ERROR',routes:[],stops:[],reason:'Metro data is temporarily unavailable'})}});
app.get('/api/metro/routes/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE'});try{const id=str(q.params.id),route=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_type,route_color,route_text_color FROM metro_routes WHERE route_id=$1',[id])).rows[0];if(!route)return r.status(404).json({status:'NOT_FOUND'});const rows=(await pool.query('SELECT s.stop_id,s.name,s.latitude,s.longitude,rs.stop_sequence,COALESCE(rs.direction_id,0) AS direction_id FROM metro_route_stops rs JOIN metro_stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=$1 ORDER BY rs.direction_id,rs.stop_sequence,s.stop_id',[id])).rows;const grouped=new Map();for(const stop of rows){const key=String(stop.direction_id);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(stop)}const directions=[...grouped.entries()].map(([directionId,stops])=>({directionId,fromStop:stops[0]?.name||null,toStop:stops[stops.length-1]?.name||null,stops}));r.json({status:'OK',route,directions,stops:directions[0]?.stops||[]})}catch(e){console.error('Metro route query failed:',e?.message||e);r.status(500).json({status:'ERROR',reason:'Failed to load metro route'})}});
app.get('/api/routes/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});try{const id=str(q.params.id),route=(await pool.query(`SELECT r.route_id,r.agency_id,r.short_name,r.long_name,r.route_color,r.route_text_color,first_stop.name AS from_stop,last_stop.name AS to_stop FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.stop_id ASC LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true WHERE r.route_id=$1`,[id])).rows[0];let routeFallback=false;if(!route){const live=cache.vehicles.find(v=>String(v.routeId||'')===id);if(live){routeFallback=true;route={route_id:id,agency_id:live.operator||null,short_name:live.routeShortName||id,long_name:live.routeLongName||null,route_color:live.routeColor||null,route_text_color:live.routeTextColor||null,from_stop:live.fromStop||null,to_stop:live.toStop||null}}else return r.status(404).json({status:'NOT_FOUND',reason:'Route not found'});}if(!route)return r.status(404).json({status:'NOT_FOUND',reason:'Route not found'});const stops=routeFallback?[]:(await pool.query('SELECT s.stop_id,s.name,s.latitude,s.longitude,rs.stop_sequence FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=$1 ORDER BY rs.stop_sequence,s.stop_id',[id])).rows;r.json({status:'OK',route,stops,vehicles:cache.vehicles.filter(v=>String(v.routeId||'')===id),staticDataAvailable:!routeFallback})}catch{r.status(500).json({status:'ERROR',reason:'Failed to load route'})}});
app.get('/api/stops/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});try{const id=str(q.params.id),stop=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[id])).rows[0];if(!stop)return r.status(404).json({status:'NOT_FOUND',reason:'Stop not found'});const routes=(await pool.query(`SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,MIN(rs.stop_sequence) AS stop_sequence,first_stop.name AS from_stop,last_stop.name AS to_stop FROM route_stops rs JOIN routes r ON r.route_id=rs.route_id LEFT JOIN LATERAL (SELECT s.name FROM route_stops x JOIN stops s ON s.stop_id=x.stop_id WHERE x.route_id=r.route_id ORDER BY x.stop_sequence ASC,s.stop_id ASC LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops x JOIN stops s ON s.stop_id=x.stop_id WHERE x.route_id=r.route_id ORDER BY x.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true WHERE rs.stop_id=$1 GROUP BY r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,first_stop.name,last_stop.name ORDER BY MIN(rs.stop_sequence),r.short_name,r.route_id LIMIT 100`,[id])).rows;r.json({status:'OK',stop,routes})}catch{r.status(500).json({status:'ERROR',reason:'Failed to load stop'})}});
app.get('/api/stops/:id/arrivals',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',arrivals:[],reason:'Database is not configured'});try{const st=(await pool.query('SELECT latitude,longitude FROM stops WHERE stop_id=$1',[str(q.params.id)])).rows[0];if(!st)return r.status(404).json({status:'NOT_FOUND',arrivals:[],reason:'Stop not found'});const a=cache.vehicles.map(v=>({...v,distanceMeters:Math.round(dist(Number(st.latitude),Number(st.longitude),v.latitude,v.longitude))})).filter(v=>v.distanceMeters<=2500).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,20).map(v=>({vehicleId:v.id,routeId:v.routeId,routeShortName:v.routeShortName||v.routeId||null,routeName:v.routeShortName||v.routeId||'Bus',routeColor:v.routeColor,routeTextColor:v.routeTextColor,serviceType:v.serviceType,serviceColor:v.serviceColor,distanceMeters:v.distanceMeters,observedAt:v.observedAt,observedAgeSeconds:Math.max(0,Math.round((Date.now()-Date.parse(v.observedAt))/1000)),toStop:v.toStop||null,tripHeadsign:v.tripHeadsign||null}));r.json({status:a.length?'OK':'UNAVAILABLE',arrivals:a,reason:a.length?null:'No nearby live buses are available right now.'})}catch{r.status(500).json({status:'ERROR',arrivals:[],reason:'Failed to load arrivals'})}});
app.post('/api/stops/nearby',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',stops:[],reason:'Database is not configured'});const lat=coord(q.body?.lat,-90,90),lon=coord(q.body?.lon,-180,180),limit=Math.min(50,Math.max(1,Number(q.body?.limit)||30));if(lat===null||lon===null)return r.status(400).json({status:'ERROR',stops:[],reason:'Valid latitude and longitude are required'});try{const rows=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4 LIMIT 10000',[lat-.15,lat+.15,lon-.15,lon+.15])).rows,stops=rows.map(x=>({...x,distanceMeters:Math.round(dist(lat,lon,Number(x.latitude),Number(x.longitude)))})).filter(x=>x.distanceMeters<=15000).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,limit);r.json({status:'OK',stops})}catch{r.status(500).json({status:'ERROR',stops:[],reason:'Nearby stops are temporarily unavailable'})}});
app.get('/api/search',async(req,res)=>{if(!pool)return res.status(503).json({status:'UNAVAILABLE',results:[],reason:'Database is not configured'});const raw=String(req.query.q||'').trim().slice(0,80);if(raw.length<2)return res.json({status:'OK',results:[]});const x=raw.replace(/[%_]/g,'');const like='%'+x+'%';try{const routes=(await pool.query(`SELECT r.route_id AS id,COALESCE(r.short_name,r.long_name,r.route_id) AS label,r.long_name,r.route_color AS "routeColor",r.route_text_color AS "routeTextColor",first_stop.name AS "fromStop",last_stop.name AS "toStop",'route' AS type,CASE WHEN lower(r.short_name)=lower($1) OR lower(r.route_id)=lower($1) THEN 0 WHEN r.short_name ILIKE $2 OR r.route_id ILIKE $2 OR r.long_name ILIKE $2 THEN 1 ELSE 2 END AS rank FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence,s.stop_id LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true WHERE r.short_name ILIKE $2 OR r.route_id ILIKE $2 OR r.long_name ILIKE $2 ORDER BY rank,r.short_name,r.route_id LIMIT 30`,[x,like])).rows;const live=(await pool.query(`SELECT vp.route_id AS id,vp.route_id AS label,NULL::text AS long_name,NULL::text AS "routeColor",NULL::text AS "routeTextColor",NULL::text AS "fromStop",NULL::text AS "toStop",'route' AS type,0 AS rank FROM vehicle_positions vp WHERE vp.observed_at>NOW()-INTERVAL '30 minutes' AND vp.route_id IS NOT NULL AND vp.route_id ILIKE $1 AND NOT EXISTS(SELECT 1 FROM routes r WHERE r.route_id=vp.route_id) GROUP BY vp.route_id LIMIT 15`,[like])).rows;const stops=(await pool.query(`SELECT s.stop_id AS id,s.name AS label,s.latitude,s.longitude,'Stop ID '||s.stop_id||' · '||ROUND(s.latitude::numeric,5)||', '||ROUND(s.longitude::numeric,5) AS "stopContext",(SELECT COUNT(DISTINCT rs.route_id)::int FROM route_stops rs WHERE rs.stop_id=s.stop_id) AS "routeCount",'stop' AS type,CASE WHEN lower(s.name)=lower($1) THEN 0 WHEN s.name ILIKE $2 THEN 1 ELSE 2 END AS rank FROM stops s WHERE s.name ILIKE $2 ORDER BY rank,s.name,s.stop_id LIMIT 30`,[x,like])).rows;const seen=new Set();const merged=[...routes,...live,...stops].filter(v=>{const k=v.type+':'+v.id;if(seen.has(k))return false;seen.add(k);return true}).sort((p,q)=>(p.rank??9)-(q.rank??9));return res.json({status:'OK',results:merged.slice(0,60)})}catch(e){console.error('Search failed:',e?.message||e);return res.status(500).json({status:'ERROR',results:[],reason:'Search is temporarily unavailable'})}});app.get('/api/plan',async(q,r)=>{
 if(!pool)return r.status(503).json({status:'UNAVAILABLE',options:[],reason:'Database is not configured'});
 let fromId=str(q.query.fromStopId),toId=str(q.query.toStopId);
 try{
  if(!fromId){const name=str(q.query.from);if(name)fromId=(await pool.query('SELECT stop_id FROM stops WHERE name=$1 ORDER BY stop_id LIMIT 1',[name])).rows[0]?.stop_id||null}
  if(!toId){const name=str(q.query.to);if(name)toId=(await pool.query('SELECT stop_id FROM stops WHERE name=$1 ORDER BY stop_id LIMIT 1',[name])).rows[0]?.stop_id||null}
  if(!fromId||!toId||fromId===toId)return r.status(400).json({status:'ERROR',options:[],reason:'Please select two different bus stops from the suggestions.'});
  const directRows=(await pool.query("SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,a.stop_id from_stop_id,fs.name from_stop,b.stop_id to_stop_id,ts.name to_stop,a.stop_sequence from_sequence,b.stop_sequence to_sequence FROM route_stops a JOIN route_stops b ON b.route_id=a.route_id AND b.stop_sequence>a.stop_sequence JOIN routes r ON r.route_id=a.route_id JOIN stops fs ON fs.stop_id=a.stop_id JOIN stops ts ON ts.stop_id=b.stop_id WHERE a.stop_id=$1 AND b.stop_id=$2 ORDER BY (b.stop_sequence-a.stop_sequence),r.route_id LIMIT 12",[fromId,toId])).rows;
  const direct=directRows.map(x=>({type:'direct',durationMinutes:Math.max(3,Math.ceil((Number(x.to_sequence)-Number(x.from_sequence))*2.5)),durationIsEstimate:true,walkingMinutes:null,legs:[{routeId:String(x.route_id),routeName:x.short_name||x.long_name||'Bus',routeColor:x.route_color,routeTextColor:x.route_text_color,fromStop:x.from_stop,toStop:x.to_stop,fromStopId:x.from_stop_id,toStopId:x.to_stop_id}]}));
  let transfers=[];
  if(direct.length<5){
   const rows=(await pool.query("WITH from_routes AS (SELECT route_id,stop_sequence AS from_seq FROM route_stops WHERE stop_id=$1), to_routes AS (SELECT route_id,stop_sequence AS to_seq FROM route_stops WHERE stop_id=$2), transfer_points AS (SELECT fr.route_id AS r1,fr.from_seq,x.stop_id AS transfer_stop_id,x.stop_sequence AS transfer_seq FROM from_routes fr JOIN route_stops x ON x.route_id=fr.route_id AND x.stop_sequence>fr.from_seq AND x.stop_sequence<=fr.from_seq+40), candidates AS (SELECT tp.r1,tp.from_seq,tp.transfer_stop_id,tp.transfer_seq,tr.route_id AS r2,tr.stop_sequence AS to_seq FROM transfer_points tp JOIN route_stops tr ON tr.stop_id=tp.transfer_stop_id JOIN to_routes tr2 ON tr2.route_id=tr.route_id AND tr2.to_seq>tr.stop_sequence WHERE tr.route_id<>tp.r1 AND tr.stop_sequence>tp.transfer_seq AND (tr2.to_seq-tr.stop_sequence)<=40) SELECT c.*,r1.short_name AS r1_name,r1.long_name AS r1_long,r1.route_color AS r1_color,r1.route_text_color AS r1_text,r2.short_name AS r2_name,r2.long_name AS r2_long,r2.route_color AS r2_color,r2.route_text_color AS r2_text,fs.name AS from_name,ts.name AS transfer_name,es.name AS to_name FROM candidates c JOIN routes r1 ON r1.route_id=c.r1 JOIN routes r2 ON r2.route_id=c.r2 JOIN stops fs ON fs.stop_id=$1 JOIN stops ts ON ts.stop_id=c.transfer_stop_id JOIN stops es ON es.stop_id=$2 ORDER BY (c.transfer_seq-c.from_seq)+(c.to_seq-c.transfer_seq),c.r1,c.r2 LIMIT 20",[fromId,toId])).rows;
   const seen=new Set();
   for(const x of rows){
    const key=String(x.r1)+'>'+String(x.r2)+'@'+String(x.transfer_stop_id);
    if(seen.has(key))continue;seen.add(key);
    transfers.push({type:'transfer',durationMinutes:Math.max(8,Math.ceil(((Number(x.transfer_seq)-Number(x.from_seq))+(Number(x.to_seq)-Number(x.transfer_seq)))*2.5)+5),durationIsEstimate:true,walkingMinutes:5,legs:[
      {routeId:String(x.r1),routeName:x.r1_name||x.r1_long||'Bus',routeColor:x.r1_color,routeTextColor:x.r1_text,fromStop:x.from_name,toStop:x.transfer_name,fromStopId:fromId,toStopId:x.transfer_stop_id},
      {routeId:String(x.r2),routeName:x.r2_name||x.r2_long||'Bus',routeColor:x.r2_color,routeTextColor:x.r2_text,fromStop:x.transfer_name,toStop:x.to_name,fromStopId:x.transfer_stop_id,toStopId:toId}
    ],transferStop:x.transfer_name});
    if(transfers.length>=6)break;
   }
  }
  const options=[...direct,...transfers].sort((a,b)=>(a.durationMinutes||999)-(b.durationMinutes||999)).slice(0,5);
  const origin=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[fromId])).rows[0]||null;
  const destination=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[toId])).rows[0]||null;
  return r.json({status:'OK',origin,destination,options,reason:options.length?null:'No bus journey was found between the selected stops.'});
 }catch(e){console.error('Journey planner failed:',e?.message||e);return r.status(500).json({status:'ERROR',options:[],reason:'Journey planner is temporarily unavailable. Please try again.'})}
});
app.use((_q,r)=>r.status(404).json({status:'NOT_FOUND',reason:'Endpoint not found'}));
app.use((e,_q,r,_n)=>{console.error('Unhandled request error:',e?.message||e);if(!r.headersSent)r.status(500).json({status:'ERROR',reason:'Internal server error'})});
const server=app.listen(PORT,'0.0.0.0',()=>{console.log('United Delhi API listening on 0.0.0.0:'+PORT);setTimeout(async()=>{try{if(pool){await ensureRuntimeSchema();await loadRouteMeta();await loadDatabaseVehicleCache();autoImportDtcStaticIfEmpty()}}catch(e){console.error('Database bootstrap failed:',e?.message||e)}if(KEY){void refresh();poll=setInterval(()=>void refresh(),15000)}if(pool){if(String(process.env.METRO_AUTO_SYNC??'true').toLowerCase()!=='false'){setTimeout(()=>void syncMetroStatic(pool).catch(e=>console.error('DMRC static sync failed:',e?.message||e)),5000);setInterval(()=>void syncMetroStatic(pool).catch(e=>console.error('DMRC static sync failed:',e?.message||e)),24*60*60*1000)}}},1500)});
server.requestTimeout=30000;server.headersTimeout=40000;server.keepAliveTimeout=65000;
process.on('unhandledRejection',e=>console.error('Unhandled rejection:',e));process.on('uncaughtException',e=>console.error('Uncaught exception:',e));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,async()=>{if(poll)clearInterval(poll);server.close();await pool?.end().catch(()=>{});process.exit(0)});
