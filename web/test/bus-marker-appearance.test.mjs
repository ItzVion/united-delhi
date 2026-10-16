import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webMap = readFileSync(new URL('../src/components/MapView.tsx', import.meta.url), 'utf8');
const webRouteMap = readFileSync(new URL('../src/components/RouteMap.tsx', import.meta.url), 'utf8');
const webStyles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const appHome = readFileSync(new URL('../../app/src/screens/HomeScreen.tsx', import.meta.url), 'utf8');
const appRoute = readFileSync(new URL('../../app/src/screens/RouteDetailsScreen.tsx', import.meta.url), 'utf8');

test('web bus map markers use a front bus glyph and bright white route labels', () => {
  assert.match(webMap, /export const BUS_FRONT_SVG=/);
  assert.match(webMap, /BUS_FRONT_SVG\+'<span>'\+esc\(label\)/);
  assert.match(webMap, /style="background:'\+esc\(bg\)\+';color:#FFFFFF"/);
  assert.doesNotMatch(webMap, /aria-label="Physical bus colour unknown">\?<\/span>/);
  assert.match(webStyles, /\.bus-pill\{[^}]*color:#fff/);
  assert.match(webStyles, /\.bus-pill\{[^}]*text-shadow:/);
});

test('route map bus markers use the same front glyph and white route labels', () => {
  assert.match(webRouteMap, /BUS_FRONT_SVG/);
  assert.match(webRouteMap, /color:#FFFFFF/);
  assert.match(webStyles, /\.vehicle-id-marker\{[^}]*color:#fff/);
});

test('native home map replaces the question badge with a front bus glyph and white labels', () => {
  assert.match(appHome, /ud-mobile-bus-glyph/);
  assert.match(appHome, /M5 19V7\.5A3\.5 3\.5 0 0 1/);
  assert.match(appHome, /style="background:'\+bg\+';color:#FFFFFF"/);
  assert.doesNotMatch(appHome, /No usable physical-colour information" aria-hidden="true">\?<\/span>/);
});

test('native route map uses a front bus glyph and white labels without a question badge', () => {
  assert.match(appRoute, /vehicle-bus-glyph/);
  assert.match(appRoute, /M5 19V7\.5A3\.5 3\.5 0 0 1/);
  assert.match(appRoute, /color:#FFFFFF/);
  assert.doesNotMatch(appRoute, /No usable physical-colour information" aria-label="Colour unknown">\?<\/span>/);
});
