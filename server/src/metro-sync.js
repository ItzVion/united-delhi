import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const URL='https://otd.delhi.gov.in/data/staticDMRC/';
const TOKEN='1'.repeat(64);

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
  return {agency:await read('agency.txt'),routes:await read('routes.txt'),stops:await read('stops.txt'),trips:await read('trips.txt'),stopTimes:await read('stop_times.txt'),calendar:await read('calendar.txt')};
}

export async function syncMetroStatic(pool){
  if(!pool)return {ok:false,reason:'Database is not configured'};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'united-delhi-dmrc-'));
  try{
    let body=null,sourceUrl=URL,lastError=null;
    for(const candidate of [URL,'https://ethanc8.github.io/delhi-gtfs/metro.zip']){
      try{
        if(candidate===URL){
          const page=await fetch(URL,{method:'GET',headers:{accept:'text/html','user-agent':'United-Delhi/2.0'},signal:controller.signal});
          if(!page.ok)throw new Error('Static page HTTP '+page.status);
          const html=await page.text();
          const cookie=(page.headers.get('set-cookie')||'').match(/csrftoken=([^;]+)/)?.[1]||TOKEN;
          const token=html.match(/name=[\"']csrfmiddlewaretoken[\"'][^>]*value=[\"']([^\"']+)/i)?.[1]||html.match(/value=[\"']([^\"']+)[\"'][^>]*name=[\"']csrfmiddlewaretoken[\"']/i)?.[1]||cookie;
          const form=new FormData();form.append('csrfmiddlewaretoken',token);form.append('usage_type','non-commercial');form.append('usageType','Non-Commercial');form.append('purpose','academia');form.append('agree','on');form.append('terms','on');form.append('download','1');
          const response=await fetch(URL,{method:'POST',headers:{cookie:'csrftoken='+cookie,referer:URL,'user-agent':'United-Delhi/2.0'},body:form,signal:controller.signal});
          if(!response.ok)throw new Error('DMRC static download HTTP '+response.status);
          body=Buffer.from(await response.arrayBuffer());
        }else{
          const response=await fetch(candidate,{headers:{accept:'application/zip','user-agent':'United-Delhi/2.0'},signal:controller.signal});
          if(!response.ok)throw new Error('Metro fallback HTTP '+response.status);
          body=Buffer.from(await response.arrayBuffer());
        }
        if(body.slice(0,2).equals(Buffer.from([0x50,0x4b]))){sourceUrl=candidate;break}
        throw new Error('Response was not a ZIP');
      }catch(e){lastError=e}
    }
    if(!body||!body.slice(0,2).equals(Buffer.from([0x50,0x4b])))throw new Error('DMRC static download failed: '+(lastError?.message||'unknown error'));
    const feed=await unzipFeed(body,dir);
    if(!feed.routes.length||!feed.stops.length||!feed.trips.length||!feed.stopTimes.length)throw new Error('DMRC feed is missing required GTFS files');

    const tripRoute=new Map(feed.trips.map(x=>[esc(x.trip_id),esc(x.route_id)]));
    const routeStops=new Map();
    for(const x of feed.stopTimes){
      const routeId=tripRoute.get(esc(x.trip_id));const stopId=esc(x.stop_id);const seq=num(x.stop_sequence);
      if(!routeId||!stopId||!Number.isFinite(seq))continue;
      const key=routeId+'|'+stopId+'|'+seq;
      routeStops.set(key,{routeId,stopId,seq});
    }
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query(`CREATE TABLE IF NOT EXISTS metro_routes(route_id TEXT PRIMARY KEY,agency_id TEXT,short_name TEXT,long_name TEXT,route_type INTEGER,route_color TEXT,route_text_color TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE TABLE IF NOT EXISTS metro_stops(stop_id TEXT PRIMARY KEY,name TEXT NOT NULL,latitude DOUBLE PRECISION NOT NULL,longitude DOUBLE PRECISION NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE TABLE IF NOT EXISTS metro_route_stops(route_id TEXT NOT NULL REFERENCES metro_routes(route_id) ON DELETE CASCADE,stop_id TEXT NOT NULL REFERENCES metro_stops(stop_id) ON DELETE CASCADE,stop_sequence INTEGER NOT NULL,PRIMARY KEY(route_id,stop_id,stop_sequence))`);
      await c.query(`CREATE TABLE IF NOT EXISTS metro_feed_meta(id INTEGER PRIMARY KEY CHECK(id=1),source_url TEXT NOT NULL,source_key TEXT NOT NULL,imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),route_count INTEGER NOT NULL DEFAULT 0,stop_count INTEGER NOT NULL DEFAULT 0,route_stop_count INTEGER NOT NULL DEFAULT 0)`);
      await c.query('TRUNCATE metro_route_stops,metro_routes,metro_stops');
      for(let i=0;i<feed.routes.length;i+=300){
        const chunk=feed.routes.slice(i,i+300),vals=[];
        const sql=chunk.map((x,j)=>{const b=j*7;vals.push(esc(x.route_id),esc(x.agency_id)||null,esc(x.route_short_name)||null,esc(x.route_long_name)||null,num(x.route_type)||0,esc(x.route_color)||null,esc(x.route_text_color)||null);return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},NOW())`}).join(',');
        await c.query(`INSERT INTO metro_routes(route_id,agency_id,short_name,long_name,route_type,route_color,route_text_color,updated_at) VALUES ${sql}`,vals);
      }
      for(let i=0;i<feed.stops.length;i+=500){
        const chunk=feed.stops.slice(i,i+500).filter(x=>esc(x.stop_id)&&esc(x.stop_name)&&Number.isFinite(num(x.stop_lat))&&Number.isFinite(num(x.stop_lon))),vals=[];
        const sql=chunk.map((x,j)=>{const b=j*4;vals.push(esc(x.stop_id),esc(x.stop_name),num(x.stop_lat),num(x.stop_lon));return `($${b+1},$${b+2},$${b+3},$${b+4},NOW())`}).join(',');
        if(sql)await c.query(`INSERT INTO metro_stops(stop_id,name,latitude,longitude,updated_at) VALUES ${sql}`,vals);
      }
      const valid=[...routeStops.values()];
      for(let i=0;i<valid.length;i+=500){
        const chunk=valid.slice(i,i+500),vals=[];
        const sql=chunk.map((x,j)=>{const b=j*3;vals.push(x.routeId,x.stopId,x.seq);return `($${b+1},$${b+2},$${b+3})`}).join(',');
        await c.query(`INSERT INTO metro_route_stops(route_id,stop_id,stop_sequence) VALUES ${sql} ON CONFLICT DO NOTHING`,vals);
      }
      await c.query('CREATE INDEX IF NOT EXISTS idx_metro_stops_name ON metro_stops(lower(name))');
      await c.query('CREATE INDEX IF NOT EXISTS idx_metro_route_stops_stop ON metro_route_stops(stop_id,stop_sequence)');
      await c.query('CREATE INDEX IF NOT EXISTS idx_metro_route_stops_route ON metro_route_stops(route_id,stop_sequence)');
      await c.query('INSERT INTO metro_feed_meta(id,source_url,source_key,imported_at,route_count,stop_count,route_stop_count) VALUES(1,$1,$2,NOW(),$3,$4,$5) ON CONFLICT(id) DO UPDATE SET source_url=EXCLUDED.source_url,source_key=EXCLUDED.source_key,imported_at=EXCLUDED.imported_at,route_count=EXCLUDED.route_count,stop_count=EXCLUDED.stop_count,route_stop_count=EXCLUDED.route_stop_count',[sourceUrl,'official-dmrc-gtfs',feed.routes.length,feed.stops.length,valid.length]);
      await c.query('COMMIT');
      console.log('DMRC static sync complete: '+feed.routes.length+' routes, '+feed.stops.length+' stops, '+valid.length+' route-stop links.');
      return {ok:true,routes:feed.routes.length,stops:feed.stops.length,routeStops:valid.length};
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  }finally{
    clearTimeout(timer);
    await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
