import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { rateLimit } from 'express-rate-limit';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { SERVER_ROOT, STATIC_IMPORTER_PATH, resolveServerPath } from './runtime-paths.js';
import { sha256Hex, sourceHasSha256 } from './gtfs-feed-utils.js';
import {syncMetroStatic} from './metro-sync.js';
import {createRealtimeRequest} from './realtime-provider.js';
import {validHexColor,apiVehicleColorOnly,resolveEvidenceBackedColor,classifyFleetTypeFromRegistration,summarizeRouteLivery,extractColorsByVehicle,parseColorFieldSpec} from './vehicle-color.js';
const COLOR_FIELD=parseColorFieldSpec(process.env.TRANSPORT_STACK_COLOR_FIELD);

const {Pool}=pg,app=express();
const PORT=Number(process.env.PORT)||10000;
const DB=String(process.env.DATABASE_URL||'').trim();
const TRANSPORT_STACK_KEY=String(process.env.TRANSPORT_STACK_API_KEY||'').trim();
const TRANSPORT_STACK_FEED=String(process.env.TRANSPORT_STACK_REALTIME_URL||'https://dts-backend.transportstack.in/api/dataset/otd/get-file?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb').trim();
const HAS_REALTIME_KEY=Boolean(TRANSPORT_STACK_KEY);
const REALTIME_PERSIST_INTERVAL_MS=Math.max(15000,Number(process.env.REALTIME_PERSIST_INTERVAL_MS)||60000);
let DB_CONNECTION=DB;try{if(DB){const u=new URL(DB);u.searchParams.delete('sslmode');DB_CONNECTION=u.toString()}}catch{} const pool=DB?new Pool({connectionString:DB_CONNECTION,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,ssl:/localhost|127(?:\.\d+){3}|::1/i.test(DB)?false:{rejectUnauthorized:true}}):null;

const str=(v,max=160)=>{const x=String(v??'').trim();return x&&x.length<=max?x:null};
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const coord=(v,a,b)=>{const x=num(v);return x!==null&&x>=a&&x<=b?x:null};
const dist=(a,b,c,d)=>{const R=6371000,r=Math.PI/180,la=(c-a)*r,lo=(d-b)*r,x=Math.sin(la/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(lo/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const UNKNOWN_BUS_MARKER_COLOR='#64748B';
const classifyFleet=(id,...aliases)=>classifyFleetTypeFromRegistration(id,...aliases);
const service=(id,agency,routeShortName,routeId,licensePlate,vehicleLabel)=>classifyFleet(id,licensePlate,vehicleLabel);
const cache={vehicles:[],status:HAS_REALTIME_KEY?'STARTING':'UNAVAILABLE',reason:HAS_REALTIME_KEY?'United Delhi API is starting':'TRANSPORT_STACK_API_KEY is not configured',fetchedAt:null,source:'memory',persistedAt:null};
let refreshing=null,poll=null,routeMetaLoadedAt=0,persistPromise=null,lastPersistAt=0,dtcAutoImportRunning=false;
const routeMeta=new Map();
const fleetRegistry=new Map();
const verifiedLiveryByKey=new Map();
let fleetRegistryLoadedAt=0;
const vehicleIdentityKeys=v=>[v?.id,v?.vehicleId,v?.licensePlate,v?.vehicleLabel].map(normalizeVehicleKey).filter(Boolean);
async function loadVerifiedLiveries(force=false){
 if(!pool)return;
 try{
  const rows=(await pool.query("SELECT vehicle_id,license_plate,color_hex,color_name,evidence_url,source_label,verified_at FROM vehicle_livery_verifications WHERE status='verified' AND verified_at IS NOT NULL")).rows;
  verifiedLiveryByKey.clear();
  for(const row of rows){
   const record={vehicleId:String(row.vehicle_id||''),licensePlate:String(row.license_plate||''),colorHex:validHexColor(row.color_hex),colorName:String(row.color_name||''),evidenceUrl:String(row.evidence_url||''),sourceLabel:String(row.source_label||'').trim(),verifiedAt:row.verified_at?new Date(row.verified_at).toISOString():null};
   if(!record.colorHex)continue;
   for(const key of [record.vehicleId,record.licensePlate].map(normalizeVehicleKey).filter(Boolean))verifiedLiveryByKey.set(key,record);
  }
  console.log('Loaded verified physical livery records: '+verifiedLiveryByKey.size+' identity keys.');
 }catch(error){console.error('Verified livery registry load failed:',error?.message||error)}
}
const normalizeVehicleKey=value=>String(value??'').trim().toUpperCase().replace(/[-_\s]/g,'');
const fleetRegistryKey=v=>normalizeVehicleKey(v?.id||v?.vehicleId||v?.licensePlate||v?.vehicleLabel);
function rememberFleetRow(row){
 const key=normalizeVehicleKey(row.vehicle_id);
 if(!key)return;
 fleetRegistry.set(key,{vehicleId:String(row.vehicle_id),busType:String(row.bus_type||'Unknown'),serviceType:String(row.service_type||'unknown'),colorHex:String(row.color_hex||UNKNOWN_BUS_MARKER_COLOR),source:String(row.source||'auto'),updatedAt:row.updated_at||null});
}
async function loadFleetRegistry(force=false){
 if(!pool)return;
 if(!force&&Date.now()-fleetRegistryLoadedAt<60000)return;
 try{
  const rows=(await pool.query('SELECT vehicle_id,bus_type,service_type,color_hex,source,updated_at FROM vehicle_fleet_registry')).rows;
  fleetRegistry.clear();
  for(const row of rows)rememberFleetRow(row);
  fleetRegistryLoadedAt=Date.now();
  console.log('Loaded exact fleet color registry: '+fleetRegistry.size+' vehicles.');
 }catch(error){console.error('Fleet color registry load failed:',error?.message||error);}
}
async function registerFleetVehicles(vehicles){
 if(!pool||!vehicles.length)return;
 const seen=new Set(),missing=[];
 for(const vehicle of vehicles){
  const vehicleId=String(vehicle.id||vehicle.vehicleLabel||vehicle.licensePlate||'').trim();
  const key=normalizeVehicleKey(vehicleId);
  if(!vehicleId||!key||seen.has(key)||fleetRegistry.has(key))continue;
  seen.add(key);
  const initial=classifyFleet(vehicleId,vehicle.licensePlate,vehicle.vehicleLabel);
  missing.push({vehicleId,busType:initial.busType,serviceType:initial.serviceType,colorHex:UNKNOWN_BUS_MARKER_COLOR});
 }
 for(let i=0;i<missing.length;i+=250){
  const chunk=missing.slice(i,i+250),values=[];
  const placeholders=chunk.map((row,j)=>{
   const b=j*5;values.push(row.vehicleId,row.busType,row.serviceType,row.colorHex,'auto');
   return '($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',$'+(b+5)+',NOW())';
  }).join(',');
  const inserted=(await pool.query('INSERT INTO vehicle_fleet_registry(vehicle_id,bus_type,service_type,color_hex,source,updated_at) VALUES '+placeholders+' ON CONFLICT(vehicle_id) DO NOTHING RETURNING vehicle_id,bus_type,service_type,color_hex,source,updated_at',values)).rows;
  for(const row of inserted)rememberFleetRow(row);
 }
}
const applyFleetRegistry=v=>{
 const row=fleetRegistry.get(fleetRegistryKey(v));
 const priorSource=String(v?.fleetColorSource||'');
 const upstreamColor=(!priorSource||priorSource==='upstream-api')?apiVehicleColorOnly(v?.serviceColor):null;
 const verified=vehicleIdentityKeys(v).map(key=>verifiedLiveryByKey.get(key)).find(Boolean)||null;
 const vehicle={...v,...(row?{busType:row.busType,serviceType:row.serviceType}:{})};
 const serviceColor=resolveEvidenceBackedColor(upstreamColor,verified?.colorHex);
 const fleetColorSource=upstreamColor?'upstream-api':verified?'verified-livery-record':'not-provided-by-realtime-feed';
 return {...vehicle,serviceColor,fleetColorSource,
  ...(verified?{liveryVerification:{status:'verified',colorName:verified.colorName||null,source:verified.sourceLabel||null,evidenceUrl:verified.evidenceUrl||null,verifiedAt:verified.verifiedAt}}:{})};
};

async function loadRouteMeta(){if(!pool)return;try{const rows=(await pool.query(`SELECT r.route_id,r.agency_id,r.short_name,r.long_name,r.route_color,r.route_text_color,first_stop.name AS from_stop,last_stop.name AS to_stop FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.stop_id ASC LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true`)).rows;routeMeta.clear();for(const x of rows)routeMeta.set(String(x.route_id),x);routeMetaLoadedAt=Date.now();console.log('Loaded route metadata: '+routeMeta.size+' routes.')}catch(e){console.error('Route metadata load failed:',e?.message||e)}}
const applyRouteMeta=v=>{const x=routeMeta.get(String(v.routeId||''));const svc=service(v.id,x?.agency_id,x?.short_name,v.routeId,v.licensePlate,v.vehicleLabel);return applyFleetRegistry({...v,routeShortName:x?.short_name||v.routeShortName||v.routeId||null,routeColor:x?.route_color||null,routeTextColor:x?.route_text_color||null,routeLongName:x?.long_name||null,fromStop:x?.from_stop||null,toStop:x?.to_stop||null,operator:x?.agency_id||null,...svc})};
const busLiveryForRoute=routeId=>{
 const id=String(routeId||'').trim();
 if(!id)return {};
 const active=cache.vehicles.filter(v=>String(v.routeId||'')===id);
 return summarizeRouteLivery(active)||{};
};
const decoratePlannerOptions=options=>(Array.isArray(options)?options:[]).map(option=>({...option,legs:(Array.isArray(option.legs)?option.legs:[]).map(leg=>!leg.mode||leg.mode==='bus'?{...leg,...busLiveryForRoute(leg.routeId)}:leg)}));
const DTC_STATIC_SOURCE_KEY=String(process.env.DTC_STATIC_SOURCE_KEY||'uploaded-dtc-static-local-v1-20261013').trim();
const DTC_STATIC_FILE_INPUT=String(process.env.DTC_STATIC_FILE||'').trim();
const DTC_STATIC_FILE=DTC_STATIC_FILE_INPUT?resolveServerPath(DTC_STATIC_FILE_INPUT):'';
const DTC_STATIC_BUNDLE_URL=String(process.env.DTC_STATIC_URL||'').trim();
function scheduleDtcStaticRetry(){
 const retry=setTimeout(autoImportDtcStaticIfEmpty,5*60*1000);
 retry.unref?.();
}
function autoImportDtcStaticIfEmpty(){
 if(!pool||String(process.env.DTC_STATIC_AUTO_IMPORT??'true').toLowerCase()==='false'||dtcAutoImportRunning)return;
 void (async()=>{
  try{
   const [countResult,metaResult]=await Promise.all([
    pool.query(`SELECT
      (SELECT COUNT(*)::int FROM routes) AS routes,
      (SELECT COUNT(*)::int FROM stops) AS stops,
      (SELECT COUNT(*)::int FROM route_stops) AS route_stops`),
    pool.query('SELECT source_key,source_url,imported_route_count,imported_stop_count,imported_route_stop_count FROM static_feed_meta WHERE id=1').catch(()=>({rows:[]}))
   ]);
   const counts=countResult.rows[0]||{};
   const routeCount=Number(counts.routes)||0,stopCount=Number(counts.stops)||0,linkCount=Number(counts.route_stops)||0;
   const meta=metaResult.rows[0]||{};
   const populated=routeCount>0||stopCount>0||linkCount>0;
   if(populated){
    let digest=null;
    if(DTC_STATIC_FILE){
     try{
      const stat=await fs.stat(DTC_STATIC_FILE);
      if(stat.isFile()&&stat.size>0)digest=sha256Hex(await fs.readFile(DTC_STATIC_FILE));
     }catch(error){console.warn('Cannot fingerprint local DTC GTFS archive:',error?.message||error)}
    }
    const metadataMatches=meta.source_key===DTC_STATIC_SOURCE_KEY
      &&Number(meta.imported_route_count)===routeCount
      &&Number(meta.imported_stop_count)===stopCount
      &&Number(meta.imported_route_stop_count)===linkCount;
    if(digest&&sourceHasSha256(meta.source_url,digest)&&metadataMatches)return;
    console.warn('Automatic DTC replacement suppressed: the populated database has no matching archive SHA-256 fingerprint, or its counts differ. Existing transit data is preserved. Review the feed and backups, then use the explicit import command with DTC_STATIC_ALLOW_REPLACEMENT=true if replacement is approved.');
    return;
   }
   // Automatic import is permitted only for a genuinely empty static network.
   let sourceAvailable=false;
   const sourceDescription=DTC_STATIC_FILE||DTC_STATIC_BUNDLE_URL||'(not configured)';
   if(DTC_STATIC_FILE){
    try{
     const fileStat=await fs.stat(DTC_STATIC_FILE);
     sourceAvailable=fileStat.isFile()&&fileStat.size>0;
    }catch(error){console.warn('Local DTC GTFS archive is unavailable:',error?.message||error)}
   }else if(DTC_STATIC_BUNDLE_URL){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
     const response=await fetch(DTC_STATIC_BUNDLE_URL,{method:'HEAD',signal:controller.signal});
     sourceAvailable=response.ok;
     if(!response.ok)console.warn('DTC GTFS URL returned HTTP '+response.status+'.');
    }catch(error){console.warn('DTC GTFS source check failed:',error?.message||error)}
    finally{clearTimeout(timer)}
   }
   if(!sourceAvailable){
    console.warn('DTC GTFS source is unavailable ('+sourceDescription+'); empty database left unchanged; retrying in five minutes.');
    scheduleDtcStaticRetry();
    return;
   }
   if(dtcAutoImportRunning)return;
   dtcAutoImportRunning=true;
   console.log('DTC GTFS source is available; initializing the empty static database from '+sourceDescription+'.');
   const importEnv={...process.env,DTC_STATIC_SOURCE_KEY};
   delete importEnv.DTC_STATIC_ALLOW_REPLACEMENT;
   if(DTC_STATIC_FILE){
    importEnv.DTC_STATIC_FILE=DTC_STATIC_FILE;
    delete importEnv.DTC_STATIC_URL;
   }else{
    importEnv.DTC_STATIC_URL=DTC_STATIC_BUNDLE_URL;
   }
   const child=spawn(process.execPath,[STATIC_IMPORTER_PATH],{cwd:SERVER_ROOT,env:importEnv,stdio:['ignore','pipe','pipe']});
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
      console.log('Supplied DTC static feed initialized; route metadata and cached vehicles refreshed.');
     })().catch(error=>console.error('Post-import metadata refresh failed:',error?.message||error));
    }else{
     console.error('Automatic DTC initial import exited with code '+code+'. Existing database was empty at launch.');
    }
   });
  }catch(error){
   dtcAutoImportRunning=false;
   console.error('DTC static source check failed:',error?.message||error);
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
  // Seed the exact per-vehicle registry from both live and recent cached IDs,
  // without overwriting any manually corrected registry row.
  try{await registerFleetVehicles(hydrated)}catch(error){console.error('Cached fleet registry seed failed:',error?.message||error)}
  cache.vehicles=hydrated.map(applyRouteMeta);
  const timestamps=hydrated.map(v=>Date.parse(v.observedAt)).filter(Number.isFinite);
  const newest=timestamps.length?Math.max(...timestamps):NaN;
  cache.fetchedAt=Number.isFinite(newest)?new Date(newest).toISOString():null;
  cache.status='STALE';
  cache.source='database-cache';
  cache.reason='Showing the last known cached bus positions while live data reconnects.';
  cache.persistedAt=new Date().toISOString();
  console.log('Loaded database realtime cache: '+cache.vehicles.length+' vehicles.');
 }catch(e){console.error('Database realtime cache load failed:',e?.message||e)}
}

