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
