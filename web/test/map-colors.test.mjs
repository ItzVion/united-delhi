import test from 'node:test';
import assert from 'node:assert/strict';
import { busMarkerColor, busMarkerKind, routePageBusMarkerColor, routeDefaultCategory, ROUTE_MARKER_PALETTE, defaultBusCategoryColor, BUS_CATEGORY_MARKER_COLORS } from '../src/lib.ts';

test('verified physical vehicle colour takes precedence over route colour', () => {
  const vehicle = {
    id: 'DL1PD4669',
    routeId: '801',
    routeColor: '#2563EB',
    serviceColor: '#F97316',
    fleetColorSource: 'upstream-api'
  };
  assert.equal(busMarkerKind(vehicle), 'physical');
  assert.equal(busMarkerColor(vehicle), '#F97316');
});

test('GTFS route colour is used only as a marker colour when physical paint is unknown', () => {
  const vehicle = {
    id: 'vehicle-1',
    routeId: '801',
    routeColor: '#2563EB',
    serviceColor: null,
    fleetColorSource: 'not-provided-by-realtime-feed'
  };
  assert.equal(busMarkerKind(vehicle), 'route');
  assert.equal(busMarkerColor(vehicle), '#2563EB');
});

test('fallback marker palette is stable and never claimed to be physical paint', () => {
  const vehicle = {
    id: 'vehicle-2',
    routeId: '0901(NS)DOWN',
    routeShortName: '0901(NS)DOWN',
    routeColor: null,
    serviceColor: null,
    fleetColorSource: 'not-provided-by-realtime-feed'
  };
  assert.equal(busMarkerKind(vehicle), 'distinctive');
  assert.equal(busMarkerColor(vehicle), busMarkerColor(vehicle));
  assert.equal(busMarkerColor({ ...vehicle, id: 'different-bus-on-same-route' }), busMarkerColor(vehicle));
  assert.ok(ROUTE_MARKER_PALETTE.includes(busMarkerColor(vehicle)));
});

test('unverified service colours and arbitrary identifiers cannot override marker provenance', () => {
  const vehicle = {
    id: 'vehicle-3',
    routeId: '101',
    routeColor: null,
    serviceColor: '#FF0000',
    fleetColorSource: 'not-provided-by-realtime-feed'
  };
  assert.equal(busMarkerKind(vehicle), 'distinctive');
  assert.ok(ROUTE_MARKER_PALETTE.includes(busMarkerColor(vehicle)));
});

test('requested category defaults are stable and do not override verified physical colour', () => {
  assert.equal(defaultBusCategoryColor('CNG NonAC (12 mtr)'), BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC);
  assert.equal(defaultBusCategoryColor('CNG AC (12 mtr)'), BUS_CATEGORY_MARKER_COLORS.CNG_AC);
  assert.equal(defaultBusCategoryColor('EV DEVI AC (9 mtr)'), BUS_CATEGORY_MARKER_COLORS.EV_DEVI_AC);
  assert.equal(busMarkerColor({ busType: 'CNG NonAC (12 mtr)', id: 'a' }), '#FDBA74');
  assert.equal(busMarkerColor({ busType: 'CNG AC (12 mtr)', id: 'b' }), '#0077B6');
  assert.equal(busMarkerColor({ busType: 'EV DEVI AC (9 mtr)', id: 'c' }), '#90EE90');
  assert.equal(busMarkerColor({ busType: 'CNG AC (12 mtr)', serviceColor: '#FF0000', fleetColorSource: 'upstream-api' }), '#FF0000');
  assert.equal(defaultBusCategoryColor('EV AC (12 mtr)'), null);
});

test('741 and 772 route pages default to CNG AC blue regardless of generic CNG NonAC feed category', () => {
  for (const routeId of ['741', '772']) {
    assert.equal(routePageBusMarkerColor({
      routeId,
      routeShortName: routeId,
      busType: 'CNG NonAC (12 mtr)',
      serviceColor: '#FDBA74',
      fleetColorSource: 'upstream-api'
    }), BUS_CATEGORY_MARKER_COLORS.CNG_AC);
    assert.deepEqual(routeDefaultCategory(routeId, routeId), {
      label: 'CNG AC (route default)',
      color: BUS_CATEGORY_MARKER_COLORS.CNG_AC
    });
  }
});

test('801 and 801STL route pages default to CNG NonAC orange', () => {
  for (const routeId of ['801', '801STL']) {
    assert.equal(routePageBusMarkerColor({
      routeId,
      routeShortName: routeId,
      busType: 'CNG AC (12 mtr)',
      serviceColor: '#0077B6',
      fleetColorSource: 'upstream-api'
    }), BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC);
    assert.equal(routeDefaultCategory(routeId, routeId)?.color, BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC);
  }
});

test('reviewed per-vehicle livery remains higher priority than route defaults', () => {
  assert.equal(routePageBusMarkerColor({
    routeId: '772',
    busType: 'CNG NonAC (12 mtr)',
    serviceColor: '#16A34A',
    fleetColorSource: 'verified-livery-record'
  }), '#16A34A');
});
