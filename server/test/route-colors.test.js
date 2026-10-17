import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRouteColor,
  contrastRouteTextColor,
  resolveGtfsRouteColors
} from '../src/route-colors.js';

test('route colors are deterministic across repeated imports', () => {
  const first = generateRouteColor('DL1', 'route-123');
  const second = generateRouteColor('DL1', 'different-route-id');
  assert.equal(first, second, 'a stable short route name should be the color key');
  assert.equal(generateRouteColor('', 'route-123'), generateRouteColor('', 'route-123'));
  assert.match(first, /^[0-9A-F]{6}$/);
});

test('generated colors remain vivid instead of grey, black, or white', () => {
  for (const key of ['DL1', 'DL2', '522', '879', 'UNKNOWN-A', 'Blue line']) {
    const hex = generateRouteColor(key, 'route-id-' + key);
    const rgb = [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16)
    ];
    assert.ok(Math.max(...rgb) < 240, hex + ' should not be blinding white');
    assert.ok(Math.min(...rgb) > 20, hex + ' should not be pure black');
    assert.ok(Math.max(...rgb) - Math.min(...rgb) > 70, hex + ' should be saturated rather than muddy grey');
  }
});

test('text color follows the requested perceived-luminance threshold', () => {
  assert.equal(contrastRouteTextColor('FFFFFF'), '000000');
  assert.equal(contrastRouteTextColor('#FFFF00'), '000000');
  assert.equal(contrastRouteTextColor('000000'), 'FFFFFF');
  assert.equal(contrastRouteTextColor('#0000FF'), 'FFFFFF');
});

test('valid feed colors are preserved and missing text contrast is derived', () => {
  assert.deepEqual(resolveGtfsRouteColors({
    routeId: 'R1',
    shortName: 'R1',
    routeColor: 'ffcc00',
    routeTextColor: ''
  }), {
    route_color: 'FFCC00',
    route_text_color: '000000',
    generated: false
  });
  assert.deepEqual(resolveGtfsRouteColors({
    routeId: 'R2',
    routeColor: '#123456',
    routeTextColor: '#abcdef'
  }), {
    route_color: '123456',
    route_text_color: 'ABCDEF',
    generated: false
  });
});

test('missing or invalid GTFS colors get a stable generated background and contrast text', () => {
  const a = resolveGtfsRouteColors({ routeId: 'bus-A', shortName: '', routeColor: '', routeTextColor: '' });
  const b = resolveGtfsRouteColors({ routeId: 'bus-A', shortName: '', routeColor: null, routeTextColor: null });
  assert.deepEqual(a, b);
  assert.equal(a.generated, true);
  assert.match(a.route_color, /^[0-9A-F]{6}$/);
  assert.ok(['000000', 'FFFFFF'].includes(a.route_text_color));
  assert.equal(resolveGtfsRouteColors({ routeId: 'bad', routeColor: 'broken' }).generated, true);
});
