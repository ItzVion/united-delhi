import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { spawn } from 'node:child_process';
import { rateLimit } from 'express-rate-limit';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000);
const databaseUrl = process.env.DATABASE_URL || '';
const isLocalDatabase = /(?:localhost|127(?:\.\d+){3}|::1)/i.test(databaseUrl);
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000, ...(isLocalDatabase ? {} : { ssl: { rejectUnauthorized: true } }) }) : null;
if (pool) pool.on('error', error => console.error('PostgreSQL pool error:', error.message));
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('etag', false);
const appOrigins = String(process.env.APP_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors(appOrigins.length ? { origin: appOrigins } : { origin: false }));
app.use(express.json({ limit: '32kb', strict: true }));
app.use((_req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','geolocation=(self)');
  res.setHeader('X-DNS-Prefetch-Control','off');
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (_req.secure) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  next();
});
app.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const apiRateLimit=rateLimit({windowMs:60_000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{status:'RATE_LIMITED',reason:'Too many requests. Please try again shortly.'}});
const dbRateLimit=rateLimit({windowMs:60_000,limit:45,standardHeaders:'draft-8',legacyHeaders:false,message:{status:'RATE_LIMITED',reason:'Too many database requests. Please try again shortly.'}});
const realtimeRateLimit=rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{status:'RATE_LIMITED',reason:'Too many realtime-feed requests. Please try again shortly.'}});
const healthRateLimit=rateLimit({windowMs:60_000,limit:60,standardHeaders:'draft-8',legacyHeaders:false,message:{status:'RATE_LIMITED',reason:'Too many health checks. Please try again shortly.'}});
app.use('/api',apiRateLimit);
const ok=value=>value!==undefined&&value!==null&&value!=='';
function numberOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function parseCoordinate(value,min,max){const n=numberOrNull(value);return n!==null&&n>=min&&n<=max?n:null;}
function requestId(value){const id=String(value??'').trim();return /^[A-Za-z0-9._:-]{1,120}$/.test(id)?id:null;}
function boundedText(value,max=80){const text=String(value??'').trim();return text.length<=max?text:null;}
function searchPattern(value){
  const text=boundedText(value,80);
  if(!text)return null;
  const stripped=text.replace(/[%_]/g,'').trim();
  return stripped.length>=2?'%'+stripped+'%':null;
}
function normalizeBearing(value){const n=numberOrNull(value);return n!==null&&n>=0&&n<=360?n:null;}
function observedAtFromTimestamp(value){
  const seconds=numberOrNull(value);
  const milliseconds=seconds===null?NaN:seconds*1000;
  const now=Date.now();
  if(!Number.isFinite(milliseconds)||milliseconds<0||Math.abs(milliseconds)>8640000000000000)return new Date().toISOString();
  if(milliseconds>now+300000||milliseconds<now-5*60*1000)return null;
  return new Date(milliseconds).toISOString();
}
function entityToVehicle(entity){
  const vehicle=entity.vehicle;
  if(!vehicle?.position)return null;
  const position=vehicle.position,trip=vehicle.trip||{},descriptor=vehicle.vehicle||{};
  const lat=parseCoordinate(position.latitude,-90,90),lon=parseCoordinate(position.longitude,-180,180);
  if(lat===null||lon===null)return null;
  const id=boundedText(descriptor.id||vehicle.id||entity.id,120);
  if(!id)return null;
  const routeId=ok(trip.routeId)?boundedText(trip.routeId,120):null;
  const tripId=ok(trip.tripId)?boundedText(trip.tripId,120):null;
  const stopId=ok(vehicle.stopId)?boundedText(vehicle.stopId,120):null;
  const timestamp=Number(vehicle.timestamp||0);
  const observedAt=timestamp>0?observedAtFromTimestamp(timestamp):new Date().toISOString();
  if(!observedAt)return null;
  return{id,routeId,routeShortName:null,routeColor:null,routeTextColor:null,tripId,stopId,latitude:lat,longitude:lon,bearing:normalizeBearing(position.bearing),observedAt};
}
async function getRealtimeVehicles(){if(!process.env.DTC_API_KEY){const e=new Error('DTC_API_KEY is not configured');e.code='NO_API_KEY';throw e;}const url='https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key='+encodeURIComponent(process.env.DTC_API_KEY);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000),MAX=10*1024*1024;try{const upstream=await fetch(url,{headers:{accept:'application/x-protobuf'},signal:controller.signal});if(!upstream.ok)throw new Error('OTD returned HTTP '+upstream.status);const length=Number(upstream.headers.get('content-length')||0);if(Number.isFinite(length)&&length>MAX)throw new Error('OTD realtime feed is unexpectedly large');const buffer=new Uint8Array(await upstream.arrayBuffer());if(buffer.byteLength>MAX)throw new Error('OTD realtime feed exceeded the 10 MB safety limit');const feed=GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);if(!Array.isArray(feed.entity)||feed.entity.length>20000)throw new Error('OTD realtime feed contains too many entities');const vehicleMap=new Map();for(const entity of feed.entity){const vehicle=entityToVehicle(entity);if(vehicle?.id)vehicleMap.set(vehicle.id,vehicle);}const rawVehicles=[...vehicleMap.values()];const vehicles=rawVehicles.filter(v=>{if(!v.routeId)return false;const observed=Date.parse(v.observedAt);return Number.isFinite(observed)&&Date.now()-observed<=5*60*1000;});if(pool&&vehicles.length){const routeIds=[...new Set(vehicles.map(v=>v.routeId).filter(Boolean))];if(routeIds.length){try{const result=await pool.query(`SELECT r.route_id,r.short_name,r.route_color,r.route_text_color,start_stop.name AS from_stop,end_stop.name AS to_stop FROM routes r LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.name,s.stop_id LIMIT 1) start_stop ON TRUE LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.name,s.stop_id LIMIT 1) end_stop ON TRUE WHERE r.route_id=ANY($1::text[])`,[routeIds]);const map=new Map(result.rows.map(row=>[String(row.route_id),row]));const routeStops=new Map();const stopRows=await pool.query(`SELECT rs.route_id,s.stop_id,s.latitude,s.longitude FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=ANY($1::text[])`,[routeIds]);for(const row of stopRows.rows){const key=String(row.route_id);if(!routeStops.has(key))routeStops.set(key,{ids:new Set(),points:[]});routeStops.get(key).ids.add(String(row.stop_id));routeStops.get(key).points.push({lat:Number(row.latitude),lon:Number(row.longitude)});}for(const v of vehicles){const row=v.routeId?map.get(String(v.routeId)):null;if(!row?.short_name){v.routeShortName=null;continue;}const meta=routeStops.get(String(v.routeId));if(!meta||!meta.points.some(stop=>haversineMeters(v.latitude,v.longitude,stop.lat,stop.lon)<=3000)){v.routeShortName=null;continue;}if(v.stopId&&!meta.ids.has(String(v.stopId))){v.routeShortName=null;continue;}v.routeShortName=String(row.short_name).trim();v.routeColor=row.route_color?String(row.route_color).trim():null;v.routeTextColor=row.route_text_color?String(row.route_text_color).trim():null;v.fromStop=row.from_stop?String(row.from_stop).trim():null;v.toStop=row.to_stop?String(row.to_stop).trim():null;}}catch(error){console.error('Realtime route lookup failed:',error.message);return [];}}}return vehicles.filter(v=>Boolean(v.routeShortName));}catch(error){if(error?.name==='AbortError')throw new Error('OTD realtime feed timed out after 15 seconds');throw error;}finally{clearTimeout(timer);}}
const realtimeCache={vehicles:[],status:'INIT',reason:null,fetchedAt:null};let realtimeRefreshInFlight=null;let vehicleSaveInFlight=false;
async function persistVehiclesIfIdle(vehicles){if(!pool||vehicleSaveInFlight)return;vehicleSaveInFlight=true;try{await saveVehicles(vehicles);}catch(error){console.error('Failed to save realtime vehicles:',error.message);}finally{vehicleSaveInFlight=false;}}
async function refreshRealtimeCache(){if(realtimeRefreshInFlight)return realtimeRefreshInFlight;realtimeRefreshInFlight=(async()=>{try{const vehicles=await getRealtimeVehicles();realtimeCache.vehicles=vehicles;realtimeCache.status='OK';realtimeCache.reason=null;realtimeCache.fetchedAt=new Date().toISOString();if(pool)void persistVehiclesIfIdle(vehicles);}catch(error){if(!realtimeCache.fetchedAt)realtimeCache.status='UNAVAILABLE';realtimeCache.reason=error instanceof Error?error.message:'Realtime request failed';console.error('Realtime poll failed:',realtimeCache.reason);}})().finally(()=>{realtimeRefreshInFlight=null;});return realtimeRefreshInFlight;}
function startRealtimePolling(){if(!process.env.DTC_API_KEY){realtimeCache.status='UNAVAILABLE';realtimeCache.reason='DTC_API_KEY is not configured';return;}void refreshRealtimeCache();setInterval(()=>void refreshRealtimeCache(),12000);}
async function saveVehicles(vehicles){if(!pool)return;const client=await pool.connect();try{await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='15000'");const chunkSize=200;for(let i=0;i<vehicles.length;i+=chunkSize){const chunk=vehicles.slice(i,i+chunkSize),values=[];const placeholders=chunk.map((v,index)=>{const base=index*7;values.push(v.id,v.routeId,v.stopId,v.latitude,v.longitude,v.bearing,v.observedAt);return '($'+(base+1)+',$'+(base+2)+',$'+(base+3)+',$'+(base+4)+',$'+(base+5)+',$'+(base+6)+',$'+(base+7)+',NOW())';}).join(',');await client.query('INSERT INTO vehicle_positions(vehicle_id,route_id,stop_id,latitude,longitude,bearing,observed_at,updated_at) VALUES '+placeholders+' ON CONFLICT(vehicle_id) DO UPDATE SET route_id=EXCLUDED.route_id,stop_id=EXCLUDED.stop_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,bearing=EXCLUDED.bearing,observed_at=EXCLUDED.observed_at,updated_at=NOW()',values);}await client.query("DELETE FROM vehicle_positions WHERE observed_at < NOW() - INTERVAL '10 minutes'");await client.query("DELETE FROM vehicle_positions WHERE route_id IS NULL OR route_id NOT IN (SELECT route_id FROM routes)");await client.query('COMMIT');}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}
app.get('/health',healthRateLimit,async(_req,res)=>{res.setHeader('Cache-Control','no-store');let database='not_configured';if(pool){try{await pool.query('SELECT 1');database='ok';}catch{database='error';}}res.status(database==='ok'?200:503).json({ok:database!=='error',service:'united-delhi-api',database,realtime:realtimeCache.status,lastRealtimeFetch:realtimeCache.fetchedAt,time:new Date().toISOString()});});
app.get('/api/status',(_req,res)=>res.json({realtime:process.env.DTC_API_KEY?'configured':'unavailable',database:pool?'configured':'unavailable',realtimeCache:realtimeCache.status,lastRealtimeFetch:realtimeCache.fetchedAt}));
app.get('/api/realtime/vehicles',realtimeRateLimit,(_req,res)=>{res.setHeader('Cache-Control','no-store');const fetchedAt=realtimeCache.fetchedAt,age=fetchedAt?Math.max(0,Date.now()-Date.parse(fetchedAt)):Infinity,stale=age>180000;if(realtimeCache.status==='UNAVAILABLE'&&!realtimeCache.vehicles.length)return res.status(503).json({status:'UNAVAILABLE',count:0,vehicles:[],reason:'Realtime data is currently unavailable'});res.json({status:stale?'STALE':'OK',count:realtimeCache.vehicles.length,vehicles:realtimeCache.vehicles,fetchedAt,stale});});
app.post('/api/stops/nearby',dbRateLimit,async(req,res)=>{if(!pool)return res.status(503).json({status:'UNAVAILABLE',stops:[],reason:'Database is not configured'});const lat=parseCoordinate(req.body?.lat,-90,90),lon=parseCoordinate(req.body?.lon,-180,180),ln=Number(req.body?.limit),limit=Number.isFinite(ln)?Math.min(Math.max(Math.trunc(ln),1),50):10;if(lat===null||lon===null)return res.status(400).json({status:'ERROR',stops:[],reason:'Valid lat and lon are required'});res.setHeader('Cache-Control','no-store');try{const result=await pool.query(`SELECT stop_id,name,latitude,longitude,distance_m FROM (SELECT stop_id,name,latitude,longitude,(6371000*acos(LEAST(1,GREATEST(-1,sin(radians($1))*sin(radians(latitude))+cos(radians($1))*cos(radians(latitude))*cos(radians(longitude)-radians($2)))))) distance_m FROM stops) calculated ORDER BY distance_m,stop_id LIMIT $3`,[lat,lon,limit]);res.json({status:'OK',stops:result.rows});}catch(error){console.error('Failed to load nearby stops:',error.message);res.status(500).json({status:'ERROR',stops:[],reason:'Failed to load nearby stops'});}});
function haversineMeters(lat1,lon1,lat2,lon2){const R=6371000,toRad=v=>v*Math.PI/180,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1),a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
app.get('/api/stops/:id/arrivals',dbRateLimit,async(req,res)=>{if(!pool)return res.status(503).json({status:'UNAVAILABLE',arrivals:[],reason:'Database is not configured'});const stopId=requestId(req.params.id);if(!stopId)return res.status(400).json({status:'ERROR',arrivals:[],reason:'Invalid stop id'});try{const result=await pool.query('SELECT rs.route_id,r.short_name,r.route_color,r.route_text_color,start_stop.name AS from_stop,end_stop.name AS to_stop FROM route_stops rs LEFT JOIN routes r ON r.route_id=rs.route_id LEFT JOIN LATERAL (SELECT s.name FROM route_stops rsi JOIN stops s ON s.stop_id=rsi.stop_id WHERE rsi.route_id=rs.route_id ORDER BY rsi.stop_sequence ASC,s.name,s.stop_id LIMIT 1) start_stop ON TRUE LEFT JOIN LATERAL (SELECT s.name FROM route_stops rse JOIN stops s ON s.stop_id=rse.stop_id WHERE rse.route_id=rs.route_id ORDER BY rse.stop_sequence DESC,s.name,s.stop_id LIMIT 1) end_stop ON TRUE WHERE rs.stop_id=$1',[stopId]);const routeMap=new Map(result.rows.map(row=>[String(row.route_id),row]));const stop=await pool.query('SELECT latitude,longitude FROM stops WHERE stop_id=$1',[stopId]);if(!stop.rows.length)return res.status(404).json({status:'NOT_FOUND',arrivals:[],reason:'Stop not found'});const stopLat=Number(stop.rows[0].latitude),stopLon=Number(stop.rows[0].longitude),now=Date.now(),routeIds=new Set(routeMap.keys()),cacheAge=realtimeCache.fetchedAt?Math.max(0,now-Date.parse(realtimeCache.fetchedAt)):Infinity;const liveVehicles=cacheAge<=180000?realtimeCache.vehicles:[];const output=liveVehicles.filter(v=>v.routeId&&routeIds.has(String(v.routeId))).map(v=>{const d=haversineMeters(v.latitude,v.longitude,stopLat,stopLon),observed=Date.parse(v.observedAt),age=Number.isFinite(observed)?Math.max(0,Math.round((now-observed)/1000)):0,row=routeMap.get(String(v.routeId));return{vehicleId:v.id,routeId:v.routeId,routeShortName:row?.short_name?String(row.short_name).trim():null,routeColor:row?.route_color?String(row.route_color).trim():null,routeTextColor:row?.route_text_color?String(row.route_text_color).trim():null,distanceMeters:Math.max(0,Math.round(d)),observedAgeSeconds:age,fromStop:row?.from_stop?String(row.from_stop).trim():null,toStop:row?.to_stop?String(row.to_stop).trim():null};}).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,20);res.json({status:'OK',arrivals:output});}catch(error){console.error('Failed to load stop arrivals:',error.message);res.status(500).json({status:'ERROR',arrivals:[],reason:'Failed to load arrivals'});}});
app.get('/api/stops/:id',dbRateLimit,async(req,res)=>{if(!pool)return res.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});const stopId=requestId(req.params.id);if(!stopId)return res.status(400).json({status:'ERROR',reason:'Invalid stop id'});try{const stopResult=await pool.query('SELECT stop_id,name,latitude,longitude FROM stops WHERE stop_id=$1',[stopId]);if(!stopResult.rows.length)return res.status(404).json({status:'NOT_FOUND',reason:'Stop not found'});const routesResult=await pool.query('SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,rs.stop_sequence FROM route_stops rs JOIN routes r ON r.route_id=rs.route_id WHERE rs.stop_id=$1 ORDER BY r.short_name NULLS LAST,r.route_id',[stopId]);res.json({status:'OK',stop:stopResult.rows[0],routes:routesResult.rows});}catch(error){console.error('Failed to load stop:',error.message);res.status(500).json({status:'ERROR',reason:'Failed to load stop'});}});
app.get('/api/routes/:id',dbRateLimit,async(req,res)=>{if(!pool)return res.status(503).json({status:'UNAVAILABLE',reason:'Database is not configured'});const routeId=requestId(req.params.id);if(!routeId)return res.status(400).json({status:'ERROR',reason:'Invalid route id'});try{const routeResult=await pool.query('SELECT route_id,short_name,long_name,route_color,route_text_color FROM routes WHERE route_id=$1',[routeId]);if(!routeResult.rows.length)return res.status(404).json({status:'NOT_FOUND',reason:'Route not found'});const stopsResult=await pool.query('SELECT s.stop_id,s.name,s.latitude,s.longitude,rs.stop_sequence FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=$1 ORDER BY rs.stop_sequence,s.name,s.stop_id',[routeId]);const routeStops=stopsResult.rows;const cacheAge=realtimeCache.fetchedAt?Math.max(0,Date.now()-Date.parse(realtimeCache.fetchedAt)):Infinity;const candidates=cacheAge<=180000?realtimeCache.vehicles.filter(v=>String(v.routeId||'')===routeId):[];const vehicles=candidates.filter(v=>routeStops.some(s=>haversineMeters(v.latitude,v.longitude,Number(s.latitude),Number(s.longitude))<=3000));res.json({status:'OK',route:routeResult.rows[0],stops:routeStops,vehicles});}catch(error){console.error('Failed to load route:',error.message);res.status(500).json({status:'ERROR',reason:'Failed to load route'});}});
app.get('/api/search',dbRateLimit,async(req,res)=>{
  if(!pool)return res.status(503).json({status:'UNAVAILABLE',results:[],reason:'Database is not configured'});
  const raw=String(req.query.q||'').trim();
  const like=searchPattern(raw);
  if(!like)return res.json({status:'OK',results:[]});
  const exactRoute=/^(?:AIR-)?\d+[A-Z0-9-]*$/i.test(raw)?raw.toUpperCase().replace(/^AIR-0+/,'AIR-'):null;
  try{
    const result=await pool.query(`
      WITH route_base AS (
        SELECT r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,
          CASE WHEN r.short_name IS NULL OR BTRIM(r.short_name)='' THEN BTRIM(COALESCE(r.long_name,''))
          ELSE REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(r.short_name),'(?:UP|DOWN|DWN)
          COALESCE(rc.stop_count,0) stop_count,start_stop.name from_stop,end_stop.name to_stop
        FROM routes r
        LEFT JOIN (SELECT route_id,COUNT(*) stop_count FROM route_stops GROUP BY route_id) rc ON rc.route_id=r.route_id
        LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.name,s.stop_id LIMIT 1) start_stop ON TRUE
        LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.name,s.stop_id LIMIT 1) end_stop ON TRUE
        WHERE COALESCE(r.short_name,'') ILIKE $1 OR COALESCE(r.long_name,'') ILIKE $1
      ),
      public_routes AS (
        SELECT *,from_stop AS public_from_stop,to_stop AS public_to_stop
        FROM route_base
      ),
      representative_routes AS (
        SELECT DISTINCT ON (UPPER(public_label),LOWER(public_from_stop),LOWER(public_to_stop))
          route_id,short_name,long_name,route_color,route_text_color,public_label,public_from_stop,public_to_stop
        FROM public_routes
        WHERE BTRIM(public_label)<>'' AND ($2::TEXT IS NULL OR UPPER(public_label)=$2)
        ORDER BY UPPER(public_label),LOWER(public_from_stop),LOWER(public_to_stop),stop_count DESC,route_id
      ),
      stop_matches AS (
        SELECT 'stop' type,stop_id id,name label,NULL::TEXT "fromStop",NULL::TEXT "toStop",NULL::TEXT "routeColor",NULL::TEXT "routeTextColor"
        FROM stops WHERE name ILIKE $1 ORDER BY name,stop_id LIMIT 30
      ),
      route_results AS (
        SELECT 'route' type,r.route_id id,r.public_label label,r.public_from_stop "fromStop",r.public_to_stop "toStop",r.route_color "routeColor",r.route_text_color "routeTextColor"
        FROM representative_routes r
      )
      SELECT type,id,label,"fromStop","toStop","routeColor","routeTextColor"
      FROM (
        SELECT type,id,label,"fromStop","toStop","routeColor","routeTextColor",0 result_order FROM route_results
        UNION ALL
        SELECT type,id,label,"fromStop","toStop","routeColor","routeTextColor",1 result_order FROM stop_matches
      ) combined
      ORDER BY result_order,label,"fromStop","toStop",id LIMIT 60
    `,[like,exactRoute]);
    res.json({status:'OK',results:result.rows});
  }catch(error){
    console.error('Failed to search transit data:',error.message);
    res.status(500).json({status:'ERROR',results:[],reason:'Search is temporarily unavailable'});
  }
});

