import 'dotenv/config';
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import { resolveServerPath } from '../src/runtime-paths.js';
import { sha256Hex, sourceWithSha256, sourceHasSha256, inspectGtfsServiceCoverage } from '../src/gtfs-feed-utils.js';

const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const STATIC_URL_OVERRIDE = String(process.env.DTC_STATIC_URL || '').trim();
const STATIC_FILE_OVERRIDE = String(process.env.DTC_STATIC_FILE || '').trim();
const STATIC_FILE_PATH = STATIC_FILE_OVERRIDE ? resolveServerPath(STATIC_FILE_OVERRIDE) : '';
const STATIC_URLS = STATIC_URL_OVERRIDE ? [STATIC_URL_OVERRIDE] : [];
const SOURCE_KEY = String(process.env.DTC_STATIC_SOURCE_KEY || 'uploaded-dtc-static-local-v1-20261013').trim();
const MAX_COMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024;

const parseCsvLine = (line) => {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
};

async function* lines(stream) {
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  for await (const chunk of stream) {
    carry += decoder.decode(chunk, { stream: true });
    let start = 0;
    for (let i = 0; i < carry.length; i += 1) {
      if (carry.charCodeAt(i) !== 10) continue;
      let line = carry.slice(start, i);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      yield line;
      start = i + 1;
    }
    carry = carry.slice(start);
  }
  carry += decoder.decode();
  if (carry) yield carry.endsWith('\r') ? carry.slice(0, -1) : carry;
}

class ZipArchive {
  constructor(buffer) {
    this.buffer = buffer;
    this.entries = new Map();
    this.totalUncompressed = 0;
    this.parse();
  }

