import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVehicleColor} from '../vehicleColor.ts';

test('native bus fill uses the API serviceColor',()=>{
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG AC (12 mtr)',serviceType:'dtc',routeColor:'#1D4ED8',serviceColor:'#F97316'} as any).background,'#F97316');
});

test('native does not guess color when the API omits serviceColor',()=>{
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)',serviceType:'dtc',routeColor:'#1D4ED8'} as any).background,'transparent');
});

test('native tunes only matching API hue to the type legend shade',()=>{
  assert.equal(resolveVehicleColor({busType:'CNG NonAC (12 mtr)',serviceColor:'#F97316'} as any).background,'#F2A76D');
  assert.equal(resolveVehicleColor({busType:'EV DEVI AC (9 mtr)',serviceColor:'#16A34A'} as any).background,'#219653');
  assert.equal(resolveVehicleColor({busType:'EV AC (12 mtr)',serviceColor:'#0E7490'} as any).background,'#54C4D8');
});

test('native never changes an API colour to a different hue family',()=>{
  assert.equal(resolveVehicleColor({busType:'CNG AC (12 mtr)',serviceColor:'#F97316'} as any).background,'#F97316');
  assert.equal(resolveVehicleColor({busType:'EV AC (12 mtr)',serviceColor:'#1D4ED8'} as any).background,'#1D4ED8');
});
