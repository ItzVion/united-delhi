import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { Unzip, AsyncUnzipInflate } from 'fflate';

export const GTFS_SOURCE_URL = String(
  process.env.DTC_STATIC_GTFS_URL || 'https://otd.delhi.gov.in/data/static/GTFS.zip'
).trim();
export const GTFS_SOURCE_KEY = 'official-otd-static-gtfs';

const GTFS_FILES = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];
const MAX_GTFS_ARCHIVE_BYTES = 600 * 1024 * 1024;
const MAX_GTFS_FILE_BYTES = 250 * 1024 * 1024;

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

async function downloadOfficialGtfs(destinationDir) {
  const response = await fetch(GTFS_SOURCE_URL, {
    headers: { accept: 'application/zip,application/octet-stream,*/*' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Official OTD GTFS download failed: HTTP ' + response.status);
  if (!response.body) throw new Error('Official OTD GTFS download returned no response body');

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error('Official OTD GTFS endpoint returned HTML instead of the GTFS ZIP');
  }

  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_GTFS_ARCHIVE_BYTES) {
    throw new Error('Official OTD GTFS archive is unexpectedly large');
  }

  const paths = new Map(GTFS_FILES.map(name => [name, path.join(destinationDir, name)]));
  const handles = new Map();
  const pending = [];
  const seen = new Set();
  let totalBytes = 0;
  let fatalError = null;

  const unzip = new Unzip(file => {
    const archiveName = String(file.name || '');
    const name = path.posix.basename(archiveName);
    const required = paths.has(name) && !archiveName.endsWith('/');

    if (required && seen.has(name)) {
      fatalError ||= new Error('Official OTD GTFS archive contains duplicate ' + name);
      try { file.terminate(); } catch {}
      return;
    }

    if (required) {
      seen.add(name);
      const destination = paths.get(name);
      const handle = fs.openSync(destination, 'w');
      handles.set(name, { handle, size: 0 });
      pending.push(new Promise((resolve, reject) => {
        file.ondata = (error, chunk, final) => {
          if (error) {
            reject(error);
            return;
          }
          if (chunk?.length) {
            const state = handles.get(name);
            if (!state) return;
            state.size += chunk.length;
            if (state.size > MAX_GTFS_FILE_BYTES) {
              fatalError ||= new Error('Official OTD GTFS file exceeded the safety limit: ' + name);
              try { fs.closeSync(state.handle); } catch {}
              handles.delete(name);
              try { file.terminate(); } catch {}
              return;
            }
            try {
              fs.writeSync(state.handle, Buffer.from(chunk));
            } catch (writeError) {
              reject(writeError);
              return;
            }
          }
          if (final) {
            const state = handles.get(name);
            if (state) {
              try { fs.closeSync(state.handle); } catch {}
              handles.delete(name);
            }
            resolve();
          }
        };
        try {
          file.start();
        } catch (error) {
          reject(error);
        }
      }));
      return;
    }

    // Consume other archive members without retaining their data.
    file.ondata = error => {
      if (error) fatalError ||= error;
    };
    try {
      file.start();
    } catch (error) {
      fatalError ||= error;
    }
  });

  unzip.register(AsyncUnzipInflate);

  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_GTFS_ARCHIVE_BYTES) {
        throw new Error('Official OTD GTFS archive exceeded the 600 MB safety limit');
      }
      unzip.push(new Uint8Array(chunk), false);
      if (fatalError) throw fatalError;
    }
    unzip.push(new Uint8Array(), true);
    if (fatalError) throw fatalError;
    await Promise.all(pending);
  } catch (error) {
    for (const state of handles.values()) {
      try { fs.closeSync(state.handle); } catch {}
    }
    throw error;
  }

  const missing = GTFS_FILES.filter(name => !seen.has(name));
  if (missing.length) {
    throw new Error('Official OTD GTFS archive is missing: ' + missing.join(', '));
  }

  console.log('Downloaded official OTD GTFS archive from ' + GTFS_SOURCE_URL);
}

async function downloadGtfs() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'united-delhi-gtfs-'));
  try {
    await downloadOfficialGtfs(tempDir);
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
  console.log('Building route-stop links from official OTD GTFS streams...');
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
  let seenRows = 0;
  const unique = new Map();

  for await (const row of parser) {
    seenRows++;
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
  console.log('Processed ' + seenRows + ' stop-time rows and imported ' + links + ' route-stop links.');
  return links;
}

export async function importGtfs({ pool }) {
  if (!pool) throw new Error('Database pool is required');

  const dir = await downloadGtfs();
  try {
    const { stops, routes } = await loadRoutesAndStops(dir);
    if (stops.length < 1000 || routes.length < 500) {
      throw new Error('Official OTD GTFS validation failed: expected at least 1000 stops and 500 routes');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='120000'");
      const sqlDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../sql');
      const files = fs.readdirSync(sqlDir).filter(name => /^\d+.*\.sql$/i.test(name)).sort();
      for (const name of files) {
        await client.query(fs.readFileSync(path.join(sqlDir, name), 'utf8'));
      }

      // Replace the old static snapshot atomically. If the import fails, the transaction rolls back.
      await client.query('TRUNCATE TABLE route_stops, vehicle_positions, routes, stops RESTART IDENTITY CASCADE');

      console.log('Importing ' + routes.length + ' official routes and ' + stops.length + ' official stops...');
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

      const links = await importRouteStopsStreaming(client, dir);
      if (!links) throw new Error('Official OTD GTFS validation failed: no route-stop links were produced');

      await client.query(
        'INSERT INTO static_feed_meta(id,source_key,source_url,imported_at) VALUES(TRUE,$1,$2,NOW()) ' +
        'ON CONFLICT(id) DO UPDATE SET source_key=EXCLUDED.source_key,source_url=EXCLUDED.source_url,imported_at=NOW()',
        [GTFS_SOURCE_KEY, GTFS_SOURCE_URL]
      );

      await client.query('COMMIT');
      console.log('Official OTD GTFS import completed: ' + stops.length + ' stops, ' + routes.length + ' routes, ' + links + ' route-stop links.');
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
