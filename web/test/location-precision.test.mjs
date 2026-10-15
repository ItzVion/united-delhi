import test from 'node:test';
import assert from 'node:assert/strict';
import { roundCoordinate } from '../src/lib.ts';

test('nearby lookup coordinates can be reduced to four decimal places', () => {
  assert.equal(roundCoordinate(28.613899, 4), 28.6139);
  assert.equal(roundCoordinate(77.209124, 4), 77.2091);
  assert.equal(roundCoordinate(-77.209124, 4), -77.2091);
});

test('saved map viewport coordinates use a coarser three decimal places', () => {
  assert.equal(roundCoordinate(28.613899, 3), 28.614);
  assert.equal(roundCoordinate(77.209124, 3), 77.209);
});
