import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVehicleColor,fleetLegendRows,hasApiVehicleColor,hasEvidenceBackedVehicleColor,
  defaultBusCategoryColor,BUS_CATEGORY_MARKER_COLORS
} from '../vehicleColor.ts';

test('physical colours from the API or reviewed records take priority',()=>{
  assert.equal(resolveVehicleColor({serviceColor:'#F97316',fleetColorSource:'upstream-api'} as any).background,'#F97316');
  assert.equal(resolveVehicleColor({serviceColor:'#16A34A',fleetColorSource:'verified-livery-record'} as any).background,'#16A34A');
});
test('unverified physical colours do not override the neutral marker',()=>{
  for(const vehicle of [
    {serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type'},
    {serviceColor:'#2563EB',fleetColorSource:'not-provided-by-realtime-feed'},
    {serviceColor:'#2563EB'},
    {markerColor:'#15803D',markerColorSource:'unclassified'}
  ] as any[]){
    assert.equal(resolveVehicleColor(vehicle).background,'#64748B');
    assert.equal(hasEvidenceBackedVehicleColor(vehicle),false);
    assert.equal(hasApiVehicleColor(vehicle),false);
  }
});
test('legend lists only exact API and reviewed per-vehicle colours',()=>{
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
test('requested categories depend on both operator and bus class',()=>{
  assert.equal(defaultBusCategoryColor('dtc','CNG NonAC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.DTC_NON_AC);
  assert.equal(defaultBusCategoryColor('dtc','CNG AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.DTC_AC);
  assert.equal(defaultBusCategoryColor('cluster','CNG NonAC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CLUSTER_NON_AC);
  assert.equal(defaultBusCategoryColor('cluster','CNG AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CLUSTER_AC);
  assert.equal(defaultBusCategoryColor('cluster','EV AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CLUSTER_AC);
  assert.equal(defaultBusCategoryColor('dtc','EV AC (12 mtr)'),null);
  assert.equal(defaultBusCategoryColor('unknown','CNG AC (12 mtr)'),null);
  assert.equal(defaultBusCategoryColor('cluster','Unknown'),null);
});
test('internal GTFS route ids never determine operator or category colour',()=>{
  assert.equal(resolveVehicleColor({routeId:'772',routeShortName:'770ASTLUP2',operatorType:'cluster',busType:'CNG NonAC (12 mtr)'} as any).background,BUS_CATEGORY_MARKER_COLORS.CLUSTER_NON_AC);
  assert.equal(resolveVehicleColor({routeId:'779',routeShortName:'772UP',operatorType:'cluster',busType:'CNG AC (12 mtr)'} as any).background,BUS_CATEGORY_MARKER_COLORS.CLUSTER_AC);
});
test('the API category marker is accepted only when explicitly sourced as a fleet category',()=>{
  assert.equal(resolveVehicleColor({
    operatorType:'dtc',busType:'CNG AC (12 mtr)',
    markerColor:'#C62828',markerColorSource:'fleet-category'
  } as any).background,BUS_CATEGORY_MARKER_COLORS.DTC_AC);
});
test('exact physical API colours outrank category markers',()=>{
  assert.equal(resolveVehicleColor({
    serviceColor:'#1D4ED8',fleetColorSource:'upstream-api',
    markerColor:'#15803D',markerColorSource:'fleet-category'
  } as any).background,'#1D4ED8');
});
test('evidence helpers distinguish live API colours and reviewed livery',()=>{
  assert.equal(hasApiVehicleColor({serviceColor:'#2563EB',fleetColorSource:'verified-livery-record'} as any),false);
  assert.equal(hasEvidenceBackedVehicleColor({serviceColor:'#2563EB',fleetColorSource:'verified-livery-record'} as any),true);
  assert.equal(hasApiVehicleColor({serviceColor:'#2563EB',fleetColorSource:'upstream-api'} as any),true);
});
