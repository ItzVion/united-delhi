import test from 'node:test';
import assert from 'node:assert/strict';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  validHexColor,
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

function feed({ id = 'E1', vid = 'DL1PD4669', extNum = 1001, extVal = '#F97316', where = 'descriptor' } = {}) {
  const descriptor = [
    ...field(1, str(vid)),
    ...(where === 'descriptor' && extVal != null ? field(extNum, str(extVal)) : [])
  ];
  const position = [
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

test('auto-detects exact colour in VehicleDescriptor extensions', () => {
  assert.equal(extractColorsByVehicle(feed()).get('DL1PD4669'), '#F97316');
});

test('auto-detects exact colour in VehiclePosition extensions', () => {
  assert.equal(extractColorsByVehicle(feed({ where: 'position' })).get('DL1PD4669'), '#F97316');
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

test('invalid values are ignored, with no guessed registration or type colours', () => {
  assert.equal(extractColorsByVehicle(feed({ extVal: 'orange' })).size, 0);
  assert.equal(extractColorsByVehicle(feed({ extVal: null })).size, 0);
});

test('malformed bytes never throw', () => {
  assert.deepEqual(scanEntities(new Uint8Array([0x12, 0xff, 0xff])), []);
});
