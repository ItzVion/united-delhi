import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {brotliDecompressSync} from 'node:zlib';

const execFileAsync=promisify(execFile);
const OTD_URL='https://otd.delhi.gov.in/data/static/';
const OTD_DIRECT_URL='https://otd.delhi.gov.in/data/staticDMRC/';
const ETHAN_URL='https://ethanc8.github.io/delhi-gtfs/bus.zip';
const MOBILITY_URL='https://files.mobilitydatabase.org/mdb-1262/mdb-1262-202506170152/mdb-1262-202506170152.zip';
const BUNDLED_DIR=path.resolve(process.cwd(),'data','dtc-static-v1');
const BUNDLED_SOURCE='uploaded-delhi_buses_static_gtfs_v1-2.zip';

const csv=text=>{
 const out=[],row=[];let cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];
  if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}
  else if(ch==='"')quoted=true;
  else if(ch===','){row.push(cell);cell=''}
  else if(ch==='\n'){row.push(cell);out.push(row.splice(0));cell=''}
  else if(ch!=='\r')cell+=ch;
 }
 if(cell.length||row.length){row.push(cell);out.push(row)}
 const head=out.shift()||[];
 return out.filter(r=>r.length).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
};
const esc=v=>String(v??'').trim();
const num=v=>Number(v);

async function unzipFeed(buf,dir){
 await fs.mkdir(dir,{recursive:true});
 const zip=path.join(dir,'dtc.zip');
 await fs.writeFile(zip,buf);
 await execFileAsync('unzip',['-oq',zip,'-d',dir],{timeout:60000});
 const files=await fs.readdir(dir,{recursive:true});
 const pick=n=>files.find(x=>path.basename(String(x)).toLowerCase()===n);
 const read=async n=>{const f=pick(n);if(!f)return[];return csv(await fs.readFile(path.join(dir,String(f)),'utf8'))};
 const stopTimesRel=pick('stop_times.txt');
 return{routes:await read('routes.txt'),stops:await read('stops.txt'),trips:await read('trips.txt'),stopTimesFile:stopTimesRel?path.join(dir,String(stopTimesRel)):null,feedInfo:await read('feed_info.txt')};
}

async function readBundled(){
 const files=await fs.readdir(BUNDLED_DIR).catch(()=>[]);
 const parts=files.filter(x=>/^part-\d+\.br\.b64$/.test(x)).sort();
 if(!parts.length)return null;
 const encoded=(await Promise.all(parts.map(f=>fs.readFile(path.join(BUNDLED_DIR,f),'utf8')))).join('');
 const compressed=Buffer.from(encoded,'base64');
 const raw=brotliDecompressSync(compressed);
 let p=0;
 const magic=raw.subarray(0,4).toString('ascii');p=4;
 if(magic!=='UD2\0')throw new Error('Bundled DTC dataset has an invalid header');
 const u32=()=>{const x=raw.readUInt32LE(p);p+=4;return x};
 const u16=()=>{const x=raw.readUInt16LE(p);p+=2;return x};
 const f32=()=>{const x=raw.readFloatLE(p);p+=4;return x};
 const routesCount=u32(),stopsCount=u32(),linksCount=u32();
 const readTable=()=>{
  const n=u32(),a=new Array(n);
  for(let i=0;i<n;i++){const len=u16();a[i]=raw.subarray(p,p+len).toString('utf8');p+=len}
  return a;
 };
 const agencies=readTable(),shorts=readTable(),descs=readTable(),names=readTable();
 const routes=new Array(routesCount);
 for(let i=0;i<routesCount;i++){routes[i]={route_id:String(u32()),agency_id:agencies[u16()]||'',route_short_name:shorts[u16()]||'',route_desc:descs[u16()]||''}}
 const stops=new Array(stopsCount);
 for(let i=0;i<stopsCount;i++){stops[i]={stop_id:String(u32()),stop_name:names[u16()]||'',stop_lat:f32(),stop_lon:f32()}}
 const links=new Array(linksCount);
 for(let i=0;i<linksCount;i++){links[i]=[u16(),u16(),u16()]}
 if(p!==raw.length)console.warn('Bundled DTC parser left',raw.length-p,'bytes unread');
 return{routes,stops,links,feedInfo:[{feed_version:'v1',feed_start_date:'20250101',feed_end_date:'20400101'}],sourceUrl:'bundled://'+BUNDLED_SOURCE,sourceKey:'uploaded-delhi_buses_static_gtfs_v1-2'};
}

