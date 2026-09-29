import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';

const GTFS_SOURCE_COMMIT = '8d573d0c67cb8269b0fa16019d192a0e49172d4f';
const GTFS_RAW_BASE = `https://raw.githubusercontent.com/Anusharana510/CommuteLive/${GTFS_SOURCE_COMMIT}/data/otd_gtfs`;
const GTFS_FILES = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];
const MAX_GTFS_FILE_BYTES = 100 * 1024 * 1024;

function normalizeGtfsColor(value) {
  const color = String(value ?? '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(color) ? '#' + color.toUpperCase() : null;
}

async function parseSmallCsv(filePath) {
  const rows = [];
  const parser = fs.createReadStream(filePath).pipe(parse({
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }));
  for await (const row of parser) rows.push(row);
  return rows;
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { accept: 'text/plain,text/csv,*/*' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GTFS source failed: HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_GTFS_FILE_BYTES) {
    throw new Error('GTFS source file is unexpectedly large');
  }
  if (!response.body) throw new Error('GTFS source returned no response body');

  const output = fs.createWriteStream(destination);
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > MAX_GTFS_FILE_BYTES) {
        throw new Error('GTFS source file exceeded the 100 MB safety limit');
      }
      if (!output.write(Buffer.from(chunk))) {
        await new Promise((resolve, reject) => {
          output.once('drain', resolve);
          output.once('error', reject);
        });
      }
    }
    await new Promise((resolve, reject) => {
      output.once('finish', resolve);
      output.once('error', reject);
      output.end();
    });
  } catch (error) {
    output.destroy();
    throw error;
  }
}

