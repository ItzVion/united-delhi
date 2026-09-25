import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSmartLeave } from '../smartLeave.ts';

test('smart leave selects the soonest usable live estimate', () => {
  const result = computeSmartLeave([
    {
      vehicleId: 'late',
      routeId: '801',
      distanceMeters: 2000,
      etaSeconds: 1200,
      source: 'live-data-estimate',
      observedAgeSeconds: 15,
      confidence: 'medium'
    },
    {
      vehicleId: 'soon',
      routeId: '801STL',
      distanceMeters: 900,
      etaSeconds: 600,
      source: 'live-data-estimate',
      observedAgeSeconds: 10,
      confidence: 'medium'
    }
  ], 300);

  assert.equal(result.usedVehicleId, 'soon');
  assert.equal(result.leaveInSeconds, 120);
  assert.equal(result.status, 'leave-in');
});

test('smart leave returns insufficient data when speed-based ETA is unavailable', () => {
  const result = computeSmartLeave([
    {
      vehicleId: 'slow',
      routeId: '772',
      distanceMeters: 1000,
      etaSeconds: null,
      source: 'live-position-no-speed',
      observedAgeSeconds: 20,
      confidence: 'low'
    }
  ], 300);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.leaveInSeconds, null);
});
