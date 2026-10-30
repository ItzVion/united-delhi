import { timingSafeEqual } from 'node:crypto';

const BUS_SOURCE_KEY='user-uploaded-dtc-static-v1-20261030';
const METRO_SOURCE_KEY='user-uploaded-dmrc-static-v1-20261030';

export function isStaticImportTokenValid(expected,supplied){
  const a=Buffer.from(String(expected??'').trim(),'utf8');
  const b=Buffer.from(String(supplied??''),'utf8');
  return a.length>0&&a.length===b.length&&timingSafeEqual(a,b);
}

export function createStaticImportEnvironment(kind,filePath,base=process.env){
  if(kind!=='dtc'&&kind!=='metro')throw new Error('Unsupported static feed kind');
  const env={...base};
  delete env.STATIC_IMPORT_TOKEN;
  if(kind==='dtc'){
    env.DTC_STATIC_FILE=String(filePath);
    env.DTC_STATIC_URL='';
    env.DTC_STATIC_SOURCE_KEY=BUS_SOURCE_KEY;
    env.DTC_STATIC_ALLOW_REPLACEMENT='true';
    env.DTC_ALLOW_EXPIRED_CALENDAR='false';
    env.DTC_ALLOW_INVALID_CALENDAR='false';
  }else{
    env.METRO_STATIC_FILE=String(filePath);
    env.METRO_STATIC_URL='';
    env.METRO_STATIC_SOURCE_KEY=METRO_SOURCE_KEY;
    env.METRO_STATIC_ALLOW_REPLACEMENT='true';
    env.METRO_ALLOW_EXPIRED_CALENDAR='true';
    env.METRO_ALLOW_INVALID_CALENDAR='false';
  }
  return env;
}

export function staticBackupTableNames(archiveSha256,kind){
  const digest=String(archiveSha256??'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(digest))throw new Error('A full archive SHA-256 digest is required');
  if(kind==='dtc'){
    const p='ud_static_backup_dtc_'+digest.slice(0,12)+'_';
    return {routes:p+'routes',stops:p+'stops',route_stops:p+'route_stops',static_feed_meta:p+'feed_meta'};
  }
  if(kind==='metro'){
    const p='ud_static_backup_metro_'+digest.slice(0,12)+'_';
    return {metro_routes:p+'routes',metro_stops:p+'stops',metro_route_stops:p+'route_stops',metro_feed_meta:p+'feed_meta'};
  }
  throw new Error('Unsupported static backup kind');
}

export async function snapshotStaticTables(client,kind,archiveSha256){
  const names=staticBackupTableNames(archiveSha256,kind);
  const tables=kind==='dtc'
    ?[['routes',names.routes],['stops',names.stops],['route_stops',names.route_stops],['static_feed_meta',names.static_feed_meta]]
    :[['metro_routes',names.metro_routes],['metro_stops',names.metro_stops],['metro_route_stops',names.metro_route_stops],['metro_feed_meta',names.metro_feed_meta]];
  for(const [source,target] of tables){
    await client.query('CREATE TABLE IF NOT EXISTS public.'+target+' (LIKE public.'+source+' INCLUDING ALL)');
    const count=Number((await client.query('SELECT COUNT(*)::int AS count FROM public.'+target)).rows[0]?.count)||0;
    if(count===0)await client.query('INSERT INTO public.'+target+' SELECT * FROM public.'+source);
  }
  return Object.values(names);
}
