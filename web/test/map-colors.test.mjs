import test from 'node:test';
import assert from 'node:assert/strict';
import {
  busMarkerColor,busMarkerKind,routePageBusMarkerColor,busColor,
  defaultBusOperatorColor,BUS_OPERATOR_MARKER_COLORS,UNKNOWN_BUS_MARKER_COLOR,routeName
} from '../src/lib.ts';

test('DEVI route D-9905 keeps its D prefix in its public map label',()=>{
  assert.equal(routeName('D-9905'),'D-9905');
  assert.equal(routeName('D-9905 UP'),'D-9905');
  assert.equal(routeName('D-9905DOWN'),'D-9905');
  assert.equal(routeName('D-9905UP'),'D-9905');
});
test('exact individual physical colour has priority over operator marker',()=>{
  const v={serviceColor:'#F97316',fleetColorSource:'upstream-api',operatorType:'dtc'};
  assert.equal(busMarkerKind(v),'physical');
  assert.equal(busMarkerColor(v),'#F97316');
});
test('DTC markers stay green for CNG, EV, AC and DEVI vehicles',()=>{
  assert.equal(defaultBusOperatorColor('dtc'),BUS_OPERATOR_MARKER_COLORS.DTC);
  for(const busType of ['CNG NonAC (12 mtr)','CNG AC (12 mtr)','EV AC (9 mtr)','Unknown']){
    assert.equal(busMarkerColor({operatorType:'dtc',busType,routeShortName:'D-9905'}),BUS_OPERATOR_MARKER_COLORS.DTC);
  }
});
test('DIMTS / Cluster marker stays orange regardless of bus type',()=>{
  for(const busType of ['CNG NonAC (12 mtr)','CNG AC (12 mtr)','EV AC (9 mtr)','Unknown']){
    assert.equal(busMarkerColor({operatorType:'cluster',busType,routeShortName:'D-9905'}),BUS_OPERATOR_MARKER_COLORS.DIMTS);
  }
});
test('same route can show different operator markers for different vehicles',()=>{
  assert.notEqual(busMarkerColor({operatorType:'dtc',routeShortName:'D-9905'}),busMarkerColor({operatorType:'cluster',routeShortName:'D-9905'}));
});
test('unknown operator uses neutral grey even when route metadata contains a colour',()=>{
  const v={operatorType:'unknown',routeShortName:'D-9905',routeColor:'#2563EB'};
  assert.equal(busMarkerKind(v),'unknown');
  assert.equal(busMarkerColor(v),UNKNOWN_BUS_MARKER_COLOR);
  assert.equal(routePageBusMarkerColor(v),UNKNOWN_BUS_MARKER_COLOR);
  assert.equal(busColor(v),UNKNOWN_BUS_MARKER_COLOR);
});
