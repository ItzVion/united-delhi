import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeRequest,DEFAULT_OTD_REALTIME_URL} from '../src/realtime-provider.js';

test('Delhi OTD private key is sent only in its documented key query parameter',()=>{
  const request=createRealtimeRequest({otdApiKey:'test-otd-secret'});
  assert.equal(request.provider,'Delhi OTD');
  assert.equal(request.source,'otd-live');
  assert.equal(request.url.href,'https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=test-otd-secret');
  assert.equal(request.headers['x-api-key'],undefined);
  assert.equal(request.headers.authorization,undefined);
  assert.equal(request.redirect,'error');
});

test('Delhi OTD realtime endpoint is fixed and uses HTTPS',()=>{
  const request=createRealtimeRequest({otdApiKey:'test-otd-secret'});
  assert.equal(request.url.origin,'https://otd.delhi.gov.in');
  assert.equal(request.url.pathname,'/api/realtime/VehiclePositions.pb');
  assert.equal(DEFAULT_OTD_REALTIME_URL,'https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb');
});

test('missing OTD private key fails closed',()=>{
  assert.throws(()=>createRealtimeRequest(),/OTD_API_KEY is not configured/);
  assert.throws(()=>createRealtimeRequest({otdApiKey:'   '}),/OTD_API_KEY is not configured/);
});

test('OTD key is URL-encoded as a single query value',()=>{
  const request=createRealtimeRequest({otdApiKey:'abc+/= 123'});
  assert.equal(request.url.searchParams.get('key'),'abc+/= 123');
  assert.equal(request.url.searchParams.has('x-api-key'),false);
});