async function syncBundled(pool,{onlyIfEmpty=false}={}){
 const feed=await readBundled();
 if(!feed)return null;
 const meta=(await pool.query('SELECT source_key FROM static_feed_meta WHERE id=1')).rows[0];
 const counts=(await pool.query('SELECT (SELECT count(*) FROM routes) routes,(SELECT count(*) FROM stops) stops,(SELECT count(*) FROM route_stops) links')).rows[0];
 if(!onlyIfEmpty&&meta?.source_key===feed.sourceKey&&Number(counts.routes)===feed.routes.length&&Number(counts.stops)===feed.stops.length&&Number(counts.links)===feed.links.length){
  return{ok:true,skipped:true,source:'bundled',routes:feed.routes.length,stops:feed.stops.length,routeStops:feed.links.length};
 }
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query('SET LOCAL statement_timeout=30000');
  await c.query('TRUNCATE route_stops, routes, stops CASCADE');
  for(let i=0;i<feed.routes.length;i+=300){
   const chunk=feed.routes.slice(i,i+300),vals=[];
   const sql=chunk.map((x,j)=>{const b=j*6;vals.push(x.route_id,x.agency_id||null,x.route_short_name||null,x.route_desc||null,null,null);return'($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',$'+(b+5)+',$'+(b+6)+',NOW(),NOW())'}).join(',');
   await c.query('INSERT INTO routes(route_id,agency_id,short_name,long_name,route_color,route_text_color,created_at,updated_at) VALUES '+sql,vals);
  }
  for(let i=0;i<feed.stops.length;i+=500){
   const chunk=feed.stops.slice(i,i+500),vals=[];
   const sql=chunk.map((x,j)=>{const b=j*4;vals.push(x.stop_id,x.stop_name,num(x.stop_lat),num(x.stop_lon));return'($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',NOW(),NOW())'}).join(',');
   await c.query('INSERT INTO stops(stop_id,name,latitude,longitude,created_at,updated_at) VALUES '+sql,vals);
  }
  for(let i=0;i<feed.links.length;i+=1000){
   const chunk=feed.links.slice(i,i+1000),vals=[];
   const sql=chunk.map((x,j)=>{const b=j*3;vals.push(feed.routes[x[0]].route_id,feed.stops[x[1]].stop_id,x[2]);return'($'+(b+1)+',$'+(b+2)+',$'+(b+3)+')'}).join(',');
   await c.query('INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES '+sql+' ON CONFLICT DO NOTHING',vals);
  }
  await c.query('CREATE INDEX IF NOT EXISTS idx_routes_short_name ON routes(lower(short_name))');
  await c.query('CREATE INDEX IF NOT EXISTS idx_routes_long_name ON routes(lower(long_name))');
  await c.query('CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(lower(name))');
  await c.query('CREATE INDEX IF NOT EXISTS idx_route_stops_stop ON route_stops(stop_id,stop_sequence)');
  await c.query('CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id,stop_sequence)');
  await c.query('INSERT INTO static_feed_meta(id,source_url,source_key,feed_version,feed_start_date,feed_end_date,imported_at,updated_at) VALUES(1,$1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET source_url=EXCLUDED.source_url,source_key=EXCLUDED.source_key,feed_version=EXCLUDED.feed_version,feed_start_date=EXCLUDED.feed_start_date,feed_end_date=EXCLUDED.feed_end_date,imported_at=NOW(),updated_at=NOW()',[feed.sourceUrl,feed.sourceKey,'v1','20250101','20400101']);
  await c.query('COMMIT');
  console.log('DTC bundled static sync complete: '+feed.routes.length+' routes, '+feed.stops.length+' stops, '+feed.links.length+' route-stop links.');
  return{ok:true,source:'bundled',routes:feed.routes.length,stops:feed.stops.length,routeStops:feed.links.length};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}

export async function syncDtcStatic(pool,{onlyIfEmpty=false}={}){
 if(!pool)return{ok:false,reason:'Database is not configured'};
 const bundled=await readBundled().catch(e=>{console.error('Bundled DTC dataset failed:',e?.message||e);return null});
 if(bundled){
  const meta=(await pool.query('SELECT source_key FROM static_feed_meta WHERE id=1')).rows[0];
  const counts=(await pool.query('SELECT (SELECT count(*) FROM routes) routes,(SELECT count(*) FROM stops) stops,(SELECT count(*) FROM route_stops) links')).rows[0];
  if(!onlyIfEmpty || (!Number(counts.routes)&&!Number(counts.stops)&&!Number(counts.links))){
   if(meta?.source_key!==bundled.sourceKey||Number(counts.routes)!==bundled.routes.length||Number(counts.stops)!==bundled.stops.length||Number(counts.links)!==bundled.links.length){
    return syncBundled(pool,{onlyIfEmpty});
   }
   return{ok:true,skipped:true,source:'bundled',routes:bundled.routes.length,stops:bundled.stops.length,routeStops:bundled.links.length};
  }
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000),dir=await fs.mkdtemp(path.join(os.tmpdir(),'united-delhi-dtc-'));
 try{
  const TOKEN='1'.repeat(64);let body=null,sourceUrl=null,lastError=null;
  const candidates=[
    {url:OTD_DIRECT_URL,kind:'otd-direct'},
    {url:OTD_URL,kind:'otd-form'},
    {url:MOBILITY_URL,kind:'mobility'}
  ];
  for(const candidate of candidates){
    try{
      let response;
      if(candidate.kind==='otd-direct'){
        const form=new FormData();
        form.append('csrfmiddlewaretoken',TOKEN);
        form.append('usage_type','non-commercial');
        form.append('usageType','Non-Commercial');
        form.append('purpose','academia');
        form.append('agree','on');
        form.append('terms','on');
        form.append('download','1');
        response=await fetch(candidate.url,{method:'POST',headers:{cookie:'csrftoken='+TOKEN,referer:candidate.url,'user-agent':'United-Delhi/2.0'},body:form,signal:controller.signal});
      } else if(candidate.kind==='otd-form'){
        const page=await fetch(candidate.url,{method:'GET',headers:{accept:'text/html','user-agent':'United-Delhi/2.0'},signal:controller.signal});
        if(!page.ok)throw new Error('Static page HTTP '+page.status);
        const html=await page.text();
        const cookie=(page.headers.get('set-cookie')||'').match(/csrftoken=([^;]+)/)?.[1]||TOKEN;
        const token=html.match(/name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)/i)?.[1]||cookie;
        const form=new FormData();
        form.append('csrfmiddlewaretoken',token);
        form.append('usage_type','non-commercial');
        form.append('usageType','Non-Commercial');
        form.append('purpose','academia');
        form.append('agree','on');
        form.append('terms','on');
        form.append('download','1');
        response=await fetch(candidate.url,{method:'POST',headers:{cookie:'csrftoken='+cookie,referer:candidate.url,'user-agent':'United-Delhi/2.0'},body:form,signal:controller.signal});
      } else {
        response=await fetch(candidate.url,{headers:{accept:'application/zip','user-agent':'United-Delhi/2.0'},signal:controller.signal});
      }
      if(!response.ok){
        let detail='';
        try{detail=(await response.text()).slice(0,600).replace(/\s+/g,' ')}catch{}
        throw new Error(candidate.kind+' HTTP '+response.status+(detail?' · '+detail:''));
      }
      const candidateBody=Buffer.from(await response.arrayBuffer());
      if(!candidateBody.slice(0,2).equals(Buffer.from([0x50,0x4b])))throw new Error(candidate.kind+' response was not a ZIP');
      const probeDir=path.join(dir,'probe-'+candidate.kind);
      const probe=await unzipFeed(candidateBody,probeDir);
      if(candidate.kind!=='mobility' && (!probe.routes.length || probe.routes.length<1000))throw new Error(candidate.kind+' ZIP is not the DTC bus feed (routes='+probe.routes.length+')');
      body=candidateBody;
      sourceUrl=candidate.url;
      console.log('DTC static candidate selected:',candidate.kind,'routes=',probe.routes.length);
      break;
    }catch(e){
      lastError=e;
      console.warn('DTC static candidate failed:',candidate.kind,e?.message||e);
    }
  }if(!body||!body.slice(0,2).equals(Buffer.from([0x50,0x4b])))throw new Error('DTC static download failed: '+(lastError?.message||'unknown error'));
  const feed=await unzipFeed(body,dir);if(!feed.routes.length||!feed.stops.length||!feed.trips.length||!feed.stopTimesFile)throw new Error('DTC feed is missing required GTFS files');
  const tripRoute=new Map(feed.trips.map(x=>[esc(x.trip_id),esc(x.route_id)]));const links=new Map();
  const rl=createInterface({input:(await import('node:fs')).createReadStream(feed.stopTimesFile,{encoding:'utf8'}),crlfDelay:Infinity});let header=null;
  for await(const line of rl){if(!header){header=line.split(',').map(x=>x.trim());continue}const cols=line.split(','),row=Object.fromEntries(header.map((h,i)=>[h,cols[i]??''])),routeId=tripRoute.get(esc(row.trip_id)),stopId=esc(row.stop_id),seq=num(row.stop_sequence);if(!routeId||!stopId||!Number.isFinite(seq))continue;links.set(routeId+'|'+stopId+'|'+seq,{routeId,stopId,seq})}
  const c=await pool.connect();
  try{
   await c.query('BEGIN');await c.query('TRUNCATE route_stops, routes, stops CASCADE');
   for(let i=0;i<feed.routes.length;i+=300){const chunk=feed.routes.slice(i,i+300),vals=[];const sql=chunk.map((x,j)=>{const b=j*6;vals.push(esc(x.route_id),esc(x.agency_id)||null,esc(x.route_short_name)||null,esc(x.route_desc||x.route_long_name)||null,esc(x.route_color)||null,esc(x.route_text_color)||null);return'($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',$'+(b+5)+',$'+(b+6)+',NOW(),NOW())'}).join(',');await c.query('INSERT INTO routes(route_id,agency_id,short_name,long_name,route_color,route_text_color,created_at,updated_at) VALUES '+sql,vals)}
   for(let i=0;i<feed.stops.length;i+=500){const chunk=feed.stops.slice(i,i+500).filter(x=>esc(x.stop_id)&&esc(x.stop_name)&&Number.isFinite(num(x.stop_lat))&&Number.isFinite(num(x.stop_lon))),vals=[];const sql=chunk.map((x,j)=>{const b=j*4;vals.push(esc(x.stop_id),esc(x.stop_name),num(x.stop_lat),num(x.stop_lon));return'($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+',NOW(),NOW())'}).join(',');if(sql)await c.query('INSERT INTO stops(stop_id,name,latitude,longitude,created_at,updated_at) VALUES '+sql,vals)}
   const valid=[...links.values()];for(let i=0;i<valid.length;i+=1000){const chunk=valid.slice(i,i+1000),vals=[];const sql=chunk.map((x,j)=>{const b=j*3;vals.push(x.routeId,x.stopId,x.seq);return'($'+(b+1)+',$'+(b+2)+',$'+(b+3)+')'}).join(',');await c.query('INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES '+sql+' ON CONFLICT DO NOTHING',vals)}
   await c.query('CREATE INDEX IF NOT EXISTS idx_routes_short_name ON routes(lower(short_name))');await c.query('CREATE INDEX IF NOT EXISTS idx_routes_long_name ON routes(lower(long_name))');await c.query('CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(lower(name))');await c.query('CREATE INDEX IF NOT EXISTS idx_route_stops_stop ON route_stops(stop_id,stop_sequence)');await c.query('CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id,stop_sequence)');
   const info=feed.feedInfo[0]||{},version=esc(info.feed_version)||'remote-dtc';const sourceKey=sourceUrl===ETHAN_URL?'ethanc8-delhi-bus-'+version:sourceUrl===MOBILITY_URL?'mobilitydb-dtc-'+version:'otd-dtc-'+version;await c.query('INSERT INTO static_feed_meta(id,source_url,source_key,feed_version,feed_start_date,feed_end_date,imported_at,updated_at) VALUES(1,$1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET source_url=EXCLUDED.source_url,source_key=EXCLUDED.source_key,feed_version=EXCLUDED.feed_version,feed_start_date=EXCLUDED.feed_start_date,feed_end_date=EXCLUDED.feed_end_date,imported_at=NOW(),updated_at=NOW()',[sourceUrl,sourceKey,version,esc(info.feed_start_date)||null,esc(info.feed_end_date)||null]);
   await c.query('COMMIT');console.log('DTC remote static sync complete: '+feed.routes.length+' routes, '+feed.stops.length+' stops, '+valid.length+' route-stop links.');return{ok:true,source:'remote',routes:feed.routes.length,stops:feed.stops.length,routeStops:valid.length};
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
 }finally{clearTimeout(timer);await fs.rm(dir,{recursive:true,force:true}).catch(()=>{})}
}
