import test from 'node:test';
import assert from 'node:assert/strict';
import {
  busMarkerColor,busMarkerKind,routePageBusMarkerColor,ROUTE_MARKER_PALETTE,
  defaultBusCategoryColor,BUS_CATEGORY_MARKER_COLORS
} from '../src/lib.ts';

test('reviewed physical vehicle colour takes priority over category and route colours',()=>{
  const vehicle={id:'DL1PD4669',routeId:'801',routeColor:'#2563EB',serviceColor:'#F97316',fleetColorSource:'upstream-api',operatorType:'dtc',busType:'CNG NonAC (12 mtr)'};
  assert.equal(busMarkerKind(vehicle),'physical');
  assert.equal(busMarkerColor(vehicle),'#F97316');
});
test('category markers use operator and bus class, not internal GTFS route id',()=>{
  assert.equal(defaultBusCategoryColor('dtc','CNG NonAC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.DTC_NON_AC);
  assert.equal(defaultBusCategoryColor('dtc','CNG AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.DTC_AC);
  assert.equal(defaultBusCategoryColor('cluster','CNG NonAC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CLUSTER_NON_AC);
  assert.equal(defaultBusCategoryColor('cluster','CNG AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CLUSTER_AC);
  assert.equal(defaultBusCategoryColor('cluster','EV AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CLUSTER_AC);
  assert.equal(defaultBusCategoryColor('dtc','EV AC (12 mtr)'),null);
  assert.equal(defaultBusCategoryColor('unknown','CNG AC (12 mtr)'),null);
  assert.equal(busMarkerColor({routeId:'772',routeShortName:'770ASTLUP2',operatorType:'cluster',busType:'CNG NonAC (12 mtr)'}),BUS_CATEGORY_MARKER_COLORS.CLUSTER_NON_AC);
  assert.equal(busMarkerColor({routeId:'779',routeShortName:'772UP',operatorType:'cluster',busType:'CNG AC (12 mtr)'}),BUS_CATEGORY_MARKER_COLORS.CLUSTER_AC);
});
test('the backend category marker is used only with the fleet-category source',()=>{
  assert.equal(busMarkerColor({markerColor:'#C62828',markerColorSource:'fleet-category'}),BUS_CATEGORY_MARKER_COLORS.DTC_AC);
  assert.notEqual(busMarkerColor({markerColor:'#C62828',markerColorSource:'unclassified'}),'#C62828');
});
test('unknown service classes use a stable display palette, not guessed physical paint',()=>{
  const vehicle={id:'vehicle-2',routeId:'0901(NS)DOWN',routeColor:null,serviceColor:null,fleetColorSource:'not-provided-by-realtime-feed'};
  assert.equal(busMarkerKind(vehicle),'distinctive');
  assert.equal(busMarkerColor(vehicle),busMarkerColor(vehicle));
  assert.equal(busMarkerColor({...vehicle,id:'another-bus'}),busMarkerColor(vehicle));
  assert.ok(ROUTE_MARKER_PALETTE.includes(busMarkerColor(vehicle)));
});
test('GTFS route colour remains a route fallback, not a physical paint claim',()=>{
  const vehicle={id:'vehicle-1',routeId:'801',routeColor:'#2563EB',serviceColor:null,fleetColorSource:'not-provided-by-realtime-feed'};
  assert.equal(busMarkerKind(vehicle),'route');
  assert.equal(busMarkerColor(vehicle),'#2563EB');
  assert.equal(routePageBusMarkerColor(vehicle),'#2563EB');
});
test('unverified serviceColor never overrides category or fallback marker',()=>{
  const vehicle={id:'vehicle-3',routeId:'101',serviceColor:'#FF0000',fleetColorSource:'not-provided-by-realtime-feed',operatorType:'cluster',busType:'CNG NonAC (12 mtr)'};
  assert.equal(busMarkerKind(vehicle),'category-default');
  assert.equal(busMarkerColor(vehicle),BUS_CATEGORY_MARKER_COLORS.CLUSTER_NON_AC);
});
