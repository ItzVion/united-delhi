import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { sha256Hex, sourceWithSha256, sourceHasSha256, inspectGtfsServiceCoverage } from './gtfs-feed-utils.js';

const execFileAsync=promisify(execFile);
const URL=String(process.env.METRO_STATIC_URL||'').trim();
const STATIC_FILE=String(process.env.METRO_STATIC_FILE||'').trim();
const SOURCE_KEY=String(process.env.METRO_STATIC_SOURCE_KEY||'uploaded-dmrc-static-local-v1-20261013').trim();
let syncRunning=false;

function csv(text){
  const out=[],row=[];let cell='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];
    if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell=''}
    else if(ch==='\n'){row.push(cell);out.push(row.splice(0));cell=''}
    else if(ch!=='\r')cell+=ch;
  }
  if(cell.length||row.length){row.push(cell);out.push(row)}
  const head=out.shift()||[];
  return out.filter(r=>r.length).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
}
const esc=v=>String(v??'').trim();
const num=v=>Number(v);

async function unzipFeed(buf,dir){
  const zip=path.join(dir,'dmrc.zip');
  await fs.writeFile(zip,buf);
  await execFileAsync('unzip',['-oq',zip,'-d',dir],{timeout:60000});
  const files=await fs.readdir(dir,{recursive:true});
  const pick=n=>files.find(x=>path.basename(String(x)).toLowerCase()===n);
  const read=async n=>{const f=pick(n);if(!f)return [];return csv(await fs.readFile(path.join(dir,String(f)),'utf8'))};
  return {agency:await read('agency.txt'),routes:await read('routes.txt'),stops:await read('stops.txt'),trips:await read('trips.txt'),stopTimes:await read('stop_times.txt'),calendar:await read('calendar.txt'),calendarDates:await read('calendar_dates.txt')};
}