app.disable('x-powered-by');app.set('trust proxy',1);
const DEFAULT_ORIGINS=['https://united-delhi.vercel.app'];
const ALLOWED_ORIGINS=String(process.env.APP_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean).length?String(process.env.APP_ORIGINS).split(',').map(x=>x.trim()).filter(Boolean):DEFAULT_ORIGINS;
app.use(cors({origin:(o,cb)=>{if(!o||ALLOWED_ORIGINS.includes(o))return cb(null,true);cb(new Error('Origin not allowed'))},methods:['GET','POST'],optionsSuccessStatus:204}));
app.use(express.json({limit:'32kb'}));
app.use((_q,r,n)=>{r.setHeader('X-Content-Type-Options','nosniff');r.setHeader('Referrer-Policy','no-referrer');r.setHeader('X-Frame-Options','DENY');r.setHeader('Permissions-Policy','geolocation=(self)');if(_q.secure||String(_q.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https')r.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');n()});
app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}));

async function ensureRuntimeSchema(){if(!pool)return;const c=await pool.connect();try{
 await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS trip_id TEXT');
 await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS route_id TEXT');
 await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS stop_id TEXT');
 await c.query('ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS bearing DOUBLE PRECISION');
 await c.query(`CREATE TABLE IF NOT EXISTS vehicle_fleet_registry (
  vehicle_id TEXT PRIMARY KEY,
  bus_type TEXT NOT NULL DEFAULT 'Unknown',
  service_type TEXT NOT NULL DEFAULT 'unknown' CHECK(service_type IN ('dtc','electric','unknown')),
  color_hex TEXT NOT NULL DEFAULT '#64748B' CHECK(color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  source TEXT NOT NULL DEFAULT 'auto' CHECK(source IN ('auto','manual')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await c.query('CREATE INDEX IF NOT EXISTS idx_vehicle_fleet_registry_color ON vehicle_fleet_registry(color_hex)');
 await c.query('CREATE INDEX IF NOT EXISTS idx_vehicle_fleet_registry_type ON vehicle_fleet_registry(bus_type)');
 // Separate evidence-backed physical livery from the live feed and service/category colours.
 await c.query(`CREATE TABLE IF NOT EXISTS vehicle_livery_verifications (
  vehicle_id TEXT NOT NULL DEFAULT '',
  license_plate TEXT NOT NULL DEFAULT '',
  color_hex TEXT NOT NULL CHECK(color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  color_name TEXT NOT NULL DEFAULT '',
  evidence_url TEXT NOT NULL,
  source_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(trim(vehicle_id)) > 0 OR length(trim(license_plate)) > 0),
  CHECK (status <> 'verified' OR verified_at IS NOT NULL)
 )`);
 await c.query("CREATE INDEX IF NOT EXISTS idx_vehicle_livery_verified_id ON vehicle_livery_verifications(vehicle_id) WHERE status='verified'");
 await c.query("CREATE INDEX IF NOT EXISTS idx_vehicle_livery_verified_plate ON vehicle_livery_verifications(license_plate) WHERE status='verified'");
 // Never derive or rewrite a physical livery colour from registration prefixes.
 console.log('Runtime database schema verified.');
}finally{c.release()}}


/* Static GTFS is stored in PostgreSQL; VPS imports use local archives when configured. */
function parseVehicle(e,feedTs,colors){
 const v=e?.vehicle,p=v?.position;if(!p)return null;
 const lat=coord(p.latitude,-90,90),lon=coord(p.longitude,-180,180),id=str(v?.vehicle?.id||v?.id||e?.id);if(lat===null||lon===null||!id)return null;
 const ts=num(v?.timestamp||feedTs);if(!ts)return null;
 const ageMs=Date.now()-(ts*1000);if(ageMs>90000||ageMs<-60000)return null;
 const serviceColor=validHexColor(colors?.get(id)??colors?.get(String(e?.id||'')));
 return{id,routeId:str(v?.trip?.routeId),tripId:str(v?.trip?.tripId),stopId:str(v?.stopId),vehicleLabel:str(v?.vehicle?.label),licensePlate:str(v?.vehicle?.licensePlate),serviceColor,latitude:lat,longitude:lon,bearing:num(p.bearing),observedAt:new Date(ts*1000).toISOString()};
}
async function fetchLive(){
 const request=createRealtimeRequest({
  transportStackApiKey:TRANSPORT_STACK_KEY,transportStackUrl:TRANSPORT_STACK_FEED
 });
 // The provider helper enforces HTTPS, restricts the host, and rejects redirects.
 const ac=new AbortController(),t=setTimeout(()=>ac.abort(),12000);
 try{
  const r=await fetch(request.url,{signal:ac.signal,headers:request.headers,redirect:request.redirect});
  if(!r.ok)throw new Error(request.provider+' realtime HTTP '+r.status);
  const b=new Uint8Array(await r.arrayBuffer());
  if(b.length>10*1024*1024)throw new Error('Realtime feed exceeds safety limit');
  const f=GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(b),m=new Map(),colors=extractColorsByVehicle(b,COLOR_FIELD);
  for(const e of f.entity||[]){const v=parseVehicle(e,Number(f.header?.timestamp||0),colors);if(v)m.set(v.id,v)}
  return{vehicles:[...m.values()],source:request.source,provider:request.provider};
 }catch(e){
  if(e?.name==='AbortError')throw new Error(request.provider+' realtime request timed out');
  throw e;
 }finally{clearTimeout(t)}
}
async function enrich(vs){
 if(!pool||!vs.length)return vs.map(v=>{const svc=service(v.id,null,v.routeShortName,v.routeId,v.licensePlate,v.vehicleLabel);return applyFleetRegistry({...v,routeColor:null,routeLongName:null,...svc})});
 const ids=[...new Set(vs.map(v=>v.routeId).filter(Boolean))];if(!ids.length)return vs.map(v=>{const svc=service(v.id,null,v.routeShortName,v.routeId);return applyFleetRegistry({...v,routeColor:null,routeLongName:null,...svc})});
 try{const rows=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_color,route_text_color FROM routes WHERE route_id=ANY($1::text[])',[ids])).rows;const map=new Map(rows.map(x=>[String(x.route_id),x]));return vs.map(v=>{const x=map.get(String(v.routeId||'')),svc=service(v.id,x?.agency_id,x?.short_name,v.routeId);return applyFleetRegistry({...v,routeShortName:x?.short_name||v.routeId||null,routeColor:x?.route_color||null,routeTextColor:x?.route_text_color||null,routeLongName:x?.long_name||null,operator:x?.agency_id||null,...svc})})}catch{return vs.map(v=>{const svc=service(v.id,null,v.routeShortName,v.routeId);return applyFleetRegistry({...v,routeShortName:v.routeId||null,routeColor:null,routeTextColor:null,routeLongName:null,operator:null,...svc})})}
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
   if(pool)await loadFleetRegistry();
   const result=await fetchLive(),raw=result.vehicles;
   if(!raw.length)throw new Error(result.provider+' realtime feed returned no valid vehicles');
   if(pool)try{await registerFleetVehicles(raw)}catch(error){console.error('Fleet registry seed failed:',error?.message||error)}
   cache.vehicles=raw.map(applyRouteMeta);
   cache.status='OK';cache.reason=null;cache.fetchedAt=new Date().toISOString();
   cache.source=result.source;
   queuePersist(cache.vehicles);
   const exactUpstreamColors=raw.reduce((count,vehicle)=>count+(validHexColor(vehicle.serviceColor)?1:0),0);
   console.log(result.provider+' realtime feed decoded: '+raw.length+' vehicles; '+exactUpstreamColors+' exact per-vehicle colours supplied; local database/client caches refreshed.');
  }catch(e){
   cache.status=cache.fetchedAt?'STALE':'UNAVAILABLE';
   const message=e instanceof Error?e.message:String(e||'Realtime request failed');
   cache.reason=cache.vehicles.length?'Live Transport Stack data is temporarily unavailable; showing the last known bus positions.':message;
   console.error('Realtime poll failed:',message);
  }
 })().finally(()=>{refreshing=null});
 return refreshing;
}

app.get('/',(_q,r)=>r.json({status:'OK',service:'united-delhi',message:'API is running. Use /health or /api/status.'}));
app.get('/health',(_q,r)=>r.json({status:'OK',service:'united-delhi',realtime:cache.status,time:new Date().toISOString(),cachedVehicles:cache.vehicles.length}));
app.get('/healthz',(_q,r)=>r.json({status:'OK'}));
app.get('/ready',(_q,r)=>r.json({status:'OK',database:Boolean(pool),realtime:cache.status,cachedVehicles:cache.vehicles.length}));
const publicRealtimeReason=(hasData,stale)=>{
 if(hasData)return stale?'Showing the last known bus positions while live data reconnects.':null;
 if(!HAS_REALTIME_KEY)return 'Live bus tracking is temporarily unavailable. Please try again shortly.';
 return 'The live bus service is waking up or reconnecting. It can take up to a minute after inactivity; retrying automatically.';
};
app.get('/api/status',async(_q,r)=>{
 let database='NOT_CONFIGURED';
 if(pool){try{await pool.query('SELECT 1');database='OK'}catch{database='ERROR'}}
 const ageMs=cache.fetchedAt?Date.now()-Date.parse(cache.fetchedAt):Infinity;
 const stale=!Number.isFinite(ageMs)||ageMs>90000||cache.status!=='OK';
 r.json({status:'OK',database,realtime:cache.status,realtimeVehicles:cache.vehicles.length,fetchedAt:cache.fetchedAt,source:cache.source,persistedAt:cache.persistedAt,reason:publicRealtimeReason(cache.vehicles.length>0,stale)});
});
app.get('/api/vehicle-colors',async(q,r)=>{
 if(!pool)return r.status(503).json({status:'UNAVAILABLE',count:0,vehicles:[],reason:'Database is not configured'});
 try{
  const limit=Math.min(500,Math.max(1,Number(q.query.limit)||200));
  const rows=(await pool.query("SELECT vehicle_id,license_plate,color_hex,color_name,evidence_url,source_label,verified_at FROM vehicle_livery_verifications WHERE status='verified' AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT $1",[limit])).rows;
  r.setHeader('Cache-Control','public, max-age=60');
  r.json({status:'OK',count:rows.length,vehicles:rows.map(x=>({vehicleId:x.vehicle_id||null,licensePlate:x.license_plate||null,colorHex:x.color_hex,colorName:x.color_name||null,evidenceUrl:x.evidence_url,source:x.source_label,verifiedAt:new Date(x.verified_at).toISOString()}))});
 }catch(error){console.error('Verified vehicle colour query failed:',error?.message||error);r.status(500).json({status:'ERROR',count:0,vehicles:[],reason:'Verified vehicle colours are temporarily unavailable'})}
});
app.get('/api/vehicle-colors/:id',async(q,r)=>{
 const key=normalizeVehicleKey(q.params.id);
 if(!key)return r.status(400).json({status:'ERROR',reason:'A vehicle ID or registration is required'});
 if(!pool)return r.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});
 try{
  const row=(await pool.query("SELECT vehicle_id,license_plate,color_hex,color_name,evidence_url,source_label,verified_at FROM vehicle_livery_verifications WHERE status='verified' AND verified_at IS NOT NULL AND (upper(regexp_replace(vehicle_id,'[-_[:space:]]','','g'))=$1 OR upper(regexp_replace(license_plate,'[-_[:space:]]','','g'))=$1) ORDER BY verified_at DESC LIMIT 1",[key])).rows[0];
  if(!row)return r.status(404).json({status:'UNKNOWN',reason:'No evidence-backed physical livery colour is verified for this vehicle yet.'});
  r.json({status:'OK',vehicleId:row.vehicle_id||null,licensePlate:row.license_plate||null,colorHex:row.color_hex,colorName:row.color_name||null,evidenceUrl:row.evidence_url,source:row.source_label,verifiedAt:new Date(row.verified_at).toISOString()});
 }catch(error){console.error('Verified vehicle colour lookup failed:',error?.message||error);r.status(500).json({status:'ERROR',reason:'Vehicle colour is temporarily unavailable'})}
});
app.get('/api/realtime/vehicles',(_q,r)=>{
 const ageMs=cache.fetchedAt?Date.now()-Date.parse(cache.fetchedAt):Infinity;
 const stale=!Number.isFinite(ageMs)||ageMs>90000||cache.status!=='OK';
 // Never hold a client request open while a sleeping service or upstream feed wakes up.
 // Kick off the refresh in the background and return cached data (or a friendly empty state).
 if(stale&&HAS_REALTIME_KEY)void refresh().catch(()=>{});
 const hasData=cache.vehicles.length>0;
 const responseAge=cache.fetchedAt?Date.now()-Date.parse(cache.fetchedAt):Infinity;
 const responseStale=!Number.isFinite(responseAge)||responseAge>90000||cache.status!=='OK';
 r.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
 r.setHeader('Pragma','no-cache');
 r.json({status:hasData?(responseStale?'STALE':'OK'):cache.status,count:cache.vehicles.length,vehicles:cache.vehicles,fetchedAt:cache.fetchedAt,stale:responseStale,source:cache.source,cacheAgeSeconds:Number.isFinite(responseAge)?Math.max(0,Math.round(responseAge/1000)):null,reason:publicRealtimeReason(hasData,responseStale)});
});

app.get('/api/metro',async(_q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',routes:[],stops:[],reason:'Database is not configured'});try{const meta=(await pool.query('SELECT * FROM metro_feed_meta WHERE id=1')).rows[0]||null;const routes=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_type,route_color,route_text_color FROM metro_routes ORDER BY short_name,route_id')).rows;const stops=(await pool.query('SELECT stop_id,name,latitude,longitude FROM metro_stops ORDER BY name,stop_id')).rows;r.json({status:'OK',routes,stops,meta})}catch(e){r.status(500).json({status:'ERROR',routes:[],stops:[],reason:'Metro data is temporarily unavailable'})}});
app.get('/api/metro/routes/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE'});try{const id=str(q.params.id),route=(await pool.query('SELECT route_id,agency_id,short_name,long_name,route_type,route_color,route_text_color FROM metro_routes WHERE route_id=$1',[id])).rows[0];if(!route)return r.status(404).json({status:'NOT_FOUND'});const rows=(await pool.query('SELECT s.stop_id,s.name,s.latitude,s.longitude,rs.stop_sequence,COALESCE(rs.direction_id,0) AS direction_id FROM metro_route_stops rs JOIN metro_stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=$1 ORDER BY rs.direction_id,rs.stop_sequence,s.stop_id',[id])).rows;const grouped=new Map();for(const stop of rows){const key=String(stop.direction_id);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(stop)}const directions=[...grouped.entries()].map(([directionId,stops])=>({directionId,fromStop:stops[0]?.name||null,toStop:stops[stops.length-1]?.name||null,stops}));r.json({status:'OK',route,directions,stops:directions[0]?.stops||[]})}catch(e){console.error('Metro route query failed:',e?.message||e);r.status(500).json({status:'ERROR',reason:'Failed to load metro route'})}});
app.get('/api/routes/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});try{const id=str(q.params.id),route=(await pool.query(`SELECT r.route_id,r.agency_id,r.short_name,r.long_name,r.route_color,r.route_text_color,first_stop.name AS from_stop,last_stop.name AS to_stop FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.stop_id ASC LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true WHERE r.route_id=$1`,[id])).rows[0];let routeFallback=false;if(!route){const live=cache.vehicles.find(v=>String(v.routeId||'')===id);if(live){routeFallback=true;route={route_id:id,agency_id:live.operator||null,short_name:live.routeShortName||id,long_name:live.routeLongName||null,route_color:live.routeColor||null,route_text_color:live.routeTextColor||null,from_stop:live.fromStop||null,to_stop:live.toStop||null}}else return r.status(404).json({status:'NOT_FOUND',reason:'Route not found'});}if(!route)return r.status(404).json({status:'NOT_FOUND',reason:'Route not found'});const stops=routeFallback?[]:(await pool.query('SELECT s.stop_id,s.name,s.latitude,s.longitude,rs.stop_sequence FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=$1 ORDER BY rs.stop_sequence,s.stop_id',[id])).rows;r.json({status:'OK',route,stops,vehicles:cache.vehicles.filter(v=>String(v.routeId||'')===id),staticDataAvailable:!routeFallback})}catch{r.status(500).json({status:'ERROR',reason:'Failed to load route'})}});
app.get('/api/stops/:id',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});try{const id=str(q.params.id),stop=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[id])).rows[0];if(!stop)return r.status(404).json({status:'NOT_FOUND',reason:'Stop not found'});const routes=(await pool.query(`SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,MIN(rs.stop_sequence) AS stop_sequence,first_stop.name AS from_stop,last_stop.name AS to_stop FROM route_stops rs JOIN routes r ON r.route_id=rs.route_id LEFT JOIN LATERAL (SELECT s.name FROM route_stops x JOIN stops s ON s.stop_id=x.stop_id WHERE x.route_id=r.route_id ORDER BY x.stop_sequence ASC,s.stop_id ASC LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops x JOIN stops s ON s.stop_id=x.stop_id WHERE x.route_id=r.route_id ORDER BY x.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true WHERE rs.stop_id=$1 GROUP BY r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,first_stop.name,last_stop.name ORDER BY MIN(rs.stop_sequence),r.short_name,r.route_id LIMIT 100`,[id])).rows;r.json({status:'OK',stop,routes})}catch{r.status(500).json({status:'ERROR',reason:'Failed to load stop'})}});
app.get('/api/stops/:id/arrivals',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',arrivals:[],reason:'Database is not configured'});try{const st=(await pool.query('SELECT latitude,longitude FROM stops WHERE stop_id=$1',[str(q.params.id)])).rows[0];if(!st)return r.status(404).json({status:'NOT_FOUND',arrivals:[],reason:'Stop not found'});const a=cache.vehicles.map(v=>({...v,distanceMeters:Math.round(dist(Number(st.latitude),Number(st.longitude),v.latitude,v.longitude))})).filter(v=>v.distanceMeters<=2500).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,20).map(v=>({vehicleId:v.id,routeId:v.routeId,routeShortName:v.routeShortName||v.routeId||null,routeName:v.routeShortName||v.routeId||'Bus',routeColor:v.routeColor,routeTextColor:v.routeTextColor,serviceType:v.serviceType,serviceColor:v.serviceColor,busType:v.busType,fleetColorSource:v.fleetColorSource,distanceMeters:v.distanceMeters,observedAt:v.observedAt,observedAgeSeconds:Math.max(0,Math.round((Date.now()-Date.parse(v.observedAt))/1000)),toStop:v.toStop||null,tripHeadsign:v.tripHeadsign||null}));r.json({status:a.length?'OK':'UNAVAILABLE',arrivals:a,reason:a.length?null:'No nearby live buses are available right now.'})}catch{r.status(500).json({status:'ERROR',arrivals:[],reason:'Failed to load arrivals'})}});
app.post('/api/stops/nearby',async(q,r)=>{if(!pool)return r.status(503).json({status:'UNAVAILABLE',stops:[],reason:'Database is not configured'});const lat=coord(q.body?.lat,-90,90),lon=coord(q.body?.lon,-180,180),limit=Math.min(50,Math.max(1,Number(q.body?.limit)||30));if(lat===null||lon===null)return r.status(400).json({status:'ERROR',stops:[],reason:'Valid latitude and longitude are required'});try{const rows=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4 LIMIT 10000',[lat-.15,lat+.15,lon-.15,lon+.15])).rows,stops=rows.map(x=>({...x,distanceMeters:Math.round(dist(lat,lon,Number(x.latitude),Number(x.longitude)))})).filter(x=>x.distanceMeters<=15000).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,limit);r.json({status:'OK',stops})}catch{r.status(500).json({status:'ERROR',stops:[],reason:'Nearby stops are temporarily unavailable'})}});
app.get('/api/search',async(req,res)=>{if(!pool)return res.status(503).json({status:'UNAVAILABLE',results:[],reason:'Database is not configured'});const raw=String(req.query.q||'').trim().slice(0,80);if(raw.length<2)return res.json({status:'OK',results:[]});const x=raw.replace(/[%_]/g,'');const like='%'+x+'%';try{const routes=(await pool.query(`SELECT r.route_id AS id,COALESCE(r.short_name,r.long_name,r.route_id) AS label,r.long_name,r.route_color AS "routeColor",r.route_text_color AS "routeTextColor",first_stop.name AS "fromStop",last_stop.name AS "toStop",'route' AS type,CASE WHEN lower(r.short_name)=lower($1) OR lower(r.route_id)=lower($1) THEN 0 WHEN r.short_name ILIKE $2 OR r.route_id ILIKE $2 OR r.long_name ILIKE $2 THEN 1 ELSE 2 END AS rank FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence,s.stop_id LIMIT 1) first_stop ON true LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.stop_id DESC LIMIT 1) last_stop ON true WHERE r.short_name ILIKE $2 OR r.route_id ILIKE $2 OR r.long_name ILIKE $2 ORDER BY rank,r.short_name,r.route_id LIMIT 30`,[x,like])).rows;const live=(await pool.query(`SELECT vp.route_id AS id,vp.route_id AS label,NULL::text AS long_name,NULL::text AS "routeColor",NULL::text AS "routeTextColor",NULL::text AS "fromStop",NULL::text AS "toStop",'route' AS type,0 AS rank FROM vehicle_positions vp WHERE vp.observed_at>NOW()-INTERVAL '30 minutes' AND vp.route_id IS NOT NULL AND vp.route_id ILIKE $1 AND NOT EXISTS(SELECT 1 FROM routes r WHERE r.route_id=vp.route_id) GROUP BY vp.route_id LIMIT 15`,[like])).rows;const stops=(await pool.query(`SELECT s.stop_id AS id,s.name AS label,s.latitude,s.longitude,'Stop ID '||s.stop_id||' · '||ROUND(s.latitude::numeric,5)||', '||ROUND(s.longitude::numeric,5) AS "stopContext",(SELECT COUNT(DISTINCT rs.route_id)::int FROM route_stops rs WHERE rs.stop_id=s.stop_id) AS "routeCount",'stop' AS type,CASE WHEN lower(s.name)=lower($1) THEN 0 WHEN s.name ILIKE $2 THEN 1 ELSE 2 END AS rank FROM stops s WHERE s.name ILIKE $2 ORDER BY rank,s.name,s.stop_id LIMIT 30`,[x,like])).rows;const seen=new Set();const merged=[...routes,...live,...stops].filter(v=>{const k=v.type+':'+v.id;if(seen.has(k))return false;seen.add(k);return true}).sort((p,q)=>(p.rank??9)-(q.rank??9));return res.json({status:'OK',results:merged.slice(0,60)})}catch(e){console.error('Search failed:',e?.message||e);return res.status(500).json({status:'ERROR',results:[],reason:'Search is temporarily unavailable'})}});async function plannerStopFamilyIds(mode, stopId){
 const table=mode==='metro'?'metro_stops':'stops';
 const id=String(stopId||'').trim();
 if(!id||!pool)return id?[id]:[];
 try{
  const rows=(await pool.query(`
   SELECT peer.stop_id::text AS stop_id
   FROM ${table} selected
   JOIN ${table} peer
     ON LOWER(TRIM(peer.name))=LOWER(TRIM(selected.name))
    AND selected.latitude IS NOT NULL AND selected.longitude IS NOT NULL
    AND peer.latitude IS NOT NULL AND peer.longitude IS NOT NULL
    AND ABS(peer.latitude-selected.latitude)<=0.0015
    AND ABS(peer.longitude-selected.longitude)<=0.0015
   WHERE selected.stop_id=$1
   ORDER BY CASE WHEN peer.stop_id=selected.stop_id THEN 0 ELSE 1 END,peer.stop_id
   LIMIT 12
  `,[id])).rows;
  return [...new Set([id,...rows.map(row=>String(row.stop_id))])].slice(0,12);
 }catch(error){
  console.warn('Planner stop-family lookup failed:',error?.message||error);
  return [id];
 }
}
app.get('/api/plan/multimodal',async(q,r)=>{
 if(!pool)return r.status(503).json({status:'UNAVAILABLE',options:[],reason:'Database is not configured'});
 const fromType=q.query.fromType==='metro'?'metro':'bus';
 const toType=q.query.toType==='metro'?'metro':'bus';
 const fromId=str(q.query.fromStopId),toId=str(q.query.toStopId);
 if(!fromId||!toId||fromId===toId)return r.status(400).json({status:'ERROR',options:[],reason:'Choose two different stops or stations.'});
 try{
  const [fromIds,toIds]=await Promise.all([plannerStopFamilyIds(fromType,fromId),plannerStopFamilyIds(toType,toId)]);
  if(fromType===toType&&fromIds.some(id=>toIds.includes(id)))return r.status(400).json({status:'ERROR',options:[],reason:'Choose two different physical stops or stations.'});
  const options=[];
  if(fromType==='bus'&&toType==='bus'){
   // Always include direct bus services before looking for bus+Metro+bus transfers.
   // Otherwise a valid one-seat ride can be hidden by a much longer mixed itinerary.
   const directBuses=(await pool.query(`
    SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,
      a.stop_id AS from_id,fs.name AS from_name,b.stop_id AS to_id,ts.name AS to_name,
      GREATEST(1,b.stop_sequence-a.stop_sequence) AS stop_count
    FROM route_stops a
    JOIN route_stops b ON b.route_id=a.route_id AND b.stop_sequence>a.stop_sequence
    JOIN routes r ON r.route_id=a.route_id
    JOIN stops fs ON fs.stop_id=a.stop_id
    JOIN stops ts ON ts.stop_id=b.stop_id
    WHERE a.stop_id=ANY($1::text[]) AND b.stop_id=ANY($2::text[])
    ORDER BY (b.stop_sequence-a.stop_sequence),r.short_name,r.route_id LIMIT 12
   `,[fromIds,toIds])).rows;
   for(const x of directBuses)options.push({
    type:'bus',journeyMode:'bus',durationMinutes:Math.max(5,Math.ceil(Number(x.stop_count)*2.2+4)),durationIsEstimate:true,walkingMinutes:0,
    legs:[{mode:'bus',routeId:String(x.route_id),routeName:x.short_name||x.long_name||'Bus',routeLongName:x.long_name,routeColor:x.route_color,routeTextColor:x.route_text_color,fromStop:x.from_name,toStop:x.to_name,fromStopId:x.from_id,toStopId:x.to_id}]
   });
   const rows=(await pool.query(`
    SELECT br1.route_id AS first_bus_route,br1.short_name AS first_bus_short,br1.long_name AS first_bus_long,
      br1.route_color AS first_bus_color,br1.route_text_color AS first_bus_text,
      origin.stop_id AS origin_id,origin.name AS origin_name,
      transfer_bus1.stop_id AS first_bus_transfer_id,transfer_bus1.name AS first_bus_transfer_name,
      metro_start.stop_id AS metro_start_id,metro_start.name AS metro_start_name,
      metro_end.stop_id AS metro_end_id,metro_end.name AS metro_end_name,
      mr.route_id AS metro_route_id,mr.short_name AS metro_short,mr.long_name AS metro_long,
      mr.route_color AS metro_color,mr.route_text_color AS metro_text,
      transfer_bus2.stop_id AS second_bus_transfer_id,transfer_bus2.name AS second_bus_transfer_name,
      br2.route_id AS second_bus_route,br2.short_name AS second_bus_short,br2.long_name AS second_bus_long,
      br2.route_color AS second_bus_color,br2.route_text_color AS second_bus_text,
      destination.stop_id AS destination_id,destination.name AS destination_name,
      GREATEST(1,b1.stop_sequence-a.stop_sequence) AS first_bus_count,
      GREATEST(1,mb.stop_sequence-ma.stop_sequence) AS metro_count,
      GREATEST(1,d.stop_sequence-c.stop_sequence) AS second_bus_count,
      CEIL(SQRT(POWER((transfer_bus1.latitude-metro_start.latitude)*111.0,2)+POWER((transfer_bus1.longitude-metro_start.longitude)*111.0*COS(RADIANS(metro_start.latitude)),2))*1000)::int AS first_walk_meters,
      CEIL(SQRT(POWER((transfer_bus2.latitude-metro_end.latitude)*111.0,2)+POWER((transfer_bus2.longitude-metro_end.longitude)*111.0*COS(RADIANS(metro_end.latitude)),2))*1000)::int AS second_walk_meters
    FROM route_stops a
    JOIN route_stops b1 ON b1.route_id=a.route_id AND b1.stop_sequence>a.stop_sequence
    JOIN routes br1 ON br1.route_id=a.route_id
    JOIN stops origin ON origin.stop_id=a.stop_id
    JOIN stops transfer_bus1 ON transfer_bus1.stop_id=b1.stop_id
    JOIN metro_stops metro_start ON metro_start.latitude IS NOT NULL AND metro_start.longitude IS NOT NULL
      AND ABS(transfer_bus1.latitude-metro_start.latitude)<=0.0045 AND ABS(transfer_bus1.longitude-metro_start.longitude)<=0.005
    JOIN metro_route_stops ma ON ma.stop_id=metro_start.stop_id
    JOIN metro_route_stops mb ON mb.route_id=ma.route_id AND mb.direction_id=ma.direction_id AND mb.stop_sequence>ma.stop_sequence
    JOIN metro_routes mr ON mr.route_id=ma.route_id
    JOIN metro_stops metro_end ON metro_end.stop_id=mb.stop_id
    JOIN stops transfer_bus2 ON transfer_bus2.latitude IS NOT NULL AND transfer_bus2.longitude IS NOT NULL
      AND ABS(transfer_bus2.latitude-metro_end.latitude)<=0.0045 AND ABS(transfer_bus2.longitude-metro_end.longitude)<=0.005
    JOIN route_stops c ON c.stop_id=transfer_bus2.stop_id
    JOIN route_stops d ON d.route_id=c.route_id AND d.stop_sequence>c.stop_sequence AND d.stop_id=ANY($2::text[])
    JOIN routes br2 ON br2.route_id=c.route_id
    JOIN stops destination ON destination.stop_id=d.stop_id
    WHERE a.stop_id=ANY($1::text[]) AND br1.route_id<>br2.route_id
      AND SQRT(POWER((transfer_bus1.latitude-metro_start.latitude)*111.0,2)+POWER((transfer_bus1.longitude-metro_start.longitude)*111.0*COS(RADIANS(metro_start.latitude)),2))<=0.35
      AND SQRT(POWER((transfer_bus2.latitude-metro_end.latitude)*111.0,2)+POWER((transfer_bus2.longitude-metro_end.longitude)*111.0*COS(RADIANS(metro_end.latitude)),2))<=0.35
    ORDER BY (b1.stop_sequence-a.stop_sequence)*2.2+(mb.stop_sequence-ma.stop_sequence)*2.25+(d.stop_sequence-c.stop_sequence)*2.2 LIMIT 10
   `,[fromIds,toIds])).rows;
   for(const x of rows){
    const walkA=Math.max(1,Math.ceil(Number(x.first_walk_meters||100)/80)),walkB=Math.max(1,Math.ceil(Number(x.second_walk_meters||100)/80));
    options.push({
     type:'mixed',journeyMode:'mixed',durationMinutes:Math.max(12,Math.ceil(Number(x.first_bus_count)*2.2+Number(x.metro_count)*2.25+Number(x.second_bus_count)*2.2+walkA+walkB+14)),durationIsEstimate:true,walkingMinutes:walkA+walkB,
     legs:[
      {mode:'bus',routeId:String(x.first_bus_route),routeName:x.first_bus_short||x.first_bus_long||'Bus',routeColor:x.first_bus_color,routeTextColor:x.first_bus_text,fromStop:x.origin_name,toStop:x.first_bus_transfer_name,fromStopId:x.origin_id,toStopId:x.first_bus_transfer_id},
      {mode:'walk',routeName:'Walk to Metro',routeColor:'#64748B',fromStop:x.first_bus_transfer_name,toStop:x.metro_start_name,walkingMinutes:walkA,walkMeters:Number(x.first_walk_meters||0)},
      {mode:'metro',routeId:String(x.metro_route_id),routeName:x.metro_short||x.metro_long||'Metro',routeLongName:x.metro_long,routeColor:x.metro_color,routeTextColor:x.metro_text,fromStop:x.metro_start_name,toStop:x.metro_end_name,fromStopId:x.metro_start_id,toStopId:x.metro_end_id},
      {mode:'walk',routeName:'Walk to bus stop',routeColor:'#64748B',fromStop:x.metro_end_name,toStop:x.second_bus_transfer_name,walkingMinutes:walkB,walkMeters:Number(x.second_walk_meters||0)},
      {mode:'bus',routeId:String(x.second_bus_route),routeName:x.second_bus_short||x.second_bus_long||'Bus',routeColor:x.second_bus_color,routeTextColor:x.second_bus_text,fromStop:x.second_bus_transfer_name,toStop:x.destination_name,fromStopId:x.second_bus_transfer_id,toStopId:x.destination_id}
     ]
    });
   }
  }else if(fromType==='metro'&&toType==='metro'){
   const direct=(await pool.query(`
    SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,
      a.stop_id AS from_id,fs.name AS from_name,b.stop_id AS to_id,ts.name AS to_name,
      GREATEST(1,b.stop_sequence-a.stop_sequence) AS station_count
    FROM metro_route_stops a
    JOIN metro_route_stops b ON b.route_id=a.route_id AND b.direction_id=a.direction_id AND b.stop_sequence>a.stop_sequence
    JOIN metro_routes r ON r.route_id=a.route_id
    JOIN metro_stops fs ON fs.stop_id=a.stop_id
    JOIN metro_stops ts ON ts.stop_id=b.stop_id
    WHERE a.stop_id=ANY($1::text[]) AND b.stop_id=ANY($2::text[])
    ORDER BY (b.stop_sequence-a.stop_sequence),r.route_id LIMIT 6
   `,[fromIds,toIds])).rows;
   for(const x of direct)options.push({
    type:'metro',journeyMode:'metro',durationMinutes:Math.max(4,Math.ceil(Number(x.station_count)*2.3+4)),durationIsEstimate:true,walkingMinutes:0,
    legs:[{mode:'metro',routeId:String(x.route_id),routeName:x.short_name||x.long_name||'Metro',routeLongName:x.long_name,routeColor:x.route_color,routeTextColor:x.route_text_color,fromStop:x.from_name,toStop:x.to_name,fromStopId:x.from_id,toStopId:x.to_id}]
   });
   if(direct.length<4){
    const changes=(await pool.query(`
     SELECT r1.route_id AS first_route_id,r1.short_name AS first_short_name,r1.long_name AS first_long_name,
      r1.route_color AS first_color,r1.route_text_color AS first_text,
      fs.name AS from_name,sx.stop_id AS first_transfer_id,sx.name AS first_transfer_name,
      r2.route_id AS second_route_id,r2.short_name AS second_short_name,r2.long_name AS second_long_name,
      r2.route_color AS second_color,r2.route_text_color AS second_text,
      sy.stop_id AS second_transfer_id,sy.name AS second_transfer_name,ts.name AS to_name,
      GREATEST(1,x.stop_sequence-a.stop_sequence) AS first_count,
      GREATEST(1,z.stop_sequence-y.stop_sequence) AS second_count,
      CEIL(SQRT(POWER((sx.latitude-sy.latitude)*111.0,2)+POWER((sx.longitude-sy.longitude)*111.0*COS(RADIANS(sx.latitude)),2))*1000)::int AS walk_meters
     FROM metro_route_stops a
     JOIN metro_route_stops x ON x.route_id=a.route_id AND x.direction_id=a.direction_id AND x.stop_sequence>a.stop_sequence
     JOIN metro_routes r1 ON r1.route_id=a.route_id
     JOIN metro_stops fs ON fs.stop_id=a.stop_id
     JOIN metro_stops sx ON sx.stop_id=x.stop_id
     JOIN metro_stops sy ON sy.stop_id<>sx.stop_id
       AND ABS(sx.latitude-sy.latitude)<=0.0035 AND ABS(sx.longitude-sy.longitude)<=0.0045
     JOIN metro_route_stops y ON y.stop_id=sy.stop_id AND y.route_id<>x.route_id
     JOIN metro_route_stops z ON z.route_id=y.route_id AND z.direction_id=y.direction_id AND z.stop_sequence>y.stop_sequence AND z.stop_id=ANY($2::text[])
     JOIN metro_routes r2 ON r2.route_id=y.route_id
     JOIN metro_stops ts ON ts.stop_id=z.stop_id
     WHERE a.stop_id=ANY($1::text[])
       AND SQRT(POWER((sx.latitude-sy.latitude)*111.0,2)+POWER((sx.longitude-sy.longitude)*111.0*COS(RADIANS(sx.latitude)),2))<=0.30
     ORDER BY (x.stop_sequence-a.stop_sequence)+(z.stop_sequence-y.stop_sequence)+8 LIMIT 5
    `,[fromIds,toIds])).rows;
    for(const x of changes){
     const walk=Math.max(1,Math.ceil(Number(x.walk_meters||100)/80));
     options.push({
      type:'metro-transfer',journeyMode:'metro',durationMinutes:Math.max(8,Math.ceil(Number(x.first_count)*2.25+Number(x.second_count)*2.25+walk+7)),durationIsEstimate:true,walkingMinutes:walk,
      legs:[
       {mode:'metro',routeId:String(x.first_route_id),routeName:x.first_short_name||x.first_long_name||'Metro',routeLongName:x.first_long_name,routeColor:x.first_color,routeTextColor:x.first_text,fromStop:x.from_name,toStop:x.first_transfer_name,fromStopId:fromId,toStopId:x.first_transfer_id},
       {mode:'walk',routeName:'Change metro line',routeColor:'#64748B',fromStop:x.first_transfer_name,toStop:x.second_transfer_name,walkingMinutes:walk,walkMeters:Number(x.walk_meters||0)},
       {mode:'metro',routeId:String(x.second_route_id),routeName:x.second_short_name||x.second_long_name||'Metro',routeLongName:x.second_long_name,routeColor:x.second_color,routeTextColor:x.second_text,fromStop:x.second_transfer_name,toStop:x.to_name,fromStopId:x.second_transfer_id,toStopId:toId}
      ]
     });
    }
   }
  }else if(fromType==='bus'&&toType==='metro'){
   const rows=(await pool.query(`
    SELECT br.route_id AS bus_route_id,br.short_name AS bus_short_name,br.long_name AS bus_long_name,
      br.route_color AS bus_color,br.route_text_color AS bus_text,
      fs.stop_id AS origin_id,fs.name AS origin_name,bs.stop_id AS bus_transfer_id,bs.name AS bus_transfer_name,
      mt.stop_id AS metro_transfer_id,mt.name AS metro_transfer_name,
      mr.route_id AS metro_route_id,mr.short_name AS metro_short_name,mr.long_name AS metro_long_name,
      mr.route_color AS metro_color,mr.route_text_color AS metro_text,
      dest.stop_id AS dest_id,dest.name AS dest_name,
      GREATEST(1,b.stop_sequence-a.stop_sequence) AS bus_stop_count,
      GREATEST(1,mb.stop_sequence-ma.stop_sequence) AS metro_station_count,
      CEIL(SQRT(POWER((bs.latitude-mt.latitude)*111.0,2)+POWER((bs.longitude-mt.longitude)*111.0*COS(RADIANS(mt.latitude)),2))*1000)::int AS walk_meters
    FROM route_stops a
    JOIN route_stops b ON b.route_id=a.route_id AND b.stop_sequence>a.stop_sequence
    JOIN routes br ON br.route_id=a.route_id
    JOIN stops fs ON fs.stop_id=a.stop_id
    JOIN stops bs ON bs.stop_id=b.stop_id
    JOIN metro_stops mt ON ABS(bs.latitude-mt.latitude)<=0.0045 AND ABS(bs.longitude-mt.longitude)<=0.005
    JOIN metro_route_stops ma ON ma.stop_id=mt.stop_id
    JOIN metro_route_stops mb ON mb.route_id=ma.route_id AND mb.direction_id=ma.direction_id AND mb.stop_sequence>ma.stop_sequence AND mb.stop_id=ANY($2::text[])
    JOIN metro_routes mr ON mr.route_id=ma.route_id
    JOIN metro_stops dest ON dest.stop_id=mb.stop_id
    WHERE a.stop_id=ANY($1::text[]) AND bs.latitude IS NOT NULL AND mt.latitude IS NOT NULL
      AND SQRT(POWER((bs.latitude-mt.latitude)*111.0,2)+POWER((bs.longitude-mt.longitude)*111.0*COS(RADIANS(mt.latitude)),2))<=0.35
    ORDER BY (b.stop_sequence-a.stop_sequence)*2.3+(mb.stop_sequence-ma.stop_sequence)*2.2 LIMIT 10
   `,[fromIds,toIds])).rows;
   for(const x of rows){
    const walk=Math.max(1,Math.ceil(Number(x.walk_meters||100)/80));
    options.push({
     type:'mixed',journeyMode:'mixed',durationMinutes:Math.max(8,Math.ceil(Number(x.bus_stop_count)*2.2+Number(x.metro_station_count)*2.25+walk+9)),durationIsEstimate:true,walkingMinutes:walk,
     legs:[
      {mode:'bus',routeId:String(x.bus_route_id),routeName:x.bus_short_name||x.bus_long_name||'Bus',routeColor:x.bus_color,routeTextColor:x.bus_text,fromStop:x.origin_name,toStop:x.bus_transfer_name,fromStopId:x.origin_id,toStopId:x.bus_transfer_id},
      {mode:'walk',routeName:'Walk to Metro',routeColor:'#64748B',fromStop:x.bus_transfer_name,toStop:x.metro_transfer_name,walkingMinutes:walk,walkMeters:Number(x.walk_meters||0)},
      {mode:'metro',routeId:String(x.metro_route_id),routeName:x.metro_short_name||x.metro_long_name||'Metro',routeLongName:x.metro_long_name,routeColor:x.metro_color,routeTextColor:x.metro_text,fromStop:x.metro_transfer_name,toStop:x.dest_name,fromStopId:x.metro_transfer_id,toStopId:x.dest_id}
     ]
    });
   }
  }else if(fromType==='metro'&&toType==='bus'){
   const rows=(await pool.query(`
    SELECT mr.route_id AS metro_route_id,mr.short_name AS metro_short_name,mr.long_name AS metro_long_name,
      mr.route_color AS metro_color,mr.route_text_color AS metro_text,
      fs.stop_id AS origin_id,fs.name AS origin_name,mt.stop_id AS metro_transfer_id,mt.name AS metro_transfer_name,
      bs.stop_id AS bus_transfer_id,bs.name AS bus_transfer_name,
      br.route_id AS bus_route_id,br.short_name AS bus_short_name,br.long_name AS bus_long_name,
      br.route_color AS bus_color,br.route_text_color AS bus_text,
      dest.stop_id AS dest_id,dest.name AS dest_name,
      GREATEST(1,mb.stop_sequence-ma.stop_sequence) AS metro_station_count,
      GREATEST(1,b.stop_sequence-a.stop_sequence) AS bus_stop_count,
      CEIL(SQRT(POWER((bs.latitude-mt.latitude)*111.0,2)+POWER((bs.longitude-mt.longitude)*111.0*COS(RADIANS(mt.latitude)),2))*1000)::int AS walk_meters
    FROM metro_route_stops ma
    JOIN metro_route_stops mb ON mb.route_id=ma.route_id AND mb.direction_id=ma.direction_id AND mb.stop_sequence>ma.stop_sequence
    JOIN metro_routes mr ON mr.route_id=ma.route_id
    JOIN metro_stops fs ON fs.stop_id=ma.stop_id
    JOIN metro_stops mt ON mt.stop_id=mb.stop_id
    JOIN stops bs ON ABS(bs.latitude-mt.latitude)<=0.0045 AND ABS(bs.longitude-mt.longitude)<=0.005
    JOIN route_stops a ON a.stop_id=bs.stop_id
    JOIN route_stops b ON b.route_id=a.route_id AND b.stop_sequence>a.stop_sequence AND b.stop_id=ANY($2::text[])
    JOIN routes br ON br.route_id=a.route_id
    JOIN stops dest ON dest.stop_id=b.stop_id
    WHERE ma.stop_id=ANY($1::text[]) AND bs.latitude IS NOT NULL AND mt.latitude IS NOT NULL
      AND SQRT(POWER((bs.latitude-mt.latitude)*111.0,2)+POWER((bs.longitude-mt.longitude)*111.0*COS(RADIANS(mt.latitude)),2))<=0.35
    ORDER BY (mb.stop_sequence-ma.stop_sequence)*2.2+(b.stop_sequence-a.stop_sequence)*2.3 LIMIT 10
   `,[fromIds,toIds])).rows;
   for(const x of rows){
    const walk=Math.max(1,Math.ceil(Number(x.walk_meters||100)/80));
    options.push({
     type:'mixed',journeyMode:'mixed',durationMinutes:Math.max(8,Math.ceil(Number(x.metro_station_count)*2.25+Number(x.bus_stop_count)*2.2+walk+9)),durationIsEstimate:true,walkingMinutes:walk,
     legs:[
      {mode:'metro',routeId:String(x.metro_route_id),routeName:x.metro_short_name||x.metro_long_name||'Metro',routeLongName:x.metro_long_name,routeColor:x.metro_color,routeTextColor:x.metro_text,fromStop:x.origin_name,toStop:x.metro_transfer_name,fromStopId:x.origin_id,toStopId:x.metro_transfer_id},
      {mode:'walk',routeName:'Walk to bus stop',routeColor:'#64748B',fromStop:x.metro_transfer_name,toStop:x.bus_transfer_name,walkingMinutes:walk,walkMeters:Number(x.walk_meters||0)},
      {mode:'bus',routeId:String(x.bus_route_id),routeName:x.bus_short_name||x.bus_long_name||'Bus',routeColor:x.bus_color,routeTextColor:x.bus_text,fromStop:x.bus_transfer_name,toStop:x.dest_name,fromStopId:x.bus_transfer_id,toStopId:x.dest_id}
     ]
    });
   }
  }
  const directionMatches=option=>{
   const legs=(Array.isArray(option?.legs)?option.legs:[]).filter(leg=>leg&&leg.mode!=='walk');
   if(!legs.length)return false;
   return fromIds.includes(String(legs[0].fromStopId||''))&&toIds.includes(String(legs[legs.length-1].toStopId||''));
  };
  const uniqueOptions=new Map();
  for(const option of options.filter(directionMatches)){
   const legs=Array.isArray(option.legs)?option.legs:[];
   const key=legs.map(leg=>[String(leg.mode||'bus'),String(leg.routeId||'walk'),String(leg.fromStopId||leg.fromStop||''),String(leg.toStopId||leg.toStop||'')].join(':')).join('|');
   const previous=uniqueOptions.get(key);
   if(!previous||(Number(option.durationMinutes)||999)<(Number(previous.durationMinutes)||999))uniqueOptions.set(key,option);
  }
  const ranked=[...uniqueOptions.values()].sort((a,b)=>(a.durationMinutes||999)-(b.durationMinutes||999));
  return r.json({status:'OK',origin:{type:fromType,id:fromId},destination:{type:toType,id:toId},originStopIds:fromIds,destinationStopIds:toIds,options:decoratePlannerOptions(ranked.slice(0,8)),reason:ranked.length?null:'No journey could be found in the correct direction in the current static network data.'});
 }catch(error){
  console.error('Multimodal planner failed:',error?.message||error);
  return r.status(500).json({status:'ERROR',options:[],reason:'Trip planning is temporarily unavailable. Please try again.'});
 }
});
app.get('/api/plan',async(q,r)=>{
 if(!pool)return r.status(503).json({status:'UNAVAILABLE',options:[],reason:'Database is not configured'});
 let fromId=str(q.query.fromStopId),toId=str(q.query.toStopId);
 try{
  if(!fromId){const name=str(q.query.from);if(name)fromId=(await pool.query('SELECT stop_id FROM stops WHERE name=$1 ORDER BY stop_id LIMIT 1',[name])).rows[0]?.stop_id||null}
  if(!toId){const name=str(q.query.to);if(name)toId=(await pool.query('SELECT stop_id FROM stops WHERE name=$1 ORDER BY stop_id LIMIT 1',[name])).rows[0]?.stop_id||null}
  if(!fromId||!toId||fromId===toId)return r.status(400).json({status:'ERROR',options:[],reason:'Please select two different bus stops from the suggestions.'});
  const [fromIds,toIds]=await Promise.all([plannerStopFamilyIds('bus',fromId),plannerStopFamilyIds('bus',toId)]);
  if(fromIds.some(id=>toIds.includes(id)))return r.status(400).json({status:'ERROR',options:[],reason:'Choose two different physical bus stops.'});
  const directRows=(await pool.query("SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,a.stop_id from_stop_id,fs.name from_stop,b.stop_id to_stop_id,ts.name to_stop,a.stop_sequence from_sequence,b.stop_sequence to_sequence FROM route_stops a JOIN route_stops b ON b.route_id=a.route_id AND b.stop_sequence>a.stop_sequence JOIN routes r ON r.route_id=a.route_id JOIN stops fs ON fs.stop_id=a.stop_id JOIN stops ts ON ts.stop_id=b.stop_id WHERE a.stop_id=ANY($1::text[]) AND b.stop_id=ANY($2::text[]) ORDER BY (b.stop_sequence-a.stop_sequence),r.route_id LIMIT 30",[fromIds,toIds])).rows;
  const direct=directRows.map(x=>({type:'direct',durationMinutes:Math.max(3,Math.ceil((Number(x.to_sequence)-Number(x.from_sequence))*2.5)),durationIsEstimate:true,walkingMinutes:null,legs:[{routeId:String(x.route_id),routeName:x.short_name||x.long_name||'Bus',routeColor:x.route_color,routeTextColor:x.route_text_color,fromStop:x.from_stop,toStop:x.to_stop,fromStopId:x.from_stop_id,toStopId:x.to_stop_id}]}));
  let transfers=[];
  if(direct.length<5){
   const rows=(await pool.query("WITH from_routes AS (SELECT route_id,stop_id AS from_stop_id,stop_sequence AS from_seq FROM route_stops WHERE stop_id=ANY($1::text[])), to_routes AS (SELECT route_id,stop_id AS to_stop_id,stop_sequence AS to_seq FROM route_stops WHERE stop_id=ANY($2::text[])), transfer_points AS (SELECT fr.route_id AS r1,fr.from_stop_id,fr.from_seq,x.stop_id AS transfer_stop_id,x.stop_sequence AS transfer_seq FROM from_routes fr JOIN route_stops x ON x.route_id=fr.route_id AND x.stop_sequence>fr.from_seq AND x.stop_sequence<=fr.from_seq+40), candidates AS (SELECT tp.r1,tp.from_stop_id,tp.from_seq,tp.transfer_stop_id,tp.transfer_seq,tr.route_id AS r2,tr2.to_stop_id,tr2.to_seq FROM transfer_points tp JOIN route_stops tr ON tr.stop_id=tp.transfer_stop_id JOIN to_routes tr2 ON tr2.route_id=tr.route_id AND tr2.to_seq>tr.stop_sequence WHERE tr.route_id<>tp.r1 AND tr.stop_sequence>tp.transfer_seq AND (tr2.to_seq-tr.stop_sequence)<=40) SELECT c.*,r1.short_name AS r1_name,r1.long_name AS r1_long,r1.route_color AS r1_color,r1.route_text_color AS r1_text,r2.short_name AS r2_name,r2.long_name AS r2_long,r2.route_color AS r2_color,r2.route_text_color AS r2_text,fs.name AS from_name,ts.name AS transfer_name,es.name AS to_name FROM candidates c JOIN routes r1 ON r1.route_id=c.r1 JOIN routes r2 ON r2.route_id=c.r2 JOIN stops fs ON fs.stop_id=c.from_stop_id JOIN stops ts ON ts.stop_id=c.transfer_stop_id JOIN stops es ON es.stop_id=c.to_stop_id ORDER BY (c.transfer_seq-c.from_seq)+(c.to_seq-c.transfer_seq),c.r1,c.r2 LIMIT 30",[fromIds,toIds])).rows;
   const seen=new Set();
   for(const x of rows){
    const key=String(x.r1)+'>'+String(x.r2)+'@'+String(x.transfer_stop_id);
    if(seen.has(key))continue;seen.add(key);
    transfers.push({type:'transfer',durationMinutes:Math.max(8,Math.ceil(((Number(x.transfer_seq)-Number(x.from_seq))+(Number(x.to_seq)-Number(x.transfer_seq)))*2.5)+5),durationIsEstimate:true,walkingMinutes:5,legs:[
      {routeId:String(x.r1),routeName:x.r1_name||x.r1_long||'Bus',routeColor:x.r1_color,routeTextColor:x.r1_text,fromStop:x.from_name,toStop:x.transfer_name,fromStopId:String(x.from_stop_id),toStopId:x.transfer_stop_id},
      {routeId:String(x.r2),routeName:x.r2_name||x.r2_long||'Bus',routeColor:x.r2_color,routeTextColor:x.r2_text,fromStop:x.transfer_name,toStop:x.to_name,fromStopId:x.transfer_stop_id,toStopId:String(x.to_stop_id)}
    ],transferStop:x.transfer_name});
    if(transfers.length>=6)break;
   }
  }
  const options=[...direct,...transfers].sort((a,b)=>(a.durationMinutes||999)-(b.durationMinutes||999)).slice(0,5);
  const origin=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[fromId])).rows[0]||null;
  const destination=(await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[toId])).rows[0]||null;
  const uniqueOptions=new Map();
  for(const option of options){
   const legs=Array.isArray(option.legs)?option.legs:[];
   const key=legs.map(leg=>[String(leg.routeId||''),String(leg.fromStopId||''),String(leg.toStopId||'')].join(':')).join('|');
   const previous=uniqueOptions.get(key);
   if(!previous||(Number(option.durationMinutes)||999)<(Number(previous.durationMinutes)||999))uniqueOptions.set(key,option);
  }
  const ranked=[...uniqueOptions.values()].sort((a,b)=>(a.durationMinutes||999)-(b.durationMinutes||999));
  return r.json({status:'OK',origin,destination,originStopIds:fromIds,destinationStopIds:toIds,options:decoratePlannerOptions(ranked.slice(0,10)),reason:ranked.length?null:'No bus journey was found between the selected stops.'});
 }catch(e){console.error('Journey planner failed:',e?.message||e);return r.status(500).json({status:'ERROR',options:[],reason:'Journey planner is temporarily unavailable. Please try again.'})}
});
function scheduleMetroStaticRetry(){
 const retry=setTimeout(runMetroStaticSync,5*60*1000);
 retry.unref?.();
}
function runMetroStaticSync(){
 if(!pool||String(process.env.METRO_AUTO_SYNC??'true').toLowerCase()==='false')return;
 void syncMetroStatic(pool,{
  allowReplacement:String(process.env.METRO_STATIC_ALLOW_REPLACEMENT||'false').toLowerCase()==='true',
  allowExpiredCalendar:String(process.env.METRO_ALLOW_EXPIRED_CALENDAR||'false').toLowerCase()==='true',
  allowInvalidCalendar:String(process.env.METRO_ALLOW_INVALID_CALENDAR||'false').toLowerCase()==='true'
 }).then(result=>{
  if(result?.requiresApproval){console.warn(result.reason||'DMRC refresh requires explicit approval; existing data preserved.');return;}
  if(!result?.ok)throw new Error(result?.reason||'Metro static sync did not complete');
 }).catch(error=>{
  console.error('Uploaded DMRC static sync failed:',error?.message||error);
  scheduleMetroStaticRetry();
 });
}
app.use((_q,r)=>r.status(404).json({status:'NOT_FOUND',reason:'Endpoint not found'}));
app.use((e,_q,r,_n)=>{console.error('Unhandled request error:',e?.message||e);if(!r.headersSent)r.status(500).json({status:'ERROR',reason:'Internal server error'})});
const server=app.listen(PORT,'0.0.0.0',()=>{console.log('United Delhi API listening on 0.0.0.0:'+PORT);setTimeout(async()=>{try{if(pool){await ensureRuntimeSchema();await loadFleetRegistry(true);await loadVerifiedLiveries(true);await loadRouteMeta();await loadDatabaseVehicleCache();autoImportDtcStaticIfEmpty()}}catch(e){console.error('Database bootstrap failed:',e?.message||e)}if(HAS_REALTIME_KEY){void refresh();poll=setInterval(()=>void refresh(),15000)}if(pool&&String(process.env.METRO_AUTO_SYNC??'true').toLowerCase()!=='false'){setTimeout(runMetroStaticSync,5000);setInterval(runMetroStaticSync,24*60*60*1000)}},1500)});
server.requestTimeout=30000;server.headersTimeout=40000;server.keepAliveTimeout=65000;
process.on('unhandledRejection',e=>console.error('Unhandled rejection:',e));process.on('uncaughtException',e=>console.error('Uncaught exception:',e));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,async()=>{if(poll)clearInterval(poll);server.close();await pool?.end().catch(()=>{});process.exit(0)});
