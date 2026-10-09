import test from 'node:test';
import assert from 'node:assert/strict';
import {busColor} from '../../../web/src/lib.ts';

test('web bus colour uses only the API serviceColor',()=>{
  const orangeApiBus={id:'DL1PD4669',busType:'CNG AC (12 mtr)',serviceColor:'#F97316'};
  const blueApiBus={id:'DL1PD4669',busType:'CNG NonAC (12 mtr)',serviceColor:'#1D4ED8'};
  assert.equal(busColor(orangeApiBus),'#F97316');
  assert.equal(busColor(blueApiBus),'#1D4ED8');
});

test('web does not infer a colour when the API omits serviceColor',()=>{
  const noApiColor={id:'DL1PD4669',busType:'CNG NonAC (12 mtr)'};
  assert.equal(busColor(noApiColor),'transparent');
});

test('web tunes only matching API hue to a legend shade',()=>{
  assert.equal(busColor({busType:'CNG NonAC (12 mtr)',serviceColor:'#F97316'}),'#F2A76D');
  assert.equal(busColor({busType:'EV DEVI AC (9 mtr)',serviceColor:'#16A34A'}),'#219653');
  assert.equal(busColor({busType:'CNG AC (12 mtr)',serviceColor:'#1D4ED8'}),'#2F80ED');
});

test('web preserves API colour when the hue conflicts with the type legend',()=>{
  assert.equal(busColor({busType:'CNG AC (12 mtr)',serviceColor:'#F97316'}),'#F97316');
  assert.equal(busColor({busType:'EV AC (12 mtr)',serviceColor:'#1D4ED8'}),'#1D4ED8');
});
