import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerPayloadRows,normaliseTransportPlannerStop,normaliseTransportPlannerTrip} from '../src/transport-stack-planner.js';
test('planner stops normalise provider v2 id/name/lat/lng fields',()=>{
 const rows=plannerPayloadRows({message:'Success',data:[{id:123,name:'Rajiv Chowk',lat:28.6328,lng:77.2197,stop_type:'metro'}]});
 assert.equal(rows.length,1);
 assert.deepEqual(normaliseTransportPlannerStop(rows[0],'metro'),{stop_id:'123',id:'123',name:'Rajiv Chowk',label:'Rajiv Chowk',latitude:28.6328,longitude:77.2197,stop_code:null,mode:'metro',source_name:null});
});
test('provider v2 directions.routes normalise to a real Metro leg',()=>{
 const payload={message:'Success',version:'v2',data:[{directions:{routes:[{route:'Yellow',routes:['Yellow'],type:'metro',short_name:'YELLOW',long_name:'towards Kashmere Gate',color:'#FFC000',trip_time:'',stops:[{id:'m1',name:'Rajiv Chowk',lat:28.6328,lng:77.2197,stop_type:'metro'},{id:'m2',name:'Kashmere Gate',lat:28.6675,lng:77.2282,stop_type:'metro'}]}]},trip_time:31,total_fare:0,response_type:'static',time_unit:'min',route_description:'Alternate route'}]};
 const [row]=plannerPayloadRows(payload);
 const option=normaliseTransportPlannerTrip(row,{fromType:'metro',toType:'metro',fromStopId:'m1',toStopId:'m2',fromName:'Rajiv Chowk',toName:'Kashmere Gate'},0);
 assert.equal(option.journeyMode,'metro');assert.equal(option.durationMinutes,31);assert.equal(option.legs.length,1);assert.equal(option.legs[0].mode,'metro');assert.equal(option.legs[0].routeName,'YELLOW');assert.equal(option.legs[0].fromStop,'Rajiv Chowk');assert.equal(option.legs[0].toStop,'Kashmere Gate');assert.equal(option.legs[0].fromStopId,'m1');assert.equal(option.legs[0].toStopId,'m2');assert.equal(option.legs[0].routeColor,'#FFC000');
});
test('provider route sections preserve mixed bus, walk and Metro legs',()=>{
 const row={directions:{routes:[{route:'DTC-801',routes:['801'],type:'bus',short_name:'801',stops:[{id:'b1',name:'Bus Origin'},{id:'b2',name:'Bus Interchange'}]},{route:'walk',routes:['walk'],type:'walk',trip_time:5,distance:350,stops:[{id:'b2',name:'Bus Interchange'},{id:'m1',name:'Metro Interchange'}]},{route:'Blue',routes:['Blue'],type:'metro',short_name:'BLUE',color:'0066CC',stops:[{id:'m1',name:'Metro Interchange'},{id:'m2',name:'Metro Destination'}]}]},trip_time:58,total_fare:25,response_type:'static'};
 const option=normaliseTransportPlannerTrip(row,{fromType:'bus',toType:'metro',fromStopId:'b1',toStopId:'m2',fromName:'Bus Origin',toName:'Metro Destination'},2);
 assert.equal(option.journeyMode,'mixed');assert.equal(option.durationMinutes,58);assert.equal(option.walkingMinutes,5);assert.equal(option.legs[0].fromStopId,'b1');assert.equal(option.legs[2].toStopId,'m2');assert.equal(option.legs[1].walkMeters,350);assert.equal(option.legs[2].routeColor,'#0066CC');
});
test('empty provider route payloads do not become fake generic journeys',()=>{
 assert.equal(normaliseTransportPlannerTrip({trip_time:12},{fromType:'bus',toType:'bus',fromStopId:'a',toStopId:'b',fromName:'A',toName:'B'},0),null);
});
