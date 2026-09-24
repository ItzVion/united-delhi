import test from 'node:test';import assert from 'node:assert/strict';import {resolveRouteColor} from '../routeColor.ts';
test('verified GTFS color is used',()=>assert.deepEqual(resolveRouteColor('801','00AA55','FFFFFF'),{background:'#00AA55',text:'#FFFFFF'}));
test('fallback color is stable',()=>assert.deepEqual(resolveRouteColor('801'),resolveRouteColor('801')));
