import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRouteName } from '../src/route-display.js';

test('prefers GTFS public short name', () => {
  assert.equal(publicRouteName({ short_name: '772', long_name: 'Route 772' }, '1324'), '772');
});

test('uses public route long name when short name is absent', () => {
  assert.equal(publicRouteName({ short_name: null, long_name: '801STLUP' }, '1324'), '801STLUP');
});

test('falls back to route ID only when public names are unavailable', () => {
  assert.equal(publicRouteName({ short_name: null, long_name: null }, '1324'), '1324');
});

test('ignores empty public-name values', () => {
  assert.equal(publicRouteName({ short_name: ' ', long_name: 'AIR-5' }, '1324'), 'AIR-5');
});
