import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVehicleColor,apiFleetLegendRows,hasApiVehicleColor} from '../vehicleColor.ts';

test('native marker preserves the exact API colour regardless of bus type or route colour',()=>{
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG AC (12 mtr)',serviceType:'dtc',routeColor:'#1D4ED8',serviceColor:'#F97316'} as any).background,'#F97316');
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)',serviceType:'dtc',routeColor:'#F97316',serviceColor:'#1D4ED8'} as any).background,'#1D4ED8');
  assert.equal(resolveVehicleColor({busType:'EV DEVI AC (9 mtr)',serviceColor:'#16A34A'} as any).background,'#16A34A');
});

test('native uses a neutral marker when the API omits a verified bus colour',()=>{
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)',serviceType:'dtc',routeColor:'#1D4ED8'} as any).background,'#64748B');
});

test('native preserves a valid grey API colour exactly',()=>{
  assert.equal(resolveVehicleColor({busType:'CNG AC (12 mtr)',serviceColor:'#777777'} as any).background,'#777777');
});

test('native legend only reports colours actually supplied by the API',()=>{
  assert.deepEqual(apiFleetLegendRows([{serviceColor:'#1D4ED8'},{serviceColor:'#1D4ED8'},{serviceColor:null},{serviceColor:'#F97316'}]),[
    {key:'#1D4ED8',label:'#1D4ED8 (2)',color:'#1D4ED8'},
    {key:'#F97316',label:'#F97316 (1)',color:'#F97316'}
  ]);
});