app.get('/api/plan',dbRateLimit,async(req,res)=>{
  if(!pool)return res.status(503).json({status:'UNAVAILABLE',options:[],reason:'Database is not configured'});
  const from=boundedText(req.query.from,80),to=boundedText(req.query.to,80);
  const fromLike=searchPattern(from),toLike=searchPattern(to);
  if(!fromLike||!toLike)return res.status(400).json({status:'ERROR',options:[],reason:'Valid origin and destination are required'});
  if(fromLike.toLowerCase()===toLike.toLowerCase())return res.status(400).json({status:'ERROR',options:[],reason:'Choose two different stops or places'});
  try{
    const candidates=await pool.query(`
      WITH origin AS (
        SELECT stop_id,name,latitude,longitude,
               ROW_NUMBER() OVER (ORDER BY CASE WHEN LOWER(BTRIM(name))=LOWER($1) THEN 0 ELSE 1 END, name, stop_id) rn
        FROM stops WHERE name ILIKE $2 LIMIT 12
      ),
      destination AS (
        SELECT stop_id,name,latitude,longitude,
               ROW_NUMBER() OVER (ORDER BY CASE WHEN LOWER(BTRIM(name))=LOWER($3) THEN 0 ELSE 1 END, name, stop_id) rn
        FROM stops WHERE name ILIKE $4 LIMIT 12
      )
      SELECT 'origin' side,stop_id,name,latitude,longitude FROM origin
      UNION ALL
      SELECT 'destination' side,stop_id,name,latitude,longitude FROM destination
    `,[from,fromLike,to,toLike]);
    const origins=candidates.rows.filter(r=>r.side==='origin');
    const destinations=candidates.rows.filter(r=>r.side==='destination');
    if(!origins.length||!destinations.length)return res.status(404).json({status:'NOT_FOUND',origin:origins[0]||null,destination:destinations[0]||null,options:[],reason:'Could not find matching bus stops'});
    const same=origins.some(o=>destinations.some(d=>o.stop_id===d.stop_id));
    if(same)return res.status(400).json({status:'ERROR',origin:origins[0],destination:destinations[0],options:[],reason:'Origin and destination resolve to the same stop'});

    const originIds=origins.map(r=>r.stop_id),destinationIds=destinations.map(r=>r.stop_id);
    const direct=await pool.query(`
      SELECT DISTINCT ON (r.route_id,o.stop_id,d.stop_id)
        r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,
        o.stop_id from_stop_id,o.name from_stop,o.stop_sequence from_sequence,
        d.stop_id to_stop_id,d.name to_stop,d.stop_sequence to_sequence
      FROM route_stops o
      JOIN route_stops d ON d.route_id=o.route_id AND d.stop_sequence>o.stop_sequence
      JOIN routes r ON r.route_id=o.route_id
      JOIN stops os ON os.stop_id=o.stop_id
      JOIN stops ds ON ds.stop_id=d.stop_id
      WHERE o.stop_id=ANY($1::text[]) AND d.stop_id=ANY($2::text[])
      ORDER BY r.route_id,o.stop_id,d.stop_id,(d.stop_sequence-o.stop_sequence)
      LIMIT 20
    `,[originIds,destinationIds]);

    const transfers=await pool.query(`
      WITH origins AS (
        SELECT rs.route_id,rs.stop_id from_stop_id,rs.stop_sequence from_sequence,
               s.name from_stop,r.short_name route1_name,r.route_color route1_color,r.route_text_color route1_text_color
        FROM route_stops rs
        JOIN stops s ON s.stop_id=rs.stop_id
        JOIN routes r ON r.route_id=rs.route_id
        WHERE rs.stop_id=ANY($1::text[])
      ),
      first_legs AS (
        SELECT o.route_id,o.from_stop_id,o.from_sequence,o.from_stop,o.route1_name,o.route1_color,o.route1_text_color,
               t.stop_id transfer_stop_id,t.stop_sequence transfer_sequence,ts.name transfer_stop
        FROM origins o
        JOIN route_stops t ON t.route_id=o.route_id AND t.stop_sequence>o.from_sequence
        JOIN stops ts ON ts.stop_id=t.stop_id
      ),
      second_legs AS (
        SELECT f.*,t2.route_id route2_id,t2.stop_sequence transfer2_sequence,
               d.stop_id to_stop_id,d.stop_sequence to_sequence,ds.name to_stop,
               r2.short_name route2_name,r2.route_color route2_color,r2.route_text_color route2_text_color
        FROM first_legs f
        JOIN route_stops t2 ON t2.stop_id=f.transfer_stop_id AND t2.route_id<>f.route_id
        JOIN routes r2 ON r2.route_id=t2.route_id
        JOIN route_stops d ON d.route_id=t2.route_id AND d.stop_sequence>t2.stop_sequence
        JOIN stops ds ON ds.stop_id=d.stop_id
        WHERE d.stop_id=ANY($2::text[])
      )
      SELECT DISTINCT ON (route_id,route2_id,from_stop_id,to_stop_id,transfer_stop_id)
        route_id route1_id,route1_name,route1_color,route1_text_color,
        from_stop_id,from_stop,transfer_stop_id,transfer_stop,
        route2_id,route2_name,route2_color,route2_text_color,
        to_stop_id,to_stop,from_sequence,transfer_sequence,to_sequence
      FROM second_legs
      ORDER BY route_id,route2_id,from_stop_id,to_stop_id,transfer_stop_id,
               (transfer_sequence-from_sequence)+(to_sequence-transfer_sequence)
      LIMIT 20
    `,[originIds,destinationIds]);

    const options=[];
    for(const row of direct.rows){
      const hops=Math.max(1,Number(row.to_sequence)-Number(row.from_sequence));
      options.push({
        type:'direct',
        durationMinutes:Math.max(3,Math.ceil(hops*2.5)),
        walkingMinutes:0,
        legs:[{routeId:String(row.route_id),routeName:row.short_name||row.long_name||'Bus',routeColor:row.route_color,routeTextColor:row.route_text_color,fromStop:row.from_stop,toStop:row.to_stop,fromStopId:row.from_stop_id,toStopId:row.to_stop_id}]
      });
    }
    for(const row of transfers.rows){
      const firstHops=Math.max(1,Number(row.transfer_sequence)-Number(row.from_sequence));
      const secondHops=Math.max(1,Number(row.to_sequence)-Number(row.transfer_sequence));
      options.push({
        type:'one-transfer',
        durationMinutes:Math.max(8,Math.ceil((firstHops+secondHops)*2.5+5)),
        walkingMinutes:0,
        legs:[
          {routeId:String(row.route1_id),routeName:row.route1_name||'Bus',routeColor:row.route1_color,routeTextColor:row.route1_text_color,fromStop:row.from_stop,toStop:row.transfer_stop,fromStopId:row.from_stop_id,toStopId:row.transfer_stop_id},
          {routeId:String(row.route2_id),routeName:row.route2_name||'Bus',routeColor:row.route2_color,routeTextColor:row.route2_text_color,fromStop:row.transfer_stop,toStop:row.to_stop,fromStopId:row.transfer_stop_id,toStopId:row.to_stop_id}
        ],
        transferStop:row.transfer_stop
      });
    }
    const seen=new Set();
    const unique=options.filter(option=>{
      const key=option.type+'|'+option.legs.map(l=>l.routeId+':'+l.fromStopId+'>'+l.toStopId).join('|');
      if(seen.has(key))return false;
      seen.add(key);return true;
    }).sort((a,b)=>a.durationMinutes-b.durationMinutes).slice(0,5);
    const response={status:'OK',origin:{stop_id:origins[0].stop_id,name:origins[0].name,latitude:Number(origins[0].latitude),longitude:Number(origins[0].longitude)},destination:{stop_id:destinations[0].stop_id,name:destinations[0].name,latitude:Number(destinations[0].latitude),longitude:Number(destinations[0].longitude)},options:unique};
    if(!unique.length)response.reason='No direct or one-change bus journey was found';
    res.json(response);
  }catch(error){
    console.error('Failed to plan journey:',error.message);
    res.status(500).json({status:'ERROR',options:[],reason:'Journey planner is temporarily unavailable'});
  }
});

