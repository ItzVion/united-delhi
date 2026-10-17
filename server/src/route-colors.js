import { createHash } from 'node:crypto';

const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

function normalizeGtfsColor(value) {
  const match = HEX_COLOR.exec(String(value ?? '').trim());
  return match ? match[1].toUpperCase() : null;
}

function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = t => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };

  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255)
  ];
}

function rgbHex(rgb) {
  return rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Generate a stable, saturated GTFS route colour from the public route name/ID.
 * GTFS route colors are returned as six hex characters without a leading "#".
 */
export function generateRouteColor(shortName, routeId) {
  const identity = String(shortName ?? '').trim() || String(routeId ?? '').trim() || 'unknown-route';
  const stableKey = identity.normalize('NFKC').toLocaleUpperCase('en-US');
  const digest = createHash('md5').update('united-delhi-route-color:v1:' + stableKey, 'utf8').digest();

  // Hash bits choose hue, saturation, and lightness. Keeping saturation high
  // and lightness within 40–50% avoids grey/muddy, nearly-black, and near-white fills.
  const hue = digest.readUInt16BE(0) / 65535 * 360;
  const saturation = 0.68 + (digest[2] / 255) * 0.17;
  const lightness = 0.40 + (digest[3] / 255) * 0.10;
  return rgbHex(hslToRgb(hue, saturation, lightness));
}

/**
 * Pick black or white text using the requested perceived-luminance formula.
 * Accepts either GTFS bare hex (RRGGBB) or CSS hex (#RRGGBB).
 */
export function contrastRouteTextColor(routeColor) {
  const normalized = normalizeGtfsColor(routeColor);
  const background = normalized || '64748B';
  const red = Number.parseInt(background.slice(0, 2), 16);
  const green = Number.parseInt(background.slice(2, 4), 16);
  const blue = Number.parseInt(background.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance >= 0.5 ? '000000' : 'FFFFFF';
}

/**
 * Keep valid colors provided by the feed; only synthesize missing/invalid values.
 * If the feed provides a background but no text color, choose a contrasting text.
 */
export function resolveGtfsRouteColors({ routeId, shortName, routeColor, routeTextColor } = {}) {
  const normalizedSourceColor = normalizeGtfsColor(routeColor);
  const background = normalizedSourceColor || generateRouteColor(shortName, routeId);
  const text = normalizeGtfsColor(routeTextColor) || contrastRouteTextColor(background);
  return {
    route_color: background,
    route_text_color: text,
    generated: !normalizedSourceColor,
  };
}
