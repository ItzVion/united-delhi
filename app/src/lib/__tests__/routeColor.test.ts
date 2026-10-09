import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRouteColor} from '../routeColor.ts';

test('uses a route color supplied by the API',()=>{
  assert.deepEqual(resolveRouteColor('801','00AA55','FFFFFF'),{background:'#00AA55',text:'#FFFFFF'});
});
test('does not assign a fallback route color when the API omits it',()=>{
  assert.deepEqual(resolveRouteColor('801'),{background:'transparent',text:'#14211B'});
});
