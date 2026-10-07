import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { rateLimit } from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { parse } from 'csv-parse/sync';

const {Pool}=pg,app=express();
const PORT=Number(process.env.PORT)||10000;
const DB=String(process.env.DATABASE_URL||'').trim();
const KEY=String(process.env.DTC_API_KEY||'').trim();
const FEED=String(process.env.DTC_REALTIME_URL||'https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb').trim();
const KEY_PARAM=String(process.env.DTC_API_KEY_PARAM||'key').trim()||'key';
const pool=DB?new Pool({connectionString:DB,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,ssl:/localhost|127(?:\.\d+){3}|::1/i.test(DB)?false:{rejectUnauthorized:true}}):null;

const DATA=path.join(path.dirname(fileURLToPath(import.meta.url)),'../data/otd_gtfs');
const str=(v,max=160)=>{const x=String(v??'').trim();return x&&x.length<=max?x:null};
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const coord=(v,a,b)=>{const x=num(v);return x!==null&&x>=a&&x<=b?x:null};
const dist=(a,b,c,d)=>{const R=6371000,r=Math.PI/180,la=(c-a)*r,lo=(d-b)*r,x=Math.sin(la/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(lo/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const SERVICE_COLORS={dtc:'#24C88B',cluster:'#E57D43',electric:'#2FAFBC',unknown:'#6B7280'};
const routeFamily=(value)=>{const s=String(value||'').toUpperCase().trim();const m=s.match(/^(?:D-)?(AIR[- ]?\d+[A-Z]?|\d+[A-Z]?)/);return m?m[1].replace(/\s+/g,'').replace(/^AIR-?/,'AIR-'):s};
const CLUSTER_ROUTE_OVERRIDES=new Set(['801','801A','801STL','801STL-IGI-DWS-22','801STL-KAP-DWS-22']);
const service=(id,agency,routeShortName,routeId)=>{const v=String(id||'').toUpperCase(),a=String(agency||'').toUpperCase(),route=routeFamily(routeShortName||routeId);if(/^DL51(?:EV|GD)/.test(v))return{serviceType:'electric',serviceColor:SERVICE_COLORS.electric};if(a==='DIMTS'||a==='DOT'||CLUSTER_ROUTE_OVERRIDES.has(route))return{serviceType:'cluster',serviceColor:SERVICE_COLORS.cluster};if(a==='DTC')return{serviceType:'dtc',serviceColor:SERVICE_COLORS.dtc};return{serviceType:'unknown',serviceColor:SERVICE_COLORS.unknown}};
const fallbackColor=()=>SERVICE_COLORS.unknown;
const cache={vehicles:[],status:KEY?'STARTING':'UNAVAILABLE',reason:KEY?'Render API is starting':'DTC_API_KEY is not configured',fetchedAt:null,source:'memory',persistedAt:null};
let refreshing=null,poll=null;
const routeMeta=new Map();

async function loadRouteMeta(){if(!pool)return;try{const rows=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_color,route_text_color FROM routes')).rows;routeMeta.clear();for(const x of rows)routeMeta.set(String(x.route_id),x);console.log('Loaded route metadata: '+routeMeta.size+' routes.')}catch(e){console.error('Route metadata load failed:',e?.message||e)}}
const applyRouteMeta=v=>{const x=routeMeta.get(String(v.routeId||''));const svc=service(v.id,x?.agency_id,x?.short_name,v.routeId);return {...v,routeShortName:x?.short_name||null,routeColor:x?.route_color||svc.serviceColor||fallbackColor(),routeTextColor:x?.route_text_color||null,routeLongName:x?.long_name||null,operator:x?.agency_id||null,...svc}};
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
app.use(cors({origin:(o,cb)=>{const allow=String(process.env.APP_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);if(!o||!allow.length||allow.includes(o))return cb(null,true);cb(new Error('Origin not allowed'))},methods:['GET','POST'],optionsSuccessStatus:204}));
app.use(express.json({limit:'32kb'}));
app.use((_q,r,n)=>{r.setHeader('X-Content-Type-Options','nosniff');r.setHeader('Referrer-Policy','no-referrer');r.setHeader('X-Frame-Options','DENY');n()});
app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}));

async function ensureRuntimeSchema(){if(!pool)return;const c=await pool.connect();try{await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS trip_id TEXT');await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS route_id TEXT');await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS stop_id TEXT');await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS bearing DOUBLE PRECISION');await c.query('ALTER TABLE route_stops DROP CONSTRAINT IF EXISTS route_stops_route_fk');await c.query('ALTER TABLE route_stops DROP CONSTRAINT IF EXISTS route_stops_stop_fk');console.log('Runtime database schema verified.')}finally{c.release()}}

