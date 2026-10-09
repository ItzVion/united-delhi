import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVehicleColor} from '../vehicleColor.ts';

test('native bus fill uses the API serviceColor',()=>{
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG AC (12 mtr)',serviceType:'dtc',routeColor:'#1D4ED8',serviceColor:'#F97316'} as any).background,'#F97316');
});

test('native does not guess color when the API omits serviceColor',()=>{
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)',serviceType:'dtc',routeColor:'#1D4ED8'} as any).background,'transparent');
});