  parse() {
    const b = this.buffer;
    const minOffset = Math.max(0, b.length - 65557);
    let eocd = -1;
    for (let i = b.length - 22; i >= minOffset; i -= 1) {
      if (b.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('DTC static ZIP has no end-of-central-directory record');

    const entries = b.readUInt16LE(eocd + 10);
    const centralSize = b.readUInt32LE(eocd + 12);
    const centralOffset = b.readUInt32LE(eocd + 16);
    if (centralOffset + centralSize > b.length) throw new Error('DTC static ZIP central directory is invalid');

    let p = centralOffset;
    for (let i = 0; i < entries; i += 1) {
      if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('DTC static ZIP contains an invalid central directory entry');
      const method = b.readUInt16LE(p + 10);
      const compressedSize = b.readUInt32LE(p + 20);
      const uncompressedSize = b.readUInt32LE(p + 24);
      const nameLength = b.readUInt16LE(p + 28);
      const extraLength = b.readUInt16LE(p + 30);
      const commentLength = b.readUInt16LE(p + 32);
      const localOffset = b.readUInt32LE(p + 42);
      const name = b.subarray(p + 46, p + 46 + nameLength).toString('utf8').replace(/^\.\//, '');
      this.entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
      this.totalUncompressed += uncompressedSize;
      p += 46 + nameLength + extraLength + commentLength;
    }

  }

  find(name) {
    if (this.entries.has(name)) return this.entries.get(name);
    const target = name.toLowerCase();
    for (const entry of this.entries.values()) {
      if (entry.name.toLowerCase().endsWith('/' + target) || entry.name.toLowerCase() === target) return entry;
    }
    return null;
  }

  open(name) {
    const entry = this.find(name);
    if (!entry) throw new Error('DTC static ZIP is missing ' + name);

    const b = this.buffer;
    const p = entry.localOffset;
    if (b.readUInt32LE(p) !== 0x04034b50) throw new Error('DTC static ZIP local header is invalid for ' + name);
    const nameLength = b.readUInt16LE(p + 26);
    const extraLength = b.readUInt16LE(p + 28);
    const start = p + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (end > b.length) throw new Error('DTC static ZIP entry is truncated: ' + entry.name);

    const compressed = b.subarray(start, end);
    if (entry.method === 0) return Readable.from([compressed]);
    if (entry.method === 8) return Readable.from([compressed]).pipe(createInflateRaw());
    throw new Error('Unsupported ZIP compression method ' + entry.method + ' for ' + entry.name);
  }
}

async function* rows(zip, fileName) {
  let header = null;
  for await (const line of lines(zip.open(fileName))) {
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    if (!header) {
      header = values.map((v) => String(v || '').replace(/^\uFEFF/, '').trim());
      continue;
    }
    const row = {};
    for (let i = 0; i < header.length; i += 1) row[header[i]] = values[i] ?? '';
    yield row;
  }
}

const clean = (value, max = 500) => {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const integer = (value) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};
const batches = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function downloadZip() {
  if (STATIC_FILE_PATH) {
    try {
      const stat = await fs.stat(STATIC_FILE_PATH);
      if (!stat.isFile() || stat.size <= 0) throw new Error('Configured file is empty or is not a regular file');
      if (stat.size > MAX_COMPRESSED_BYTES) throw new Error('ZIP exceeds the compressed-size safety limit');
      const data = await fs.readFile(STATIC_FILE_PATH);
      if (data.length > MAX_COMPRESSED_BYTES) throw new Error('ZIP exceeds the compressed-size safety limit');
      const archive = new ZipArchive(data);
      const requiredFiles = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];
      const missing = requiredFiles.filter((name) => !archive.find(name));
      if (missing.length) throw new Error('ZIP is missing required GTFS files: ' + missing.join(', '));
      const requiredExpandedBytes = requiredFiles.reduce((sum, name) => sum + archive.find(name).uncompressedSize, 0);
      if (requiredExpandedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('Required GTFS files exceed the expanded-size safety limit');
      console.log('Using local DTC static ZIP: ' + STATIC_FILE_PATH);
      console.log('Local DTC static ZIP size: ' + Math.round(data.length / 1024 / 1024 * 100) / 100 + ' MB');
      return { data, sourceUrl: 'local-file:' + STATIC_FILE_PATH };
    } catch (error) {
      throw new Error('Local DTC static ZIP failed: ' + (error?.message || error));
    }
  }
  if (STATIC_URLS.length === 0) {
    throw new Error('Set DTC_STATIC_FILE to a local GTFS ZIP or DTC_STATIC_URL to an explicit ZIP URL.');
  }
  let lastError = null;
  for (const url of STATIC_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      console.log('Trying DTC static source: ' + url);
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'application/zip, application/octet-stream;q=0.9',
          'User-Agent': 'United-Delhi-static-import/1.1'
        }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength && contentLength > MAX_COMPRESSED_BYTES) throw new Error('ZIP exceeds the compressed-size safety limit');
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > MAX_COMPRESSED_BYTES) throw new Error('ZIP exceeds the compressed-size safety limit');
      const archive = new ZipArchive(data);
      const requiredFiles = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];
      const missing = requiredFiles.filter((name) => !archive.find(name));
      if (missing.length) throw new Error('ZIP is missing required GTFS files: ' + missing.join(', '));
      const requiredExpandedBytes = requiredFiles.reduce((sum, name) => sum + archive.find(name).uncompressedSize, 0);
      if (requiredExpandedBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('Required GTFS files exceed the expanded-size safety limit');
      }
      console.log('Downloaded DTC static ZIP: ' + Math.round(data.length / 1024 / 1024 * 100) / 100 + ' MB');
      console.log('Required GTFS files expand to ' + Math.round(requiredExpandedBytes / 1024 / 1024 * 100) / 100 + ' MB');
      return { data, sourceUrl: url };
    } catch (error) {
      lastError = error?.name === 'AbortError' ? new Error('download timed out') : error;
      console.warn('DTC static source failed: ' + url + ' (' + (lastError?.message || lastError) + ')');
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('All DTC static sources failed: ' + (lastError?.message || lastError || 'unknown error'));
}

