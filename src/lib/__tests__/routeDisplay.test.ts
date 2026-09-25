import test from 'node:test';import assert from 'node:assert/strict';import {displayRouteName,normalizePublicRouteName,routeKey} from '../routeDisplay.ts';
test('normalizes direction suffixes',()=>{assert.equal(normalizePublicRouteName('801UP'),'801');assert.equal(normalizePublicRouteName('801DOWN'),'801');assert.equal(normalizePublicRouteName('801STLUP'),'801STL');assert.equal(normalizePublicRouteName('801STL'),'801STL');assert.equal(normalizePublicRouteName('AIR-5'),'AIR-5');});
test('route keys are stable',()=>{assert.equal(routeKey('801UP'),'801');assert.equal(routeKey('801DOWN'),'801');assert.equal(routeKey('801STL'),'801STL');});
test('blank names return null',()=>{assert.equal(displayRouteName(''),null);assert.equal(displayRouteName(null),null);});
