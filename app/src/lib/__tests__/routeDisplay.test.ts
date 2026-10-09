import test from 'node:test';
import assert from 'node:assert/strict';
import { displayRouteName, normalizePublicRouteName, routeKey, publicRouteDirection } from '../routeDisplay.ts';

test('normalizes direction suffixes without changing the public route', () => {
  assert.equal(normalizePublicRouteName('801UP'), '801');
  assert.equal(normalizePublicRouteName('801DOWN'), '801');
  assert.equal(normalizePublicRouteName('801STLUP'), '801STL');
  assert.equal(normalizePublicRouteName('741DWN'), '741');
  assert.equal(normalizePublicRouteName('772UP'), '772');
  assert.equal(normalizePublicRouteName('AIR-005'), 'AIR-5');
});

test('route keys are stable', () => {
  assert.equal(routeKey('801UP'), '801');
  assert.equal(routeKey('801DOWN'), '801');
  assert.equal(routeKey('801STL'), '801STL');
});

test('direction uses API-provided endpoints and never guesses geography from suffixes', () => {
  assert.deepEqual(publicRouteDirection('801DOWN', 'Actual first stop', 'Actual last stop'), {
    from: 'Actual first stop',
    to: 'Actual last stop'
  });
});

test('blank names return null', () => {
  assert.equal(displayRouteName(''), null);
  assert.equal(displayRouteName(null), null);
});