async function applyMigrations(){
  const fs=await import('node:fs/promises');
  const sqlDir=new URL('../sql/',import.meta.url);
  const files=(await fs.readdir(sqlDir)).filter(name=>/^\d+.*\.sql$/i.test(name)).sort();
  for(const name of files){
    const sql=await fs.readFile(new URL(name,sqlDir),'utf8');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='30000'");
      await client.query(sql);
      await client.query('COMMIT');
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      throw new Error('Migration '+name+' failed: '+(error instanceof Error?error.message:String(error)));
    }finally{client.release();}
  }
}
async function ensureStaticData(){if(!pool)return;await applyMigrations();const tables=await pool.query("SELECT to_regclass('public.stops') stops_table,to_regclass('public.routes') routes_table,to_regclass('public.route_stops') route_stops_table");const row=tables.rows[0];if(row.stops_table&&row.routes_table&&row.route_stops_table){const counts=(await pool.query('SELECT (SELECT COUNT(*) FROM stops) stops,(SELECT COUNT(*) FROM routes) routes,(SELECT COUNT(*) FROM route_stops) route_stops')).rows[0];if(Number(counts.stops)>=1000&&Number(counts.routes)>=500&&Number(counts.route_stops)>=10000)return;}console.log('Static GTFS data is missing/incomplete; starting fallback import...');await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/import-gtfs.js'],{cwd:process.cwd(),env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('GTFS import exited with code '+code)));});}
app.use((_req,res)=>res.status(404).json({status:'NOT_FOUND',reason:'Endpoint not found'}));
app.use((error,_req,res,_next)=>{
  console.error('Unhandled request error:',error instanceof Error?error.message:String(error));
  if(res.headersSent)return;
  res.status(500).json({status:'ERROR',reason:'Internal server error'});
});
const server=app.listen(port,()=>{
  console.log('United Delhi API listening on :'+port);
  void ensureStaticData().then(()=>startRealtimePolling()).catch(error=>{
    console.error('Static GTFS bootstrap failed:',error.message);
    startRealtimePolling();
  });
});
server.requestTimeout=15000;
server.headersTimeout=20000;
server.keepAliveTimeout=5000;
,'','i'),'^AIR-0+','AIR-','i') END public_label,
          COALESCE(rc.stop_count,0) stop_count,start_stop.name from_stop,end_stop.name to_stop
        FROM routes r
        LEFT JOIN (SELECT route_id,COUNT(*) stop_count FROM route_stops GROUP BY route_id) rc ON rc.route_id=r.route_id
        LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence ASC,s.name,s.stop_id LIMIT 1) start_stop ON TRUE
        LEFT JOIN LATERAL (SELECT s.name FROM route_stops rs JOIN stops s ON s.stop_id=rs.stop_id WHERE rs.route_id=r.route_id ORDER BY rs.stop_sequence DESC,s.name,s.stop_id LIMIT 1) end_stop ON TRUE
        WHERE COALESCE(r.short_name,'') ILIKE $1 OR COALESCE(r.long_name,'') ILIKE $1
      ),
      public_routes AS (
        SELECT *,from_stop AS public_from_stop,to_stop AS public_to_stop
        FROM route_base
      ),
      representative_routes AS (
        SELECT DISTINCT ON (UPPER(public_label),LOWER(public_from_stop),LOWER(public_to_stop))
          route_id,short_name,long_name,route_color,route_text_color,public_label,public_from_stop,public_to_stop
        FROM public_routes
        WHERE BTRIM(public_label)<>'' AND ($2::TEXT IS NULL OR UPPER(public_label)=$2)
        ORDER BY UPPER(public_label),LOWER(public_from_stop),LOWER(public_to_stop),stop_count DESC,route_id
      ),
      stop_matches AS (
        SELECT 'stop' type,stop_id id,name label,NULL::TEXT "fromStop",NULL::TEXT "toStop",NULL::TEXT "routeColor",NULL::TEXT "routeTextColor"
        FROM stops WHERE name ILIKE $1 ORDER BY name,stop_id LIMIT 30
      ),
      route_results AS (
        SELECT 'route' type,r.route_id id,r.public_label label,r.public_from_stop "fromStop",r.public_to_stop "toStop",r.route_color "routeColor",r.route_text_color "routeTextColor"
        FROM representative_routes r
      )
      SELECT type,id,label,"fromStop","toStop","routeColor","routeTextColor"
      FROM (
        SELECT type,id,label,"fromStop","toStop","routeColor","routeTextColor",0 result_order FROM route_results
        UNION ALL
        SELECT type,id,label,"fromStop","toStop","routeColor","routeTextColor",1 result_order FROM stop_matches
      ) combined
      ORDER BY result_order,label,"fromStop","toStop",id LIMIT 60
    `,[like,exactRoute]);
    res.json({status:'OK',results:result.rows});
  }catch(error){
    console.error('Failed to search transit data:',error.message);
    res.status(500).json({status:'ERROR',results:[],reason:'Search is temporarily unavailable'});
  }
});

app.get('/api/plan',dbRateLimit,async(req,res)=>{
  if(!pool)return res.status(503).json({status:'UNAVAILABLE',options:[],reason:'Database is not configured'});
  const from=boundedText(req.query.from,80),to=boundedText(req.query.to,80);
  const fromLike=searchPattern(from),toLike=searchPattern(to);
  if(!fromLike||!toLike)return res.status(400).json({status:'ERROR',options:[],reason:'Valid origin and destination are required'});
  if(fromLike.toLowerCase()===toLike.toLowerCase())return res.status(400).json({status:'ERROR',options:[],reason:'Choose two different stops or places'});
  try{
    const candidates=await pool.query(`
      WITH origin AS (
        SELECT stop_id,name,latitude,longitude,
               ROW_NUMBER() OVER (ORDER BY CASE WHEN LOWER(BTRIM(name))=LOWER($1) THEN 0 ELSE 1 END, name, stop_id) rn
        FROM stops WHERE name ILIKE $2 LIMIT 12
      ),
      destination AS (
        SELECT stop_id,name,latitude,longitude,
               ROW_NUMBER() OVER (ORDER BY CASE WHEN LOWER(BTRIM(name))=LOWER($3) THEN 0 ELSE 1 END, name, stop_id) rn
        FROM stops WHERE name ILIKE $4 LIMIT 12
      )
      SELECT 'origin' side,stop_id,name,latitude,longitude FROM origin
      UNION ALL
      SELECT 'destination' side,stop_id,name,latitude,longitude FROM destination
    `,[from,fromLike,to,toLike]);
    const origins=candidates.rows.filter(r=>r.side==='origin');
    const destinations=candidates.rows.filter(r=>r.side==='destination');
    if(!origins.length||!destinations.length)return res.status(404).json({status:'NOT_FOUND',origin:origins[0]||null,destination:destinations[0]||null,options:[],reason:'Could not find matching bus stops'});
    const same=origins.some(o=>destinations.some(d=>o.stop_id===d.stop_id));
    if(same)return res.status(400).json({status:'ERROR',origin:origins[0],destination:destinations[0],options:[],reason:'Origin and destination resolve to the same stop'});

    const originIds=origins.map(r=>r.stop_id),destinationIds=destinations.map(r=>r.stop_id);
    const direct=await pool.query(`
      SELECT DISTINCT ON (r.route_id,o.stop_id,d.stop_id)
        r.route_id,r.short_name,r.long_name,r.route_color,r.route_text_color,
        o.stop_id from_stop_id,o.name from_stop,o.stop_sequence from_sequence,
        d.stop_id to_stop_id,d.name to_stop,d.stop_sequence to_sequence
      FROM route_stops o
      JOIN route_stops d ON d.route_id=o.route_id AND d.stop_sequence>o.stop_sequence
      JOIN routes r ON r.route_id=o.route_id
      JOIN stops os ON os.stop_id=o.stop_id
      JOIN stops ds ON ds.stop_id=d.stop_id
      WHERE o.stop_id=ANY($1::text[]) AND d.stop_id=ANY($2::text[])
      ORDER BY r.route_id,o.stop_id,d.stop_id,(d.stop_sequence-o.stop_sequence)
      LIMIT 20
    `,[originIds,destinationIds]);

    const transfers=await pool.query(`
      WITH origins AS (
        SELECT rs.route_id,rs.stop_id from_stop_id,rs.stop_sequence from_sequence,
               s.name from_stop,r.short_name route1_name,r.route_color route1_color,r.route_text_color route1_text_color
        FROM route_stops rs
        JOIN stops s ON s.stop_id=rs.stop_id
        JOIN routes r ON r.route_id=rs.route_id
        WHERE rs.stop_id=ANY($1::text[])
      ),
      first_legs AS (
        SELECT o.route_id,o.from_stop_id,o.from_sequence,o.from_stop,o.route1_name,o.route1_color,o.route1_text_color,
               t.stop_id transfer_stop_id,t.stop_sequence transfer_sequence,ts.name transfer_stop
        FROM origins o
        JOIN route_stops t ON t.route_id=o.route_id AND t.stop_sequence>o.from_sequence
        JOIN stops ts ON ts.stop_id=t.stop_id
      ),
      second_legs AS (
        SELECT f.*,t2.route_id route2_id,t2.stop_sequence transfer2_sequence,
               d.stop_id to_stop_id,d.stop_sequence to_sequence,ds.name to_stop,
               r2.short_name route2_name,r2.route_color route2_color,r2.route_text_color route2_text_color
        FROM first_legs f
        JOIN route_stops t2 ON t2.stop_id=f.transfer_stop_id AND t2.route_id<>f.route_id
        JOIN routes r2 ON r2.route_id=t2.route_id
        JOIN route_stops d ON d.route_id=t2.route_id AND d.stop_sequence>t2.stop_sequence
        JOIN stops ds ON ds.stop_id=d.stop_id
        WHERE d.stop_id=ANY($2::text[])
      )
      SELECT DISTINCT ON (route_id,route2_id,from_stop_id,to_stop_id,transfer_stop_id)
        route_id route1_id,route1_name,route1_color,route1_text_color,
        from_stop_id,from_stop,transfer_stop_id,transfer_stop,
        route2_id,route2_name,route2_color,route2_text_color,
        to_stop_id,to_stop,from_sequence,transfer_sequence,to_sequence
      FROM second_legs
      ORDER BY route_id,route2_id,from_stop_id,to_stop_id,transfer_stop_id,
               (transfer_sequence-from_sequence)+(to_sequence-transfer_sequence)
      LIMIT 20
    `,[originIds,destinationIds]);

    const options=[];
    for(const row of direct.rows){
      const hops=Math.max(1,Number(row.to_sequence)-Number(row.from_sequence));
      options.push({
        type:'direct',
        durationMinutes:Math.max(3,Math.ceil(hops*2.5)),
        walkingMinutes:0,
        legs:[{routeId:String(row.route_id),routeName:row.short_name||row.long_name||'Bus',routeColor:row.route_color,routeTextColor:row.route_text_color,fromStop:row.from_stop,toStop:row.to_stop,fromStopId:row.from_stop_id,toStopId:row.to_stop_id}]
      });
    }
    for(const row of transfers.rows){
      const firstHops=Math.max(1,Number(row.transfer_sequence)-Number(row.from_sequence));
      const secondHops=Math.max(1,Number(row.to_sequence)-Number(row.transfer_sequence));
      options.push({
        type:'one-transfer',
        durationMinutes:Math.max(8,Math.ceil((firstHops+secondHops)*2.5+5)),
        walkingMinutes:0,
        legs:[
          {routeId:String(row.route1_id),routeName:row.route1_name||'Bus',routeColor:row.route1_color,routeTextColor:row.route1_text_color,fromStop:row.from_stop,toStop:row.transfer_stop,fromStopId:row.from_stop_id,toStopId:row.transfer_stop_id},
          {routeId:String(row.route2_id),routeName:row.route2_name||'Bus',routeColor:row.route2_color,routeTextColor:row.route2_text_color,fromStop:row.transfer_stop,toStop:row.to_stop,fromStopId:row.transfer_stop_id,toStopId:row.to_stop_id}
        ],
        transferStop:row.transfer_stop
      });
    }
    const seen=new Set();
    const unique=options.filter(option=>{
      const key=option.type+'|'+option.legs.map(l=>l.routeId+':'+l.fromStopId+'>'+l.toStopId).join('|');
      if(seen.has(key))return false;
      seen.add(key);return true;
    }).sort((a,b)=>a.durationMinutes-b.durationMinutes).slice(0,5);
    const response={status:'OK',origin:{stop_id:origins[0].stop_id,name:origins[0].name,latitude:Number(origins[0].latitude),longitude:Number(origins[0].longitude)},destination:{stop_id:destinations[0].stop_id,name:destinations[0].name,latitude:Number(destinations[0].latitude),longitude:Number(destinations[0].longitude)},options:unique};
    if(!unique.length)response.reason='No direct or one-change bus journey was found';
    res.json(response);
  }catch(error){
    console.error('Failed to plan journey:',error.message);
    res.status(500).json({status:'ERROR',options:[],reason:'Journey planner is temporarily unavailable'});
  }
});

async function applyMigrations(){
  const fs=await import('node:fs/promises');
  const sqlDir=new URL('../sql/',import.meta.url);
  const files=(await fs.readdir(sqlDir)).filter(name=>/^\d+.*\.sql$/i.test(name)).sort();
  for(const name of files){
    const sql=await fs.readFile(new URL(name,sqlDir),'utf8');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='30000'");
      await client.query(sql);
      await client.query('COMMIT');
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      throw new Error('Migration '+name+' failed: '+(error instanceof Error?error.message:String(error)));
    }finally{client.release();}
  }
}
async function ensureStaticData(){if(!pool)return;await applyMigrations();const tables=await pool.query("SELECT to_regclass('public.stops') stops_table,to_regclass('public.routes') routes_table,to_regclass('public.route_stops') route_stops_table");const row=tables.rows[0];if(row.stops_table&&row.routes_table&&row.route_stops_table){const counts=(await pool.query('SELECT (SELECT COUNT(*) FROM stops) stops,(SELECT COUNT(*) FROM routes) routes,(SELECT COUNT(*) FROM route_stops) route_stops')).rows[0];if(Number(counts.stops)>=1000&&Number(counts.routes)>=500&&Number(counts.route_stops)>=10000)return;}console.log('Static GTFS data is missing/incomplete; starting fallback import...');await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/import-gtfs.js'],{cwd:process.cwd(),env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('GTFS import exited with code '+code)));});}
app.use((_req,res)=>res.status(404).json({status:'NOT_FOUND',reason:'Endpoint not found'}));
app.use((error,_req,res,_next)=>{
  console.error('Unhandled request error:',error instanceof Error?error.message:String(error));
  if(res.headersSent)return;
  res.status(500).json({status:'ERROR',reason:'Internal server error'});
});
const server=app.listen(port,()=>{
  console.log('United Delhi API listening on :'+port);
  void ensureStaticData().then(()=>startRealtimePolling()).catch(error=>{
    console.error('Static GTFS bootstrap failed:',error.message);
    startRealtimePolling();
  });
});
server.requestTimeout=15000;
server.headersTimeout=20000;
server.keepAliveTimeout=5000;