export async function syncMetroStatic(pool,{allowReplacement=false}={}){
  if(!pool)return {ok:false,reason:'Database is not configured'};
  if(syncRunning)return {ok:false,reason:'A Metro static sync is already running'};
  syncRunning=true;
  let dir=null;
  try{
    // Allocate inside the protected try/finally so a temp-directory failure
    // never leaves the module-level mutex stuck in the running state.
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'united-delhi-dmrc-'));
    let body,sourceUrl=URL;
    if(STATIC_FILE){
      try{
        const stat=await fs.stat(STATIC_FILE);
        if(!stat.isFile()||stat.size<=0)throw new Error('Configured file is empty or is not a regular file');
        body=await fs.readFile(STATIC_FILE);
        sourceUrl='local-file:'+path.resolve(STATIC_FILE);
      }catch(error){
        throw new Error('Local DMRC static ZIP failed: '+(error?.message||error));
      }
    }else{
      if(!URL)throw new Error('Set METRO_STATIC_FILE to a local GTFS ZIP or METRO_STATIC_URL to an explicit ZIP URL.');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
      try{
        const response=await fetch(URL,{headers:{accept:'application/zip','user-agent':'United-Delhi/2.0'},signal:controller.signal});
        if(!response.ok)throw new Error('DMRC static ZIP HTTP '+response.status);
        body=Buffer.from(await response.arrayBuffer());
      }finally{clearTimeout(timer)}
    }
    if(!Buffer.isBuffer(body)||!body.slice(0,2).equals(Buffer.from([0x50,0x4b])))throw new Error('DMRC static source is not a ZIP archive');
    const archiveHash=sha256Hex(body);
    sourceUrl=sourceWithSha256(sourceUrl,archiveHash);
    const feed=await unzipFeed(body,dir);
    if(!feed.routes.length||!feed.stops.length||!feed.trips.length||!feed.stopTimes.length)throw new Error('DMRC feed is missing required GTFS files');

    const coverage=inspectGtfsServiceCoverage({calendarRows:feed.calendar,calendarDateRows:feed.calendarDates});
    console.log('DMRC GTFS service calendar ('+coverage.today+' Asia/Kolkata): '+(coverage.calendarStartDate||'unknown')+' through '+(coverage.calendarEndDate||'unknown')+'; status='+coverage.status+'; service today='+coverage.hasServiceToday+'; invalid calendar rows='+(coverage.invalidBaseRows+coverage.invalidExceptionRows)+'.');
    if(coverage.status==='expired'||!coverage.hasServiceToday||coverage.invalidBaseRows||coverage.invalidExceptionRows){
      console.warn('DMRC static feed calendar is expired, inactive today, or invalid. Route topology can still be useful, but this feed must not be presented as a verified current timetable.');
    }

    const tableNames=['metro_routes','metro_stops','metro_route_stops'];
    const tables=new Set((await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[tableNames])).rows.map(row=>row.table_name));
    const actual={routes:0,stops:0,routeStops:0};
    for(const [table,key] of [['metro_routes','routes'],['metro_stops','stops'],['metro_route_stops','routeStops']]){
      if(tables.has(table)){
        actual[key]=Number((await pool.query('SELECT COUNT(*)::int AS count FROM '+table)).rows[0]?.count)||0;
      }
    }
    const meta=(await pool.query('SELECT source_key,source_url,route_count,stop_count,route_stop_count FROM metro_feed_meta WHERE id=1').catch(()=>({rows:[]}))).rows[0]||null;
    const countsMatch=meta
      &&actual.routes===Number(meta.route_count)
      &&actual.stops===Number(meta.stop_count)
      &&actual.routeStops===Number(meta.route_stop_count);
    if(meta?.source_key===SOURCE_KEY&&sourceHasSha256(meta.source_url,archiveHash)&&countsMatch&&actual.routes>=18&&actual.stops>=260){
      console.log('DMRC archive SHA-256 and static counts match the database; no import is needed.');
      return {ok:true,unchanged:true,routes:actual.routes,stops:actual.stops,routeStops:actual.routeStops};
    }
    const populated=actual.routes>0||actual.stops>0||actual.routeStops>0;
    if(populated&&!allowReplacement){
      const reason='Automatic DMRC replacement suppressed: the populated database has no matching archive SHA-256 fingerprint, or its actual counts differ from metadata. Existing metro data is preserved. Review the feed and backups, then run the explicit reviewed metro sync command if replacement is approved.';
      console.warn(reason);
      return {ok:true,unchanged:true,requiresApproval:true,reason,routes:actual.routes,stops:actual.stops,routeStops:actual.routeStops};
    }

    // The supplied feed stores opposite directions as separate GTFS routes
    // whose route_short_name values pair as CODE and CODE_R. Group those two
    // direction-specific routes into one readable line while retaining the
    // original stop order for each direction.
    const rawRouteById=new Map(feed.routes.map(x=>[esc(x.route_id),x]));
    const rawRouteByShort=new Map(feed.routes.map(x=>[esc(x.route_short_name),x]).filter(([short,x])=>short&&x));
    const groupedRoutes=[],rawRouteToGroup=new Map();
    const lineNames={RED:'Red Line',YELLOW:'Yellow Line',BLUE:'Blue Line',GREEN:'Green Line',VIOLET:'Violet Line',MAGENTA:'Magenta Line',PINK:'Pink Line',GRAY:'Grey Line',RAPID:'Rapid Metro',AQUA:'Noida Aqua Line','ORANGE/AIRPORT':'Airport Express'};
    const lineColors={RED:'D83B3B',YELLOW:'E5B12C',BLUE:'2F63B7',GREEN:'2F9B62',VIOLET:'7A4FB5',MAGENTA:'B044A6',PINK:'D65A9A',GRAY:'6B7280',RAPID:'3A8D8D',AQUA:'159A9C','ORANGE/AIRPORT':'E06B2C'};
    for(const [short,baseRoute] of rawRouteByShort){
      if(short.endsWith('_R'))continue;
      const reverse=rawRouteByShort.get(short+'_R');
      if(!reverse)continue;
      const routeId='Metro_'+short;
      const prefix=esc(baseRoute.route_long_name).split('_',1)[0].toUpperCase();
      const lineName=lineNames[prefix]||prefix||'Metro Line';
      const detail=esc(baseRoute.route_long_name).split('_').slice(1).join('_').trim();
      groupedRoutes.push({route_id:routeId,agency_id:esc(baseRoute.agency_id)||esc(feed.agency[0]?.agency_id)||'DMRC',short_name:lineName,long_name:lineName+(detail?' · '+detail:''),route_type:num(baseRoute.route_type)||1,route_color:lineColors[prefix]||null,route_text_color:'FFFFFF'});
      rawRouteToGroup.set(esc(baseRoute.route_id),{routeId,directionId:0});
      rawRouteToGroup.set(esc(reverse.route_id),{routeId,directionId:1});
    }
    if(groupedRoutes.length<15)throw new Error('DMRC feed did not contain the expected paired directional routes');
    const tripById=new Map(feed.trips.map(x=>[esc(x.trip_id),x]));
    const stopsByTrip=new Map();
    for(const x of feed.stopTimes){
      const tripId=esc(x.trip_id),trip=tripById.get(tripId),rawRoute=rawRouteById.get(esc(trip?.route_id));
      const mapped=rawRouteToGroup.get(esc(rawRoute?.route_id)),stopId=esc(x.stop_id),seq=num(x.stop_sequence);
      if(!tripId||!mapped||!stopId||!Number.isFinite(seq))continue;
      const bucket=stopsByTrip.get(tripId)||[];
      bucket.push({routeId:mapped.routeId,directionId:mapped.directionId,stopId,seq});
      stopsByTrip.set(tripId,bucket);
    }
    const candidatesByDirection=new Map(),seenPatterns=new Set();
    for(const [tripId,tripStops] of stopsByTrip){
      tripStops.sort((a,b)=>a.seq-b.seq);
      const ordered=tripStops.filter((x,i,a)=>i===0||x.seq!==a[i-1].seq);
      if(ordered.length<2)continue;
      const directionId=ordered[0].directionId;
      const routeId=ordered[0].routeId,key=routeId+'|'+directionId;
      const signature=key+'|'+ordered.map(x=>x.stopId).join('>');
      if(seenPatterns.has(signature))continue;
      seenPatterns.add(signature);
      const bucket=candidatesByDirection.get(key)||[];
      bucket.push({routeId,directionId,stops:ordered});
      candidatesByDirection.set(key,bucket);
    }

    // Some feeds split one direction into adjacent trip fragments rather than
    // publishing a single end-to-end trip (the Aqua Line is one example).
    // Start with the longest pattern and join contiguous overlaps or fragments
    // whose endpoints are physically adjacent, avoiding duplicate stations.
    const stopCoords=new Map(feed.stops.map(s=>[esc(s.stop_id),{lat:num(s.stop_lat),lon:num(s.stop_lon)}]));
    const distanceMeters=(left,right)=>{
      const a=stopCoords.get(left),b=stopCoords.get(right);
      if(!a||!b||![a.lat,a.lon,b.lat,b.lon].every(Number.isFinite))return Infinity;
      const rad=n=>n*Math.PI/180,dl=rad(b.lat-a.lat),dn=rad(b.lon-a.lon);
      const h=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;
      return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
    };
    const routeStops=[];
    for(const candidates of candidatesByDirection.values()){
      candidates.sort((a,b)=>b.stops.length-a.stops.length);
      let path=candidates[0].stops.map((x,i)=>({...x,seq:i}));
      const pending=candidates.slice(1);
      let changed=true;
      while(changed&&pending.length){
        changed=false;
        const inPath=new Set(path.map(x=>x.stopId));
        for(let i=0;i<pending.length;i++){
          const fragment=pending[i].stops;
          if(fragment.every(x=>inPath.has(x.stopId))){pending.splice(i,1);changed=true;break;}
          const max=Math.min(path.length,fragment.length);
          let overlapLeft=0,overlapRight=0;
          for(let k=1;k<=max;k++){
            if(fragment.slice(-k).every((x,j)=>x.stopId===path[j].stopId))overlapLeft=k;
            if(path.slice(-k).every((x,j)=>x.stopId===fragment[j].stopId))overlapRight=k;
          }
          if(overlapLeft){
            path=[...fragment.slice(0,-overlapLeft),...path];
          }else if(overlapRight){
            path=[...path,...fragment.slice(overlapRight)];
          }else{
            const attachLeft=distanceMeters(fragment[fragment.length-1].stopId,path[0].stopId);
            const attachRight=distanceMeters(path[path.length-1].stopId,fragment[0].stopId);
            if(Math.min(attachLeft,attachRight)>2500)continue;
            path=attachLeft<=attachRight?[...fragment,...path]:[...path,...fragment];
          }
          path=path.map((x,seq)=>({...x,seq}));
          pending.splice(i,1);
          changed=true;
          break;
        }
      }
      const directionId=candidates[0].directionId;
      for(const [seq,x] of path.entries())routeStops.push({...x,seq,directionId});
    }
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query(`CREATE TABLE IF NOT EXISTS metro_routes(route_id TEXT PRIMARY KEY,agency_id TEXT,short_name TEXT,long_name TEXT,route_type INTEGER,route_color TEXT,route_text_color TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE TABLE IF NOT EXISTS metro_stops(stop_id TEXT PRIMARY KEY,name TEXT NOT NULL,latitude DOUBLE PRECISION NOT NULL,longitude DOUBLE PRECISION NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE TABLE IF NOT EXISTS metro_route_stops(route_id TEXT NOT NULL REFERENCES metro_routes(route_id) ON DELETE CASCADE,direction_id INTEGER NOT NULL DEFAULT 0,stop_id TEXT NOT NULL REFERENCES metro_stops(stop_id) ON DELETE CASCADE,stop_sequence INTEGER NOT NULL,PRIMARY KEY(route_id,direction_id,stop_id,stop_sequence))`);
      await c.query('ALTER TABLE metro_route_stops ADD COLUMN IF NOT EXISTS direction_id INTEGER NOT NULL DEFAULT 0');
      await c.query('ALTER TABLE metro_route_stops DROP CONSTRAINT IF EXISTS metro_route_stops_pkey');
      await c.query('ALTER TABLE metro_route_stops ADD CONSTRAINT metro_route_stops_pkey PRIMARY KEY(route_id,direction_id,stop_id,stop_sequence)');
      await c.query(`CREATE TABLE IF NOT EXISTS metro_feed_meta(id INTEGER PRIMARY KEY CHECK(id=1),source_url TEXT NOT NULL,source_key TEXT NOT NULL,imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),route_count INTEGER NOT NULL DEFAULT 0,stop_count INTEGER NOT NULL DEFAULT 0,route_stop_count INTEGER NOT NULL DEFAULT 0)`);
      await c.query('TRUNCATE metro_route_stops,metro_routes,metro_stops');
      for(let i=0;i<groupedRoutes.length;i+=300){
        const chunk=groupedRoutes.slice(i,i+300),vals=[];
        const sql=chunk.map((x,j)=>{const b=j*7;vals.push(x.route_id,x.agency_id,x.short_name,x.long_name,x.route_type,x.route_color,x.route_text_color);return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},NOW())`}).join(',');
        await c.query(`INSERT INTO metro_routes(route_id,agency_id,short_name,long_name,route_type,route_color,route_text_color,updated_at) VALUES ${sql}`,vals);
      }
      for(let i=0;i<feed.stops.length;i+=500){
        const chunk=feed.stops.slice(i,i+500).filter(x=>esc(x.stop_id)&&esc(x.stop_name)&&Number.isFinite(num(x.stop_lat))&&Number.isFinite(num(x.stop_lon))),vals=[];
        const sql=chunk.map((x,j)=>{const b=j*4;vals.push(esc(x.stop_id),esc(x.stop_name),num(x.stop_lat),num(x.stop_lon));return `($${b+1},$${b+2},$${b+3},$${b+4},NOW())`}).join(',');
        if(sql)await c.query(`INSERT INTO metro_stops(stop_id,name,latitude,longitude,updated_at) VALUES ${sql}`,vals);
      }
      const knownRoutes=new Set(groupedRoutes.map(x=>x.route_id));
      const knownStops=new Set(feed.stops.map(x=>esc(x.stop_id)));
      const valid=routeStops.filter(x=>knownRoutes.has(x.routeId)&&knownStops.has(x.stopId));
      for(let i=0;i<valid.length;i+=500){
        const chunk=valid.slice(i,i+500),vals=[];
        const sql=chunk.map((x,j)=>{const b=j*4;vals.push(x.routeId,x.directionId,x.stopId,x.seq);return `($${b+1},$${b+2},$${b+3},$${b+4})`}).join(',');
        await c.query(`INSERT INTO metro_route_stops(route_id,direction_id,stop_id,stop_sequence) VALUES ${sql} ON CONFLICT DO NOTHING`,vals);
      }
      await c.query('CREATE INDEX IF NOT EXISTS idx_metro_stops_name ON metro_stops(lower(name))');
      await c.query('CREATE INDEX IF NOT EXISTS idx_metro_route_stops_stop ON metro_route_stops(stop_id,stop_sequence)');
      await c.query('CREATE INDEX IF NOT EXISTS idx_metro_route_stops_route ON metro_route_stops(route_id,stop_sequence)');
      await c.query('CREATE INDEX IF NOT EXISTS idx_metro_route_stops_route_dir ON metro_route_stops(route_id,direction_id,stop_sequence)');
      await c.query('INSERT INTO metro_feed_meta(id,source_url,source_key,imported_at,route_count,stop_count,route_stop_count) VALUES(1,$1,$2,NOW(),$3,$4,$5) ON CONFLICT(id) DO UPDATE SET source_url=EXCLUDED.source_url,source_key=EXCLUDED.source_key,imported_at=EXCLUDED.imported_at,route_count=EXCLUDED.route_count,stop_count=EXCLUDED.stop_count,route_stop_count=EXCLUDED.route_stop_count',[sourceUrl,SOURCE_KEY,groupedRoutes.length,feed.stops.length,valid.length]);
      await c.query('COMMIT');
      console.log('DMRC static sync complete: '+feed.routes.length+' routes, '+feed.stops.length+' stops, '+valid.length+' route-stop links.');
      return {ok:true,routes:groupedRoutes.length,stops:feed.stops.length,routeStops:valid.length};
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  }finally{
    syncRunning=false;
    if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
