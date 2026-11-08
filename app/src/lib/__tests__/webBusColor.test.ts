import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFleetCategoryColor,BUS_CATEGORY_MARKER_COLORS} from '../vehicleColor.ts';
test('all screenshot legend variants resolve to the expected palette',()=>{
 assert.equal(resolveFleetCategoryColor('dtc','EV AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.EV_AC_12);
 assert.equal(resolveFleetCategoryColor('cluster','EV DEVI AC (9 mtr)'),BUS_CATEGORY_MARKER_COLORS.EV_DEVI_CLUSTER);
 assert.equal(resolveFleetCategoryColor('dtc','EV DEVI AC (9 mtr)'),BUS_CATEGORY_MARKER_COLORS.EV_DEVI_DTC);
 assert.equal(resolveFleetCategoryColor('cluster','CNG AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CNG_AC_CLUSTER);
 assert.equal(resolveFleetCategoryColor('dtc','CNG AC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CNG_AC_DTC);
 assert.equal(resolveFleetCategoryColor('cluster','CNG NonAC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC_CLUSTER);
 assert.equal(resolveFleetCategoryColor('dtc','CNG NonAC (12 mtr)'),BUS_CATEGORY_MARKER_COLORS.CNG_NON_AC_DTC);
});
