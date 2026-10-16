import test from 'node:test';
import assert from 'node:assert/strict';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  validHexColor,
  apiVehicleColorOnly,
  resolveEvidenceBackedColor,
  summarizeRouteLivery,
  classifyFleetTypeFromRegistration,
  scanEntities,
  extractColorsByVehicle,
  parseColorFieldSpec
} from '../src/vehicle-color.js';

const varint = value => {
  const out = [];
  let number = BigInt(value);
  do {
    let byte = Number(number & 127n);
    number >>= 7n;
    if (number) byte |= 128;
    out.push(byte);
  } while (number);
  return out;
};
const field = (number, bytes) => [...varint((number << 3) | 2), ...varint(bytes.length), ...bytes];
const str = value => [...new TextEncoder().encode(value)];

function feed({ id = 'E1', vid = 'DL1PD4669', extNum = 1001, extVal = '#F97316', where = 'descriptor', withDecoyPositionDescriptor = false } = {}) {
  const descriptor = [
    ...field(1, str(vid)),
    ...(where === 'descriptor' && extVal != null ? field(extNum, str(extVal)) : [])
  ];
  const position = [
    ...(withDecoyPositionDescriptor ? field(2, field(1, str('DECOY-ID'))) : []),
    ...field(8, descriptor),
    ...(where === 'position' && extVal != null ? field(extNum, str(extVal)) : [])
  ];
  const entity = [
    ...field(1, str(id)),
    ...(where === 'entity' && extVal != null ? field(extNum, str(extVal)) : []),
    ...field(4, position)
  ];
  return new Uint8Array([
    ...field(1, [...field(1, str('2.0'))]),
    ...field(2, entity)
  ]);
}

test('standard GTFS-RT decoder does not expose private descriptor extensions', () => {
  const { transit_realtime: transit } = GtfsRealtimeBindings;
  const decoded = transit.FeedMessage.decode(feed()).entity[0].vehicle.vehicle;
  assert.equal(decoded.id, 'DL1PD4669');
  assert.equal(decoded.color, undefined);
});

test('displayed vehicle colour comes only from the API serviceColor field', () => {
  assert.equal(apiVehicleColorOnly('#F97316'), '#F97316');
  assert.equal(apiVehicleColorOnly('#2563eb'), '#2563eb');
  assert.equal(apiVehicleColorOnly(null), null);
  assert.equal(apiVehicleColorOnly(undefined), null);
  assert.equal(apiVehicleColorOnly('orange'), null);
});

test('accepts exact six-digit hex and rejects guessed or malformed colours', () => {
  for (const color of ['#F97316', '#2563eb', '#64748B']) assert.equal(validHexColor(color), color);
  for (const color of ['orange', '#FFF', '#GG0000', 'rgb(1,2,3)', null]) assert.equal(validHexColor(color), null);
});

test('wire scan finds vehicle id and unknown descriptor extension', () => {
  const [entity] = scanEntities(feed());
  assert.equal(entity.vehicleId, 'DL1PD4669');
  assert.ok(entity.unknown.some(field =>
    field.message === 'VehicleDescriptor' && field.field === 1001 && field.value === '#F97316'
  ));
});

test('VehiclePosition.position field 2 is never mistaken for VehicleDescriptor', () => {
  const [entity] = scanEntities(feed({ withDecoyPositionDescriptor: true }));
  assert.equal(entity.vehicleId, 'DL1PD4669');
});

test('unconfigured hex-looking GTFS-Realtime extensions are never treated as physical colours', () => {
  assert.equal(extractColorsByVehicle(feed()).size, 0);
  assert.equal(extractColorsByVehicle(feed({ where: 'position' })).size, 0);
  assert.equal(extractColorsByVehicle(feed({ where: 'entity' })).size, 0);
  assert.equal(extractColorsByVehicle(feed(), null).size, 0);
});

test('explicit extension configuration is respected exactly', () => {
  assert.equal(extractColorsByVehicle(feed(), 'VehicleDescriptor:1001').get('DL1PD4669'), '#F97316');
  assert.equal(extractColorsByVehicle(feed(), 'VehicleDescriptor:1002').size, 0);
  assert.equal(extractColorsByVehicle(feed({ where: 'position' }), 'VehicleDescriptor:1001').size, 0);
  assert.equal(extractColorsByVehicle(feed({ where: 'entity' }), 'FeedEntity:1001').get('DL1PD4669'), '#F97316');
  assert.deepEqual(parseColorFieldSpec('VehicleDescriptor:1001'), { message: 'VehicleDescriptor', field: 1001 });
  assert.deepEqual(parseColorFieldSpec('VehiclePosition:1001'), { message: 'VehiclePosition', field: 1001 });
  assert.deepEqual(parseColorFieldSpec('FeedEntity:1001'), { message: 'FeedEntity', field: 1001 });
  assert.equal(parseColorFieldSpec('invalid:1001'), null);
});

