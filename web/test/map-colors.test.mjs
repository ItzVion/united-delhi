import test from 'node:test';
import assert from 'node:assert/strict';
import { busMarkerColor, busMarkerKind, ROUTE_MARKER_PALETTE } from '../src/lib.ts';

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
