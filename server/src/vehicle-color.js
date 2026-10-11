// Physical bus colour handling. Standard GTFS-Realtime has no vehicle-livery colour field.
// Some producers may add private protobuf extensions, so only an exact #RRGGBB string
// from a per-vehicle descriptor/position extension (or an explicitly configured field) is used.
export const validHexColor = value => {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
};

// Physical bus marker colours must come only from the realtime API field.
// Do not substitute database livery records, route colours, bus type or registration data.
export const apiVehicleColorOnly = serviceColor => validHexColor(serviceColor);

// Prefer an exact upstream colour. When the feed omits it, allow only a per-vehicle
// colour verified against real physical-bus evidence; never infer from route/type/plate.
export function resolveEvidenceBackedColor(upstreamColor, verifiedLiveryColor) {
  return validHexColor(upstreamColor) || validHexColor(verifiedLiveryColor);
}

const KNOWN = {
  FeedEntity: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  VehiclePosition: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  VehicleDescriptor: [1, 2, 3, 4]
};

function readVarint(bytes, index) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    if (index >= bytes.length) throw new Error('truncated varint');
    const byte = bytes[index++];
    result |= BigInt(byte & 127) << shift;
    if (!(byte & 128)) break;
    shift += 7n;
    if (shift > 70n) throw new Error('bad varint');
  }
  return [result, index];
}

function fields(bytes) {
  const out = [];
  let index = 0;
  while (index < bytes.length) {
    let tag;
    [tag, index] = readVarint(bytes, index);
    const number = Number(tag >> 3n);
    const wireType = Number(tag & 7n);
    if (wireType === 0) {
      let value;
      [value, index] = readVarint(bytes, index);
      out.push({ number, wireType, value });
    } else if (wireType === 1) {
      if (index + 8 > bytes.length) throw new Error('truncated fixed64');
      out.push({ number, wireType, value: bytes.subarray(index, index + 8) });
      index += 8;
    } else if (wireType === 5) {
      if (index + 4 > bytes.length) throw new Error('truncated fixed32');
      out.push({ number, wireType, value: bytes.subarray(index, index + 4) });
      index += 4;
    } else if (wireType === 2) {
      let length;
      [length, index] = readVarint(bytes, index);
      const size = Number(length);
      if (index + size > bytes.length) throw new Error('truncated field');
      out.push({ number, wireType, value: bytes.subarray(index, index + size) });
      index += size;
    } else {
      throw new Error('unsupported wire type ' + wireType);
    }
  }
  return out;
}

const decodeText = bytes => new TextDecoder('utf-8', { fatal: false }).decode(bytes);
const isGtfsExtensionField = number => (number >= 1000 && number <= 1999) || (number >= 9000 && number <= 9999);

export function parseColorFieldSpec(spec) {
  const match = /^(FeedEntity|VehiclePosition|VehicleDescriptor):(\d{1,5})$/.exec(String(spec || '').trim());
  return match ? { message: match[1], field: Number(match[2]) } : null;
}

// Walk FeedMessage -> entity -> vehicle position -> vehicle descriptor. Unknown
// length-delimited fields are retained only within their owning entity.
export function scanEntities(bytes) {
  const result = [];
  let top;
  try {
    top = fields(bytes);
  } catch {
    return result;
  }

  for (const topField of top) {
    if (topField.number !== 2 || topField.wireType !== 2) continue;
    try {
      const entityFields = fields(topField.value);
      const record = { id: null, vehicleId: null, unknown: [] };
      for (const entityField of entityFields) {
        if (entityField.number === 1 && entityField.wireType === 2) {
          record.id = decodeText(entityField.value);
        } else if (!KNOWN.FeedEntity.includes(entityField.number)) {
          record.unknown.push({
            message: 'FeedEntity',
            field: entityField.number,
            wireType: entityField.wireType,
            value: entityField.wireType === 2 ? decodeText(entityField.value) : null
          });
        }

        if (entityField.number !== 4 || entityField.wireType !== 2) continue;
        for (const positionField of fields(entityField.value)) {
          if (!KNOWN.VehiclePosition.includes(positionField.number)) {
            record.unknown.push({
              message: 'VehiclePosition',
              field: positionField.number,
              wireType: positionField.wireType,
              value: positionField.wireType === 2 ? decodeText(positionField.value) : null
            });
          }
          if (positionField.number !== 8 || positionField.wireType !== 2) continue;

          for (const descriptorField of fields(positionField.value)) {
            if (descriptorField.number === 1 && descriptorField.wireType === 2 && !record.vehicleId) {
              record.vehicleId = decodeText(descriptorField.value);
            }
            if (!KNOWN.VehicleDescriptor.includes(descriptorField.number)) {
              record.unknown.push({
                message: 'VehicleDescriptor',
                field: descriptorField.number,
                wireType: descriptorField.wireType,
                value: descriptorField.wireType === 2 ? decodeText(descriptorField.value) : null
              });
            }
          }
        }
      }
      result.push(record);
    } catch {
      // Ignore malformed entities without discarding the rest of the feed.
    }
  }
  return result;
}

// Map<vehicleKey, '#RRGGBB'>. With no explicit field setting, inspect vehicle-scoped
// extensions attached to the vehicle entity, position, or descriptor. Never infer colour from other data.
export function extractColorsByVehicle(bytes, spec) {
  const config = typeof spec === 'string' ? parseColorFieldSpec(spec) : spec;
  const colors = new Map();

  for (const record of scanEntities(bytes)) {
    const candidates = record.unknown.filter(field => {
      if (field.wireType !== 2) return false;
      if (config) return field.message === config.message && field.field === config.field;
      if (!isGtfsExtensionField(field.field)) return false;
      return field.message === 'VehicleDescriptor' || field.message === 'VehiclePosition' || field.message === 'FeedEntity';
    });

    const priority = { VehicleDescriptor: 0, VehiclePosition: 1, FeedEntity: 2 };
    candidates.sort((a, b) => priority[a.message] - priority[b.message]);

    for (const candidate of candidates) {
      const color = validHexColor(candidate.value);
      if (!color) continue;
      for (const key of [record.vehicleId, record.id]) {
        if (key && !colors.has(String(key))) colors.set(String(key), color);
      }
    }
  }
  return colors;
}