async function seed(){
 if(!pool)return;
 if(String(process.env.STATIC_IMPORT_ENABLED||'').toLowerCase()!=='true'){console.log('Static GTFS DB-only mode: skipping bundled static import.');return;}
 const c=await pool.connect();
 try{
  await c.query("SELECT pg_advisory_lock(hashtext('united-delhi-static-seed'))");
  const q=(await c.query('SELECT (SELECT COUNT(*)::int FROM routes) r,(SELECT COUNT(*)::int FROM stops) s,(SELECT COUNT(*)::int FROM route_stops rs) l')).rows[0];
  const force=String(process.env.FORCE_STATIC_REBUILD||'').toLowerCase()==='true';
  if(!force&&q.r>=2000&&q.s>=5000&&q.l>=50000){console.log('Static GTFS already populated: '+q.r+' routes, '+q.s+' stops, '+q.l+' links.');return}
  const read=f=>parse(fs.readFileSync(path.join(DATA,f),'utf8'),{columns:true,skip_empty_lines:true,bom:true,relax_column_count:true,trim:true});
  const routes=read('routes.txt'),stops=read('stops.txt'),trips=read('trips.txt'),tripRoute=new Map(),routeIds=new Set(routes.map(x=>str(x.route_id)).filter(Boolean)),stopIds=new Set(stops.map(x=>str(x.stop_id)).filter(Boolean));
  for(const x of trips){const t=str(x.trip_id),r=str(x.route_id);if(t&&r)tripRoute.set(t,r)}
  const links=new Map();const rl=readline.createInterface({input:fs.createReadStream(path.join(DATA,'stop_times.txt'),{encoding:'utf8'}),crlfDelay:Infinity});let header=null,ti=-1,si=-1,qi=-1;
  for await(const line of rl){if(!header){header=line.split(',');ti=header.indexOf('trip_id');si=header.indexOf('stop_id');qi=header.indexOf('stop_sequence');continue}const p=line.split(','),r=tripRoute.get(str(p[ti])),sid=str(p[si]),seq=num(p[qi]);if(!r||!sid||seq===null||!routeIds.has(r)||!stopIds.has(sid))continue;const k=r+'\0'+sid,o=links.get(k);if(o===undefined||seq<o)links.set(k,seq)}
  await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='120000'");await c.query('TRUNCATE route_stops,routes,stops RESTART IDENTITY CASCADE');
  for(let i=0;i<routes.length;i+=300){const ch=routes.slice(i,i+300),v=[];const p=ch.map((x,j)=>{const b=j*6;v.push(str(x.route_id),str(x.agency_id),str(x.route_short_name),str(x.route_long_name),str(x.route_color),str(x.route_text_color));return '($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',$'+(b+5)+',$'+(b+6)+')'}).join(',');await c.query('INSERT INTO routes(route_id,agency_id,short_name,long_name,route_color,route_text_color) VALUES '+p+' ON CONFLICT(route_id) DO UPDATE SET agency_id=EXCLUDED.agency_id,short_name=EXCLUDED.short_name,long_name=EXCLUDED.long_name,route_color=EXCLUDED.route_color,route_text_color=EXCLUDED.route_text_color,updated_at=NOW()',v)}
  for(let i=0;i<stops.length;i+=300){const ch=stops.slice(i,i+300),v=[];const p=ch.map((x,j)=>{const b=j*4;v.push(str(x.stop_id),str(x.stop_name,200),num(x.stop_lat),num(x.stop_lon));return '($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+')'}).join(',');await c.query('INSERT INTO stops(stop_id,name,latitude,longitude) VALUES '+p+' ON CONFLICT(stop_id) DO UPDATE SET name=EXCLUDED.name,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,updated_at=NOW()',v)}
  const e=[...links.entries()];for(let i=0;i<e.length;i+=500){const ch=e.slice(i,i+500),v=[];const p=ch.map(([k,seq],j)=>{const z=k.indexOf('\0'),b=j*3;v.push(k.slice(0,z),k.slice(z+1),seq);return '($'+(b+1)+',$'+(b+2)+',$'+(b+3)+')'}).join(',');await c.query('INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES '+p+' ON CONFLICT(route_id,stop_id) DO UPDATE SET stop_sequence=LEAST(route_stops.stop_sequence,EXCLUDED.stop_sequence)',v)}
  await c.query("UPDATE static_feed_meta SET source_key='bundled-gtfs',source_url='https://otd.delhi.gov.in/',imported_at=NOW(),imported_route_count=(SELECT COUNT(*) FROM routes),imported_stop_count=(SELECT COUNT(*) FROM stops),imported_route_stop_count=(SELECT COUNT(*) FROM route_stops) WHERE id=TRUE");
  await c.query('COMMIT');console.log('Static GTFS seed complete: '+routes.length+' routes, '+stops.length+' stops, '+links.size+' links.')
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{await c.query("SELECT pg_advisory_unlock(hashtext('united-delhi-static-seed'))").catch(()=>{});c.release()}
}

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
 if(!pool||!vs.length)return vs.map(v=>({...v,routeColor:v.routeColor||fallbackColor(),...service(v.id,null,v.routeShortName,v.routeId)}));
 const ids=[...new Set(vs.map(v=>v.routeId).filter(Boolean))];if(!ids.length)return vs.map(v=>({...v,routeColor:fallbackColor(),...service(v.id,null,v.routeShortName,v.routeId)}));
 try{const rows=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_color,route_text_color FROM routes WHERE route_id=ANY($1::text[])',[ids])).rows;const map=new Map(rows.map(x=>[String(x.route_id),x]));return vs.map(v=>{const x=map.get(String(v.routeId||'')),svc=service(v.id,x?.agency_id,x?.short_name,v.routeId);return {...v,routeShortName:x?.short_name||v.routeId||null,routeColor:x?.route_color||svc.serviceColor||fallbackColor(),routeTextColor:x?.route_text_color||null,operator:x?.agency_id||null,...svc}})}catch{return vs.map(v=>({...v,routeShortName:v.routeId||null,routeColor:fallbackColor(),routeTextColor:null,routeLongName:null,operator:null,...service(v.id,null,v.routeShortName,v.routeId)}))}
}
async function persist(vs){if(!pool||!vs.length)return;const c=await pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='10000'");for(let i=0;i<Math.min(vs.length,5000);i+=250){const chunk=vs.slice(i,i+250),values=[];const p=chunk.map((v,j)=>{const b=j*8;values.push(v.id,v.routeId,v.tripId,v.stopId,v.latitude,v.longitude,v.bearing,v.observedAt);return '($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',$'+(b+5)+',$'+(b+6)+',$'+(b+7)+',$'+(b+8)+',NOW())'}).join(',');await c.query('INSERT INTO vehicle_positions(vehicle_id,route_id,trip_id,stop_id,latitude,longitude,bearing,observed_at,updated_at) VALUES '+p+' ON CONFLICT(vehicle_id) DO UPDATE SET route_id=EXCLUDED.route_id,trip_id=EXCLUDED.trip_id,stop_id=EXCLUDED.stop_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,bearing=EXCLUDED.bearing,observed_at=EXCLUDED.observed_at,updated_at=NOW()',values)}await c.query("DELETE FROM vehicle_positions WHERE observed_at < NOW() - INTERVAL '24 hours'");await c.query('COMMIT')}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('Vehicle persistence failed:',e.message)}finally{c.release()}}

async function refresh(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  try{
   const raw=await fetchLive();
   if(!raw.length)throw new Error('DTC realtime feed returned no valid vehicles');
   cache.vehicles=raw.map(applyRouteMeta);
   cache.status='OK';cache.reason=null;cache.fetchedAt=new Date().toISOString();
   savePersistentCache();
   cache.source='dtc-live';cache.persistedAt=new Date().toISOString();
   void persist(cache.vehicles);
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
app.get('/api/realtime/vehicles',(_q,r)=>{
 const stale=!cache.fetchedAt||Date.now()-Date.parse(cache.fetchedAt)>90000;
 if(stale&&KEY)void refresh();
 const hasData=cache.vehicles.length>0;
 r.json({status:hasData?'OK':cache.status,count:cache.vehicles.length,vehicles:cache.vehicles,fetchedAt:cache.fetchedAt,stale:stale||cache.status==='STALE',source:cache.source,cacheAgeSeconds:cache.fetchedAt?Math.max(0,Math.round((Date.now()-Date.parse(cache.fetchedAt))/1000)):null,reason:cache.reason});
});

app.get('/api/routes/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});try{const id=str(q.params.id),route=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_color,route_text_color FROM routes WHERE route_id=$1',[id])).rows[0];if(!route)return r.status(404).json({status:'NOT_FOUND',reason:'Route not found'});const stops=(await pool.query('SELECT s.stop_id,s.name,s.latitude,s.longitude,rs.stop_sequence FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=$1 ORDER BY rs.stop_sequence,s.stop_id',[id])).rows;r.json({status:'OK',route,stops,vehicles:cache.vehicles.filter(v=>String(v.routeId||'')===id)})}catch{r.status(500).json({status:'ERROR',reason:'Failed to load route'})}});
app.get('/api/stops/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});try{const id=str(q.params.id),stop=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[id])).rows[0];if(!stop)return r.status(404).json({status:'NOT_FOUND',reason:'Stop not found'});const routes=(await pool.query('SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,MIN(rs.stop_sequence) AS stop_sequence FROM route_stops rs JOIN routes r ON r.route_id=rs.route_id WHERE rs.stop_id=$1 GROUP BY r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color ORDER BY MIN(rs.stop_sequence),r.short_name,r.route_id LIMIT 100',[id])).rows;r.json({status:'OK',stop,routes})}catch{r.status(500).json({status:'ERROR',reason:'Failed to load stop'})}});
app.get('/api/stops/:id/arrivals',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',arrivals:[],reason:'Database is not configured'});try{const st=(await pool.query('SELECT latitude,longitude FROM stops WHERE stop_id=$1',[str(q.params.id)])).rows[0];if(!st)return r.status(404).json({status:'NOT_FOUND',arrivals:[],reason:'Stop not found'});const a=cache.vehicles.map(v=>({...v,distanceMeters:Math.round(dist(Number(st.latitude),Number(st.longitude),v.latitude,v.longitude))})).filter(v=>v.distanceMeters<=2500).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,20).map(v=>({vehicleId:v.id,routeId:v.routeId,routeName:v.routeShortName||v.routeId||'Bus',routeColor:v.routeColor,routeTextColor:v.routeTextColor,serviceColor:v.serviceColor,distanceMeters:v.distanceMeters,observedAt:v.observedAt}));r.json({status:a.length?'OK':'UNAVAILABLE',arrivals:a,reason:a.length?null:'No nearby live buses are available right now.'})}catch{r.status(500).json({status:'ERROR',arrivals:[],reason:'Failed to load arrivals'})}});
app.post('/api/stops/nearby',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',stops:[],reason:'Database is not configured'});const lat=coord(q.body?.lat,-90,90),lon=coord(q.body?.lon,-180,180),limit=Math.min(50,Math.max(1,Number(q.body?.limit)||30));if(lat===null||lon===null)return r.status(400).json({status:'ERROR',stops:[],reason:'Valid latitude and longitude are required'});try{const rows=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4 LIMIT 1000',[lat-.15,lat+.15,lon-.15,lon+.15])).rows,stops=rows.map(x=>({...x,distanceMeters:Math.round(dist(lat,lon,Number(x.latitude),Number(x.longitude)))})).filter(x=>x.distanceMeters<=15000).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,limit);r.json({status:'OK',stops})}catch{r.status(500).json({status:'ERROR',stops:[],reason:'Nearby stops are temporarily unavailable'})}});
app.get('/api/search',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',results:[],reason:'Database is not configured'});const x=String(q.query.q||'').trim().replace(/[%_]/g,'');if(x.length<2)return r.json({status:'OK',results:[]});try{const a=(await pool.query("SELECT r.route_id AS id,r.short_name AS label,r.long_name,r.route_color AS \"routeColor\",r.route_text_color AS \"routeTextColor\",first_stop.name AS \"fromStop\",last_stop.name AS \"toStop\",'route' AS type FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.stop_id ASC LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true WHERE r.short_name ILIKE $1 OR r.long_name ILIKE $1 ORDER BY r.short_name,r.route_id LIMIT 30",['%'+x+'%'])).rows;const b=(await pool.query("SELECT stop_id AS id,name AS label,latitude,longitude,('Stop ID '+stop_id+' · '+ROUND(latitude::numeric,5)||', '+ROUND(longitude::numeric,5)) AS \"stopContext\",NULL::text AS \"fromStop\",NULL::text AS \"toStop\",NULL::text AS \"routeColor\",NULL::text AS \"routeTextColor\",'stop' AS type FROM stops WHERE name ILIKE $1 ORDER BY label,latitude,longitude LIMIT 30",['%'+x+'%'])).rows;r.json({status:'OK',results:[...a,...b].slice(0,60)})}catch{r.status(500).json({status:'ERROR',results:[],reason:'Search is temporarily unavailable'})}});
app.get('/api/plan',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',options:[],reason:'Database is not configured'});let fromId=str(q.query.fromStopId),toId=str(q.query.toStopId);try{if(!fromId){const name=str(q.query.from);if(name)fromId=(await pool.query('SELECT stop_id FROM stops WHERE name=$1 ORDER BY stop_id LIMIT 1',[name])).rows[0]?.stop_id||null}if(!toId){const name=str(q.query.to);if(name)toId=(await pool.query('SELECT stop_id FROM stops WHERE name=$1 ORDER BY stop_id LIMIT 1',[name])).rows[0]?.stop_id||null}if(!fromId||!toId||fromId===toId)return r.status(400).json({status:'ERROR',options:[],reason:'Please select two different bus stops from the suggestions.'});const rows=(await pool.query("SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,o.stop_id from_stop_id,o.name from_stop,d.stop_id to_stop_id,d.name to_stop,o.stop_sequence from_sequence,d.stop_sequence to_sequence FROM route_stops o JOIN route_stops d ON d.route_id=o.route_id AND d.stop_sequence>o.stop_sequence JOIN routes r ON r.route_id=o.route_id WHERE o.stop_id=$1 AND d.stop_id=$2 ORDER BY (d.stop_sequence-o.stop_sequence),r.route_id LIMIT 10",[fromId,toId])).rows;const options=rows.map(x=>({type:'direct',durationMinutes:Math.max(3,Math.ceil((Number(x.to_sequence)-Number(x.from_sequence))*2.5)),durationIsEstimate:true,walkingMinutes:null,walkingIsEstimated:true,legs:[{routeId:String(x.route_id),routeName:x.short_name||x.long_name||'Bus',routeColor:x.route_color,routeTextColor:x.route_text_color,fromStop:x.from_stop,toStop:x.to_stop,fromStopId:x.from_stop_id,toStopId:x.to_stop_id}]}));const origin=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[fromId])).rows[0]||null;const destination=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[toId])).rows[0]||null;return r.json({status:'OK',origin,destination,options:options.slice(0,5),reason:options.length?null:'No direct bus journey was found'})}catch(e){console.error('Journey planner failed:',e?.message||e);return r.status(500).json({status:'ERROR',options:[],reason:'Journey planner is temporarily unavailable. Please try again.'})}});
app.use((_q,r)=>r.status(404).json({status:'NOT_FOUND',reason:'Endpoint not found'}));
app.use((e,_q,r,_n)=>{console.error('Unhandled request error:',e?.message||e);if(!r.headersSent)r.status(500).json({status:'ERROR',reason:'Internal server error'})});
const server=app.listen(PORT,'0.0.0.0',()=>{console.log('United Delhi API listening on 0.0.0.0:'+PORT);setTimeout(async()=>{try{if(pool){await ensureRuntimeSchema();await seed();await loadRouteMeta();await loadDatabaseVehicleCache()}}catch(e){console.error('Database bootstrap failed:',e?.message||e)}if(KEY){void refresh();poll=setInterval(()=>void refresh(),15000)}},1500)});
server.requestTimeout=30000;server.headersTimeout=40000;server.keepAliveTimeout=65000;
process.on('unhandledRejection',e=>console.error('Unhandled rejection:',e));process.on('uncaughtException',e=>console.error('Uncaught exception:',e));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,async()=>{if(poll)clearInterval(poll);server.close();await pool?.end().catch(()=>{});process.exit(0)});
