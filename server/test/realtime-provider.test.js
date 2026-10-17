import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeRequest,DEFAULT_OTD_REALTIME_URL} from '../src/realtime-provider.js';

test('official OTD key is sent in the documented query parameter only',()=>{
  const request=createRealtimeRequest({otdApiKey:'otd-secret-value'});
  assert.equal(request.provider,'OTD');
  assert.equal(request.source,'otd-live');
  assert.equal(request.url.origin,'https://otd.delhi.gov.in');
  assert.equal(request.url.pathname,'/api/realtime/VehiclePositions.pb');
  assert.equal(request.url.searchParams.get('key'),'otd-secret-value');
  assert.deepEqual(request.headers,{accept:'*/*','user-agent':'United-Delhi/2.0'});
  assert.equal(request.redirect,'error');
  assert.doesNotMatch(JSON.stringify(request.headers),/otd-secret-value/);
});

test('OTD takes priority when both provider credentials are configured',()=>{
  const request=createRealtimeRequest({
    otdApiKey:'official-key',
    transportStackApiKey:'legacy-key'
  });
  assert.equal(request.provider,'OTD');
  assert.equal(request.url.searchParams.get('key'),'official-key');
  assert.equal(request.headers['x-api-key'],undefined);
});

test('legacy Transport Stack remains a fallback when the OTD key is absent',()=>{
  const request=createRealtimeRequest({transportStackApiKey:'legacy-key'});
  assert.equal(request.provider,'Transport Stack');
  assert.equal(request.source,'transport-stack-live');
  assert.equal(request.url.search,'?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb');
  assert.equal(request.headers['x-api-key'],'legacy-key');
  assert.equal(request.redirect,'follow');
});

test('request builder rejects missing credentials',()=>{
  assert.throws(()=>createRealtimeRequest(),/OTD_API_KEY is not configured/);
});

test('default OTD endpoint uses HTTPS',()=>{
  assert.equal(new URL(DEFAULT_OTD_REALTIME_URL).protocol,'https:');
});
