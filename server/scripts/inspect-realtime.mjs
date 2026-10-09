// Usage: TRANSPORT_STACK_API_KEY=... node scripts/inspect-realtime.mjs
// Prints discovered non-standard protobuf fields; never prints the API key.
import {scanEntities} from '../src/vehicle-color.js';
const key=String(process.env.TRANSPORT_STACK_API_KEY||'').trim();
const url=process.env.TRANSPORT_STACK_REALTIME_URL||'https://dts-backend.transportstack.in/api/dataset/otd/get-file?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb';
if(!key){console.error('Set TRANSPORT_STACK_API_KEY');process.exit(1)}
const r=await fetch(url,{headers:{'x-api-key':key,accept:'*/*'}});
if(!r.ok){console.error('HTTP '+r.status);process.exit(1)}
const ents=scanEntities(new Uint8Array(await r.arrayBuffer())),seen=new Map();
for(const e of ents)for(const u of e.unknown){const k=u.message+':'+u.field+' wt'+u.wireType,s=seen.get(k)||{count:0,samples:new Set()};s.count++;if(s.samples.size<5&&u.value!=null)s.samples.add(u.value);seen.set(k,s)}
console.log('entities:',ents.length);
if(!seen.size)console.log('No non-standard fields detected.');
for(const [k,s] of seen)console.log(k,'count='+s.count,'samples='+JSON.stringify([...s.samples]));
console.log('Only configure TRANSPORT_STACK_COLOR_FIELD after confirming which field contains exact #RRGGBB vehicle colours.');
