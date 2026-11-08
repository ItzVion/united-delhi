import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVehicleColor,fleetLegendRows,hasApiVehicleColor,hasEvidenceBackedVehicleColor,
  BUS_OPERATOR_MARKER_COLORS
} from '../vehicleColor.ts';

test('exact API or reviewed physical colour overrides operator marker',()=>{
  assert.equal(resolveVehicleColor({serviceColor:'#F97316',fleetColorSource:'upstream-api',operatorType:'dtc'} as any).background,'#F97316');
  assert.equal(resolveVehicleColor({serviceColor:'#16A34A',fleetColorSource:'verified-livery-record',operatorType:'cluster'} as any).background,'#16A34A');
});
test('unverified colour never overrides operator marker or neutral fallback',()=>{
  assert.equal(resolveVehicleColor({serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type',operatorType:'dtc'} as any).background,BUS_OPERATOR_MARKER_COLORS.DTC);
  assert.equal(resolveVehicleColor({serviceColor:'#2563EB',fleetColorSource:'not-provided-by-realtime-feed'} as any).background,'#64748B');
  assert.equal(resolveVehicleColor({markerColor:'#15803D',markerColorSource:'unclassified'} as any).background,'#64748B');
  assert.equal(hasEvidenceBackedVehicleColor({serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type'} as any),false);
  assert.equal(hasApiVehicleColor({serviceColor:'#2563EB',fleetColorSource:'not-provided-by-realtime-feed'} as any),false);
});
test('legend lists only verified per-vehicle physical colours',()=>{
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
test('DTC and DEVI marker colours do not depend on bus type',()=>{
  for(const busType of ['CNG NonAC (12 mtr)','CNG AC (12 mtr)','EV AC (9 mtr)','Unknown']){
    assert.equal(resolveVehicleColor({operatorType:'dtc',busType,routeShortName:'D-9905'} as any).background,BUS_OPERATOR_MARKER_COLORS.DTC);
  }
});
test('DIMTS / Cluster marker colour does not depend on bus type',()=>{
  assert.equal(resolveVehicleColor({operatorType:'cluster',busType:'EV AC (9 mtr)'} as any).background,BUS_OPERATOR_MARKER_COLORS.DIMTS);
});
test('one route can contain vehicles from both operators',()=>{
  assert.notEqual(
    resolveVehicleColor({operatorType:'dtc',routeId:'3762',routeShortName:'D-9905'} as any).background,
    resolveVehicleColor({operatorType:'cluster',routeId:'3762',routeShortName:'D-9905'} as any).background
  );
});
test('physical colour evidence helpers remain independent',()=>{
  assert.equal(hasApiVehicleColor({serviceColor:'#2563EB',fleetColorSource:'verified-livery-record'} as any),false);
  assert.equal(hasEvidenceBackedVehicleColor({serviceColor:'#2563EB',fleetColorSource:'verified-livery-record'} as any),true);
  assert.equal(hasApiVehicleColor({serviceColor:'#2563EB',fleetColorSource:'upstream-api'} as any),true);
});
