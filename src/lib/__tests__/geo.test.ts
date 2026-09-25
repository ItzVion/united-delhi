import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, haversineMeters } from '../geo.ts';

test('haversine distance is zero at the same point', () => {
  assert.equal(haversineMeters(28.6, 77.2, 28.6, 77.2), 0);
});

test('haversine distance is positive between distinct points', () => {
  assert.ok(haversineMeters(28.6, 77.2, 28.61, 77.2) > 0);
});

test('duration formatter handles minutes and hours', () => {
  assert.equal(formatDuration(45), '<1 min');
  assert.equal(formatDuration(120), '2 min');
  assert.equal(formatDuration(3600), '1 hr');
});