test('unconfigured fields are ignored regardless of whether their number looks like an extension', () => {
  assert.equal(extractColorsByVehicle(feed({ extNum: 99 })).size, 0);
  assert.equal(extractColorsByVehicle(feed({ extNum: 1001 })).size, 0);
});

test('invalid API colour values are ignored by the raw feed decoder', () => {
  assert.equal(extractColorsByVehicle(feed({ extVal: 'orange' })).size, 0);
  assert.equal(extractColorsByVehicle(feed({ extVal: null })).size, 0);
});

test('fleet registration classification includes the current Delhi EV prefix families', () => {
  assert.deepEqual(classifyFleetTypeFromRegistration('DL1GD5288'), {serviceType:'electric',busType:'EV AC (9 mtr)'});
  assert.deepEqual(classifyFleetTypeFromRegistration('DL7GD1234'), {serviceType:'electric',busType:'EV AC (9 mtr)'});
  assert.deepEqual(classifyFleetTypeFromRegistration('DL3EV1234'), {serviceType:'electric',busType:'EV AC (12 mtr)'});
  assert.deepEqual(classifyFleetTypeFromRegistration('DL51GD1234'), {serviceType:'electric',busType:'EV DEVI AC (9 mtr)'});
  assert.deepEqual(classifyFleetTypeFromRegistration('unknown-id','DL6EV9123'), {serviceType:'electric',busType:'EV AC (12 mtr)'});
  assert.deepEqual(classifyFleetTypeFromRegistration('random-id'), {serviceType:'unknown',busType:'Unknown'});
});

test('route livery summaries ignore estimates and only count evidenced vehicle colours', () => {
  assert.deepEqual(summarizeRouteLivery([
    {serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type',busType:'CNG AC'},
    {serviceColor:'#2563EB',fleetColorSource:'upstream-api',busType:'CNG AC'},
    {serviceColor:'#2563EB',fleetColorSource:'upstream-api',busType:'CNG AC'},
    {serviceColor:'#F97316',fleetColorSource:'verified-livery-record',busType:'CNG NonAC'},
    {serviceColor:'#F97316',fleetColorSource:'estimated-route-profile',busType:'CNG NonAC'}
  ]), {
    busLiveryColor:'#2563EB',busLiverySource:'upstream-api',busType:'CNG AC',
    trackedBuses:3,matchingVehicles:2
  });
  assert.equal(summarizeRouteLivery([
    {serviceColor:'#2563EB',fleetColorSource:'estimated-fleet-type'},
    {serviceColor:'#F97316',fleetColorSource:'estimated-route-profile'},
    {serviceColor:'#64748B',fleetColorSource:'not-provided-by-realtime-feed'}
  ]), null);
});

test('route livery summary counts only API/reviewed colours and ignores estimates', () => {
  assert.deepEqual(summarizeRouteLivery([
    {serviceColor:'#2563EB',fleetColorSource:'upstream-api',busType:'CNG AC'},
    {serviceColor:'#2563EB',fleetColorSource:'upstream-api',busType:'CNG AC'},
    {serviceColor:'#F97316',fleetColorSource:'estimated-fleet-type',busType:'CNG NonAC'}
  ]), {
    busLiveryColor:'#2563EB',busLiverySource:'upstream-api',busType:'CNG AC',
    trackedBuses:2,matchingVehicles:2
  });
  assert.equal(summarizeRouteLivery([{serviceColor:null,fleetColorSource:'not-provided-by-realtime-feed'}]), null);
});

test('malformed bytes never throw', () => {
  assert.deepEqual(scanEntities(new Uint8Array([0x12, 0xff, 0xff])), []);
});


test('physical colour prefers the upstream API and uses only an exact verified livery fallback',()=>{
  assert.equal(resolveEvidenceBackedColor('#F97316','#2563EB'),'#F97316');
  assert.equal(resolveEvidenceBackedColor(null,'#2563EB'),'#2563EB');
  assert.equal(resolveEvidenceBackedColor(undefined,'#2563EB'),'#2563EB');
  assert.equal(resolveEvidenceBackedColor('orange','#2563EB'),'#2563EB');
  assert.equal(resolveEvidenceBackedColor(null,'blue'),null);
  assert.equal(resolveEvidenceBackedColor(null,null),null);
});