async function main() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 120000,
    ssl: /localhost|127(?:\.\d+){3}|::1/i.test(DATABASE_URL) ? false : { rejectUnauthorized: true }
  });

  try {
    const client = await pool.connect();
    try {
      const required = ['routes', 'stops', 'route_stops', 'static_feed_meta'];
      const schemaRows = (await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])",
        [required]
      )).rows;
      const present = new Set(schemaRows.map((x) => x.table_name));
      const missing = required.filter((x) => !present.has(x));
      if (missing.length) {
        throw new Error('Database schema is missing: ' + missing.join(', ') + '. Run server/sql/001_reset_and_schema.sql first.');
      }
      const downloaded = await downloadZip();
      const sourceUrl = downloaded.sourceUrl;
      const zip = new ZipArchive(downloaded.data);
      console.log('ZIP source selected: ' + sourceUrl);
      console.log('ZIP entries: ' + zip.entries.size);
      console.log('Expanded ZIP size: ' + Math.round(zip.totalUncompressed / 1024 / 1024 * 100) / 100 + ' MB');

      const routes = [];
      for await (const row of rows(zip, 'routes.txt')) {
        const routeId = clean(row.route_id, 160);
        if (!routeId) continue;
        routes.push({
          route_id: routeId,
          agency_id: clean(row.agency_id, 160),
          short_name: clean(row.route_short_name, 160),
          long_name: clean(row.route_desc || row.route_long_name, 500),
          route_color: clean(row.route_color, 20),
          route_text_color: clean(row.route_text_color, 20)
        });
      }

      const stops = [];
      for await (const row of rows(zip, 'stops.txt')) {
        const stopId = clean(row.stop_id, 160);
        const name = clean(row.stop_name, 500);
        const latitude = finite(row.stop_lat);
        const longitude = finite(row.stop_lon);
        if (!stopId || !name || latitude === null || longitude === null) continue;
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
        stops.push({ stop_id: stopId, name, latitude, longitude });
      }

      const tripRoutes = new Map();
      for await (const row of rows(zip, 'trips.txt')) {
        const tripId = clean(row.trip_id, 200);
        const routeId = clean(row.route_id, 160);
        if (tripId && routeId) tripRoutes.set(tripId, routeId);
      }

      if (routes.length < 100 || stops.length < 1000) {
        throw new Error('DTC static feed is unexpectedly small; refusing to replace the live static database');
      }

      const routeIds = new Set(routes.map((x) => x.route_id));
      const stopIds = new Set(stops.map((x) => x.stop_id));
      const links = new Map();
      for await (const row of rows(zip, 'stop_times.txt')) {
        const routeId = tripRoutes.get(clean(row.trip_id, 200));
        const stopId = clean(row.stop_id, 160);
        const sequence = integer(row.stop_sequence);
        if (!routeId || !routeIds.has(routeId) || !stopId || !stopIds.has(stopId) || sequence === null) continue;
        const key = routeId + '\u0000' + stopId + '\u0000' + sequence;
        if (!links.has(key)) links.set(key, { route_id: routeId, stop_id: stopId, stop_sequence: sequence });
      }

      if (links.size < 5000) {
        throw new Error('DTC static feed has unexpectedly few route-stop links; refusing to replace the live static database');
      }
      const validLinks = [...links.values()];

      let feedVersion = null;
      let feedStart = null;
      let feedEnd = null;
      if (zip.find('feed_info.txt')) {
        for await (const row of rows(zip, 'feed_info.txt')) {
          feedVersion = feedVersion || clean(row.feed_version, 160);
          feedStart = feedStart || clean(row.feed_start_date, 32);
          feedEnd = feedEnd || clean(row.feed_end_date, 32);
          if (feedVersion || feedStart || feedEnd) break;
        }
      }

      const calendarRows = [];
      const calendarDateRows = [];
      if (zip.find('calendar.txt')) {
        for await (const row of rows(zip, 'calendar.txt')) calendarRows.push(row);
      }
      if (zip.find('calendar_dates.txt')) {
        for await (const row of rows(zip, 'calendar_dates.txt')) calendarDateRows.push(row);
      }
      const coverage = inspectGtfsServiceCoverage({ calendarRows, calendarDateRows });
      console.log('GTFS service calendar (' + coverage.today + ' Asia/Kolkata): ' +
        (coverage.calendarStartDate || 'unknown') + ' through ' + (coverage.calendarEndDate || 'unknown') +
        '; status=' + coverage.status + '; service today=' + coverage.hasServiceToday +
        '; invalid calendar rows=' + (coverage.invalidBaseRows + coverage.invalidExceptionRows) + '.');
      if (coverage.status === 'expired' || !coverage.hasServiceToday || coverage.invalidBaseRows || coverage.invalidExceptionRows) {
        console.warn('GTFS schedule coverage is limited or unverified. Existing route topology may be usable, but timetable freshness must not be inferred from feed_info dates alone.');
      }

      const sourceKey = sourceUrl.includes('ethanc8.github.io/delhi-gtfs')
        ? 'ethanc8-delhi-gtfs-bus'
        : SOURCE_KEY;
      const archiveHash = sha256Hex(downloaded.data);
      const persistedSourceUrl = sourceWithSha256(sourceUrl, archiveHash);
      const existingCounts = (await client.query(`SELECT
        (SELECT COUNT(*)::int FROM routes) AS routes,
        (SELECT COUNT(*)::int FROM stops) AS stops,
        (SELECT COUNT(*)::int FROM route_stops) AS route_stops`)).rows[0] || {};
      const existingMeta = (await client.query(
        'SELECT source_key,source_url,imported_route_count,imported_stop_count,imported_route_stop_count FROM static_feed_meta WHERE id=1'
      )).rows[0] || {};
      const currentRoutes = Number(existingCounts.routes) || 0;
      const currentStops = Number(existingCounts.stops) || 0;
      const currentLinks = Number(existingCounts.route_stops) || 0;
      const populated = currentRoutes > 0 || currentStops > 0 || currentLinks > 0;
      const archiveAlreadyImported = existingMeta.source_key === sourceKey
        && sourceHasSha256(existingMeta.source_url, archiveHash)
        && currentRoutes === routes.length
        && currentStops === stops.length
        && currentLinks === validLinks.length
        && Number(existingMeta.imported_route_count) === routes.length
        && Number(existingMeta.imported_stop_count) === stops.length
        && Number(existingMeta.imported_route_stop_count) === validLinks.length;
      if (archiveAlreadyImported) {
        console.log('DTC archive SHA-256 and all static counts match the database; no import is needed.');
        return;
      }
      if (coverage.status === 'expired' && String(process.env.DTC_ALLOW_EXPIRED_CALENDAR || '').toLowerCase() !== 'true') {
        throw new Error('SAFE REFUSAL: the DTC service calendar has expired. No data was changed. A topology-only replacement using this feed requires a separate review and DTC_ALLOW_EXPIRED_CALENDAR=true.');
      }
      if (populated && String(process.env.DTC_STATIC_ALLOW_REPLACEMENT || '').toLowerCase() !== 'true') {
        throw new Error('SAFE REFUSAL: the database already contains static transit data, but its saved archive SHA-256 does not match this ZIP (or is not recorded). No rows were changed. Review a backup and the feed, then explicitly set DTC_STATIC_ALLOW_REPLACEMENT=true for an approved replacement.');
      }
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout='120000'");
        await client.query('TRUNCATE route_stops, routes, stops CASCADE');

        for (const batch of batches(routes, 300)) {
          const values = [];
          const sql = batch.map((x, index) => {
            const base = index * 6;
            values.push(x.route_id, x.agency_id, x.short_name, x.long_name, x.route_color, x.route_text_color);
            return '(' + [1,2,3,4,5,6].map((n) => '$' + (base + n)).join(',') + ',NOW(),NOW())';
          }).join(',');
          await client.query(
            'INSERT INTO routes(route_id,agency_id,short_name,long_name,route_color,route_text_color,created_at,updated_at) VALUES ' + sql,
            values
          );
        }

        for (const batch of batches(stops, 500)) {
          const values = [];
          const sql = batch.map((x, index) => {
            const base = index * 4;
            values.push(x.stop_id, x.name, x.latitude, x.longitude);
            return '(' + [1,2,3,4].map((n) => '$' + (base + n)).join(',') + ',NOW(),NOW())';
          }).join(',');
          await client.query(
            'INSERT INTO stops(stop_id,name,latitude,longitude,created_at,updated_at) VALUES ' + sql,
            values
          );
        }

        for (const batch of batches(validLinks, 1000)) {
          const values = [];
          const sql = batch.map((x, index) => {
            const base = index * 3;
            values.push(x.route_id, x.stop_id, x.stop_sequence);
            return '(' + [1,2,3].map((n) => '$' + (base + n)).join(',') + ')';
          }).join(',');
          await client.query(
            'INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES ' + sql + ' ON CONFLICT DO NOTHING',
            values
          );
        }

        await client.query(
          'INSERT INTO static_feed_meta(id,source_key,source_url,feed_version,feed_start_date,feed_end_date,imported_at,updated_at,imported_route_count,imported_stop_count,imported_route_stop_count) VALUES(1,$1,$2,$3,$4,$5,NOW(),NOW(),$6,$7,$8) ON CONFLICT(id) DO UPDATE SET source_key=EXCLUDED.source_key,source_url=EXCLUDED.source_url,feed_version=EXCLUDED.feed_version,feed_start_date=EXCLUDED.feed_start_date,feed_end_date=EXCLUDED.feed_end_date,imported_at=NOW(),updated_at=NOW(),imported_route_count=EXCLUDED.imported_route_count,imported_stop_count=EXCLUDED.imported_stop_count,imported_route_stop_count=EXCLUDED.imported_route_stop_count',
          [sourceKey, persistedSourceUrl, feedVersion, feedStart, feedEnd, routes.length, stops.length, validLinks.length]
        );

        await client.query('ANALYZE routes');
        await client.query('ANALYZE stops');
        await client.query('ANALYZE route_stops');
        await client.query('ANALYZE static_feed_meta');
        await client.query('COMMIT');

        console.log('DTC static import complete: ' + routes.length + ' routes, ' + stops.length + ' stops, ' + validLinks.length + ' route-stop links.');
        console.log('Source: ' + sourceUrl);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        
      }
    } finally {
      // The initial schema-check client is released only when its scope ends.
      client.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('DTC static import failed:', error?.message || error);
  process.exitCode = 1;
});
