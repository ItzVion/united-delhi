import test from 'node:test';
import assert from 'node:assert/strict';
import {busMarkerColor,busMarkerKind,BUS_OPERATOR_MARKER_COLORS,UNKNOWN_BUS_MARKER_COLOR} from '../../../../web/src/lib.ts';

test('DTC markers stay green for CNG, EV, AC and DEVI buses',()=>{
  for(const busType of ['CNG AC (12 mtr)','CNG NonAC (12 mtr)','EV DEVI AC (9 mtr)']){
    assert.equal(busMarkerColor({operatorType:'dtc',busType,routeShortName:'D-9905'}),BUS_OPERATOR_MARKER_COLORS.DTC);
  }
});
test('DIMTS / Cluster marker is independent of bus type',()=>{
  for(const busType of ['CNG AC (12 mtr)','CNG NonAC (12 mtr)','EV DEVI AC (9 mtr)']){
    assert.equal(busMarkerColor({operatorType:'cluster',busType,routeShortName:'D-9905'}),BUS_OPERATOR_MARKER_COLORS.DIMTS);
  }
});
test('unknown operator stays neutral grey',()=>{
  const v={operatorType:'unknown',routeShortName:'D-9905',routeColor:'#2563EB',busType:'CNG AC'};
  assert.equal(busMarkerKind(v),'unknown');
  assert.equal(busMarkerColor(v),UNKNOWN_BUS_MARKER_COLOR);
});
