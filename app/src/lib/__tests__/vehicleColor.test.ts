import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVehicleColor,fleetLegendRows,hasApiVehicleColor,hasEvidenceBackedVehicleColor,defaultBusCategoryColor,BUS_CATEGORY_MARKER_COLORS} from '../vehicleColor.ts';

test('native marker preserves exact upstream and reviewed colours',()=>{
  assert.equal(resolveVehicleColor({serviceColor:'#F97316',fleetColorSource:'upstream-api'} as any).background,'#F97316');
  assert.equal(resolveVehicleColor({serviceColor:'#1D4ED8',fleetColorSource:'upstream-api',routeColor:'#F97316'} as any).background,'#1D4ED8');
  assert.equal(resolveVehicleColor({serviceColor:'#16A34A',fleetColorSource:'verified-livery-record'} as any).background,'#16A34A');
});
test('route, type, registration, missing source, and neutral cache values do not prove physical colour',()=>{
  for(const vehicle of [
    {serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type'},
    {serviceColor:'#2563EB',fleetColorSource:'estimated-route-profile'},
    {serviceColor:'#2563EB',fleetColorSource:'not-provided-by-realtime-feed'},
    {serviceColor:'#2563EB'},
    {serviceColor:'#64748B',fleetColorSource:'not-provided-by-realtime-feed'},
  ] as any[]){
    assert.equal(resolveVehicleColor(vehicle).background,'#64748B');
    assert.equal(hasEvidenceBackedVehicleColor(vehicle),false);
    assert.equal(hasApiVehicleColor(vehicle),false);
  }
});
test('native legend includes only exact API and reviewed colours',()=>{
  assert.deepEqual(fleetLegendRows([
    {serviceColor:'#1D4ED8',fleetColorSource:'upstream-api'},
    {serviceColor:'#1D4ED8',fleetColorSource:'upstream-api'},
    {serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type'},
    {serviceColor:'#F97316',fleetColorSource:'verified-livery-record'},
    {serviceColor:'#64748B',fleetColorSource:'not-provided-by-realtime-feed'}
  ]),[
    {key:'upstream-api:#1D4ED8',label:'Live API · #1D4ED8 (2)',color:'#1D4ED8',source:'upstream-api'},
    {key:'verified-livery-record:#F97316',label:'Reviewed · #F97316 (1)',color:'#F97316',source:'verified-livery-record'}
  ]);
});
test('API colour and reviewed evidence source are distinguished',()=>{
  assert.equal(hasApiVehicleColor({serviceColor:'#2563EB',fleetColorSource:'verified-livery-record'} as any),false);
  assert.equal(hasEvidenceBackedVehicleColor({serviceColor:'#2563EB',fleetColorSource:'verified-livery-record'} as any),true);
  assert.equal(hasApiVehicleColor({serviceColor:'#2563EB',fleetColorSource:'upstream-api'} as any),true);
});

test('default marker colours match the requested CNG and Devi EV categories',()=>{
  assert.equal(defaultBusCategoryColor('CNG NonAC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC);
  assert.equal(defaultBusCategoryColor('CNG AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CNG_AC);
  assert.equal(defaultBusCategoryColor('EV DEVI AC (9 mtr)'),BUS_CATEGORY_MARKER_COLORS.EV_DEVI_AC);
  assert.equal(resolveVehicleColor({busType:'CNG NonAC (12 mtr)'} as any).background,'#FDBA74');
  assert.equal(resolveVehicleColor({busType:'CNG AC (12 mtr)'} as any).background,'#0077B6');
  assert.equal(resolveVehicleColor({busType:'EV DEVI AC (9 mtr)'} as any).background,'#90EE90');
  assert.equal(resolveVehicleColor({busType:'CNG AC (12 mtr)',serviceColor:'#FF0000',fleetColorSource:'upstream-api'} as any).background,'#FF0000');
  assert.equal(defaultBusCategoryColor('EV AC (12 mtr)'),null);
});
