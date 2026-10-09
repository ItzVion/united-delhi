import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVehicleColor,apiFleetLegendRows} from '../vehicleColor.ts';

test('native bus colour comes from the API even when local fields disagree',()=>{
  assert.equal(resolveVehicleColor({
    id:'DL1PD4669',
    busType:'CNG AC (12 mtr)',
    serviceType:'electric',
    routeColor:'#1D4ED8',
    serviceColor:'#F97316'
  }).background,'#F97316');
});

test('native bus colour is not inferred when the API omits its colour',()=>{
  assert.equal(resolveVehicleColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)'}).background,'transparent');
});

test('native legend colours are sampled from API fields',()=>{
  const rows=apiFleetLegendRows([
    {busType:'EV AC (12 mtr)',serviceColor:'#0E7490'},
    {busType:'CNG NonAC (12 mtr)',serviceColor:'#F97316'}
  ]);
  assert.deepEqual(rows.map(row=>[row.key,row.color]),[['ev-ac','#0E7490'],['cng-nonac','#F97316']]);
});
