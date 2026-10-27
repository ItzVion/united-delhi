import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeRequest,DEFAULT_TRANSPORT_STACK_REALTIME_URL} from '../src/realtime-provider.js';

test('Transport Stack key is sent in x-api-key only',()=>{
  const request=createRealtimeRequest({transportStackApiKey:'test-secret'});
  assert.equal(request.provider,'Transport Stack');
  assert.equal(request.source,'transport-stack-live');
  assert.equal(request.url.origin,'https://dts-backend.transportstack.in');
  assert.equal(request.url.pathname,'/api/dataset/otd/get-file');
  assert.equal(request.url.searchParams.get('agency'),'delhi-buses');
  assert.equal(request.headers['x-api-key'],'test-secret');
  assert.equal(request.url.searchParams.has('key'),false);
  assert.equal(request.redirect,'error');
});

test('Transport Stack URL is the default approved endpoint',()=>{
  const request=createRealtimeRequest({transportStackApiKey:'test-secret'});
  assert.equal(request.url.href,DEFAULT_TRANSPORT_STACK_REALTIME_URL);
  assert.equal(new URL(DEFAULT_TRANSPORT_STACK_REALTIME_URL).protocol,'https:');
});

test('realtime request refuses missing credentials',()=>{
  assert.throws(()=>createRealtimeRequest(),/TRANSPORT_STACK_API_KEY is not configured/);
});

test('realtime request refuses non-approved endpoints',()=>{
  assert.throws(()=>createRealtimeRequest({transportStackApiKey:'test-secret',transportStackUrl:'http://example.com/feed'}),/approved HTTPS host/);
  assert.throws(()=>createRealtimeRequest({transportStackApiKey:'test-secret',transportStackUrl:'https://example.com/feed'}),/approved HTTPS host/);
});
