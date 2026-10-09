import test from 'node:test';
import assert from 'node:assert/strict';
import {busColor} from '../../../../web/src/lib.ts';

test('web marker preserves the exact API colour regardless of bus type',()=>{
  assert.equal(busColor({id:'DL1PD4669',busType:'CNG AC (12 mtr)',serviceColor:'#F97316'}),'#F97316');
  assert.equal(busColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)',serviceColor:'#1D4ED8'}),'#1D4ED8');
  assert.equal(busColor({busType:'EV DEVI AC (9 mtr)',serviceColor:'#16A34A'}),'#16A34A');
});

test('web uses a neutral marker when the API omits a verified bus colour',()=>{
  assert.equal(busColor({id:'DL1PD4669',busType:'CNG NonAC (12 mtr)'}),'#64748B');
});

test('web preserves a valid grey API colour exactly',()=>{
  assert.equal(busColor({busType:'CNG AC (12 mtr)',serviceColor:'#777777'}),'#777777');
});
