import test from 'node:test';
import assert from 'node:assert/strict';
import {busColor,busMarkerColor,busMarkerKind,BUS_CATEGORY_MARKER_COLORS,routeCategoryColor} from '../../../../web/src/lib.ts';

test('web marker preserves exact upstream or reviewed colours regardless of bus type',()=>{
  assert.equal(busColor({id:'DL1PD4669',busType:'CNG AC (12 mtr)',serviceColor:'#F97316',fleetColorSource:'upstream-api'}),'#F97316');
  assert.equal(busColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)',serviceColor:'#1D4ED8',fleetColorSource:'verified-livery-record'}),'#1D4ED8');
  assert.equal(busColor({busType:'EV DEVI AC (9 mtr)',serviceColor:'#16A34A',fleetColorSource:'upstream-api'}),'#16A34A');
});
test('web uses neutral grey when colour source is absent, estimated, or invalid',()=>{
  assert.equal(busColor({id:'DL1PD4669',serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type'}),'#64748B');
  assert.equal(busColor({id:'DL1PD4669',serviceColor:'#2563EB'}),'#64748B');
  assert.equal(busColor({id:'DL1PD4669',serviceColor:'orange',fleetColorSource:'upstream-api'}),'#64748B');
  assert.equal(busColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)'}),'#64748B');
});
test('web preserves a valid grey API colour as supplied',()=>{
  assert.equal(busColor({busType:'CNG AC (12 mtr)',serviceColor:'#777777',fleetColorSource:'upstream-api'}),'#777777');
});

test('web map uses CNG AC blue as the fallback for routes 772 and 741',()=>{
  assert.equal(routeCategoryColor('772',null),BUS_CATEGORY_MARKER_COLORS.CNG_AC);
  assert.equal(routeCategoryColor(null,'741 UP'),BUS_CATEGORY_MARKER_COLORS.CNG_AC);
  assert.equal(busMarkerColor({routeId:'772',routeShortName:'772'}),BUS_CATEGORY_MARKER_COLORS.CNG_AC);
  assert.equal(busMarkerColor({routeId:'route-741',routeShortName:'741',busType:'CNG NonAC'}),BUS_CATEGORY_MARKER_COLORS.CNG_AC);
  assert.equal(busMarkerKind({routeShortName:'772'}),'category-default');
  assert.equal(routeCategoryColor('773',null),null);
  assert.notEqual(busMarkerColor({routeShortName:'773'}),BUS_CATEGORY_MARKER_COLORS.CNG_AC);
  // A vehicle-specific API/reviewed colour remains stronger evidence than route category.
  assert.equal(busMarkerColor({routeShortName:'772',serviceColor:'#FDBA74',fleetColorSource:'upstream-api'}),'#FDBA74');
});
