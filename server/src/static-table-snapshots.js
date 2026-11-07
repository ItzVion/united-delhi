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
