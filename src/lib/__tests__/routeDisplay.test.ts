import test from 'node:test';
import assert from 'node:assert/strict';
import { displayRouteName } from '../routeDisplay.ts';

test('removes UP and DOWN suffixes from public route names', () => {
  assert.equal(displayRouteName('801UP'), '801');
  assert.equal(displayRouteName('801DOWN'), '801');
  assert.equal(displayRouteName('801STLUP'), '801STL');
});

test('preserves names without a direction suffix', () => {
  assert.equal(displayRouteName('772'), '772');
  assert.equal(displayRouteName('D-8801'), 'D-8801');
});

test('handles blank route names', () => {
  assert.equal(displayRouteName(''), null);
  assert.equal(displayRouteName(null), null);
});