async function downloadGtfs() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'united-delhi-gtfs-'));
  console.log('Downloading fallback Delhi GTFS ' + GTFS_SOURCE_COMMIT.slice(0, 7) + '...');
  try {
    for (const name of GTFS_FILES) {
      console.log('Downloading ' + name + '...');
      await downloadFile(GTFS_RAW_BASE + '/' + name, path.join(tempDir, name));
    }
    return tempDir;
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function loadRoutesAndStops(dir) {
  const [stopRows, routeRows] = await Promise.all([
    parseSmallCsv(path.join(dir, 'stops.txt')),
    parseSmallCsv(path.join(dir, 'routes.txt')),
  ]);

  const stops = [];
  const stopIds = new Set();
  for (const row of stopRows) {
    const stopId = String(row.stop_id ?? '').trim();
    const name = String(row.stop_name ?? '').trim();
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    if (!stopId || !name || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180 || stopIds.has(stopId)) continue;
    stopIds.add(stopId);
    stops.push({ stopId, name, lat, lon });
  }

  const routes = [];
  const routeIds = new Set();
  for (const row of routeRows) {
    const routeId = String(row.route_id ?? '').trim();
    if (!routeId || routeIds.has(routeId)) continue;
    routeIds.add(routeId);
    routes.push({
      routeId,
      shortName: String(row.route_short_name ?? '').trim() || null,
      longName: String(row.route_long_name ?? '').trim() || null,
      routeColor: normalizeGtfsColor(row.route_color),
      routeTextColor: normalizeGtfsColor(row.route_text_color),
    });
  }

  return { stops, routes };
}

async function loadTripRoutes(dir) {
  const tripToRoute = new Map();
  const parser = fs.createReadStream(path.join(dir, 'trips.txt')).pipe(parse({
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }));
  for await (const row of parser) {
    const tripId = String(row.trip_id ?? '').trim();
    const routeId = String(row.route_id ?? '').trim();
    if (tripId && routeId) tripToRoute.set(tripId, routeId);
  }
  return tripToRoute;
}

async function insertChunk(client, rows) {
  if (!rows.length) return 0;
  const values = [];
  const placeholders = rows.map((row, index) => {
    const base = index * 3;
    values.push(row.routeId, row.stopId, row.stopSequence);
    return '($' + (base + 1) + ',$' + (base + 2) + ',$' + (base + 3) + ')';
  }).join(',');
  await client.query(
    'INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES ' + placeholders +
    ' ON CONFLICT(route_id,stop_id) DO UPDATE SET stop_sequence=LEAST(route_stops.stop_sequence,EXCLUDED.stop_sequence)',
    values
  );
  return rows.length;
}

async function importRouteStopsStreaming(client, dir) {
  console.log('Building route-stop links from GTFS streams...');
  const tripToRoute = await loadTripRoutes(dir);
  console.log('Loaded ' + tripToRoute.size + ' trip-to-route mappings.');

  const parser = fs.createReadStream(path.join(dir, 'stop_times.txt')).pipe(parse({
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }));

  const chunk = [];
  let links = 0;
  let seen = 0;
  const unique = new Map();

  for await (const row of parser) {
    seen++;
    const tripId = String(row.trip_id ?? '').trim();
    const stopId = String(row.stop_id ?? '').trim();
    const routeId = tripToRoute.get(tripId);
    const stopSequence = Number(row.stop_sequence);
    if (!routeId || !stopId || !Number.isFinite(stopSequence)) continue;

    const key = routeId + '\0' + stopId;
    const previous = unique.get(key);
    if (previous !== undefined && previous <= stopSequence) continue;
    unique.set(key, stopSequence);

    if (unique.size >= 10000) {
      for (const [compound, sequence] of unique) {
        const separator = compound.indexOf('\0');
        chunk.push({
          routeId: compound.slice(0, separator),
          stopId: compound.slice(separator + 1),
          stopSequence: sequence,
        });
        if (chunk.length >= 1000) {
          links += await insertChunk(client, chunk.splice(0, chunk.length));
        }
      }
      unique.clear();
    }
  }

  for (const [compound, sequence] of unique) {
    const separator = compound.indexOf('\0');
    chunk.push({
      routeId: compound.slice(0, separator),
      stopId: compound.slice(separator + 1),
      stopSequence: sequence,
    });
    if (chunk.length >= 1000) {
      links += await insertChunk(client, chunk.splice(0, chunk.length));
    }
  }
  links += await insertChunk(client, chunk);
  console.log('Processed ' + seen + ' stop-time rows and imported ' + links + ' route-stop links.');
  return links;
}

export async function importGtfs({ pool }) {
  if (!pool) throw new Error('Database pool is required');

  const dir = await downloadGtfs();
  try {
    console.log('Parsing static GTFS metadata...');
    const { stops, routes } = await loadRoutesAndStops(dir);
    if (!stops.length || !routes.length) throw new Error('GTFS validation failed: routes or stops are empty');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='120000'");
      console.log('Applying database migrations...');
      const sqlDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../sql');
      const files = fs.readdirSync(sqlDir).filter(name => /^\d+.*\.sql$/i.test(name)).sort();
      for (const name of files) {
        await client.query(fs.readFileSync(path.join(sqlDir, name), 'utf8'));
      }

      console.log('Importing ' + routes.length + ' routes and ' + stops.length + ' stops...');
      for (let i = 0; i < routes.length; i += 200) {
        const chunk = routes.slice(i, i + 200);
        const values = [];
        const placeholders = chunk.map((row, index) => {
          const base = index * 5;
          values.push(row.routeId, row.shortName, row.longName, row.routeColor, row.routeTextColor);
          return '($' + (base + 1) + ',$' + (base + 2) + ',$' + (base + 3) + ',$' + (base + 4) + ',$' + (base + 5) + ')';
        }).join(',');
        await client.query(
          'INSERT INTO routes(route_id,short_name,long_name,route_color,route_text_color) VALUES ' + placeholders +
          ' ON CONFLICT(route_id) DO UPDATE SET short_name=EXCLUDED.short_name,long_name=EXCLUDED.long_name,route_color=EXCLUDED.route_color,route_text_color=EXCLUDED.route_text_color,updated_at=NOW()',
          values
        );
      }

      for (let i = 0; i < stops.length; i += 200) {
        const chunk = stops.slice(i, i + 200);
        const values = [];
        const placeholders = chunk.map((row, index) => {
          const base = index * 4;
          values.push(row.stopId, row.name, row.lat, row.lon);
          return '($' + (base + 1) + ',$' + (base + 2) + ',$' + (base + 3) + ',$' + (base + 4) + ')';
        }).join(',');
        await client.query(
          'INSERT INTO stops(stop_id,name,latitude,longitude) VALUES ' + placeholders +
          ' ON CONFLICT(stop_id) DO UPDATE SET name=EXCLUDED.name,latitude=EXCLUDED.latitude,updated_at=NOW()',
          values
        );
      }

      await client.query('DELETE FROM route_stops');
      const links = await importRouteStopsStreaming(client, dir);
      if (!links) throw new Error('GTFS validation failed: no route-stop links were produced');

      await client.query('COMMIT');
      console.log('Import completed: ' + stops.length + ' stops, ' + routes.length + ' routes, ' + links + ' route-stop links.');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
