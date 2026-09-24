import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readGtfsCsv, parseStops, parseRoutes, buildRouteStops } from '../src/lib/gtfsImport.js';

const { Pool } = pg;
const arg = process.argv[2];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
let dir = arg;
let tempDir = null;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const databaseUrl = process.env.DATABASE_URL;
const isLocalDatabase = /(?:localhost|127(?:\\.\\d+){3}|::1)/i.test(databaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
  connectionTimeoutMillis: 5000,
  ...(isLocalDatabase ? {} : { ssl: { rejectUnauthorized: false } })
});

pool.on('error', error => {
  console.error('PostgreSQL pool error:', error);
});

const GTFS_SOURCE_COMMIT = '8d573d0c67cb8269b0fa16019d192a0e49172d4f';
const GTFS_RAW_BASE = `https://raw.githubusercontent.com/Anusharana510/CommuteLive/${GTFS_SOURCE_COMMIT}/data/otd_gtfs`;
const GTFS_FILES = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];
const MAX_GTFS_FILE_BYTES = 100 * 1024 * 1024;

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: 'text/plain,text/csv,*/*' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`GTFS source failed: HTTP ${response.status}`);
    }

    const length = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > MAX_GTFS_FILE_BYTES) {
      throw new Error('GTFS source file is unexpectedly large');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_GTFS_FILE_BYTES) {
      throw new Error('GTFS source file exceeded the 100 MB safety limit');
    }

    return buffer;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('GTFS source request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadGtfs() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'united-delhi-gtfs-'));
  console.log(
    `Downloading pinned Delhi GTFS metadata from CommuteLive ${GTFS_SOURCE_COMMIT.slice(0, 7)}...`
  );

  for (const name of GTFS_FILES) {
    const buffer = await fetchWithTimeout(`${GTFS_RAW_BASE}/${name}`);
    fs.writeFileSync(path.join(tempDir, name), buffer);
  }

  return tempDir;
}

async function importGtfs() {
  if (!dir || arg === '--download') {
    dir = await downloadGtfs();
  }

  console.log('Parsing GTFS files...');
  const stops = parseStops(readGtfsCsv(dir, 'stops.txt'));
  const routes = parseRoutes(readGtfsCsv(dir, 'routes.txt'));
  const stopTimes = readGtfsCsv(dir, 'stop_times.txt');
  const trips = readGtfsCsv(dir, 'trips.txt');

  if (stops.length === 0 || routes.length === 0) {
    throw new Error('GTFS validation failed: routes or stops are empty');
  }

  const rows = buildRouteStops(trips, stopTimes);
  if (rows.length === 0) {
    throw new Error('GTFS validation failed: no route-stop relationships were produced');
  }

  const client = await pool.connect();
  try {
    // Keep schema creation in the importer so a fresh Render/Neon database can
    // bootstrap itself without a separate manual migration step.
    const schemaPath = path.join(scriptDir, '..', 'sql', '001_initial.sql');
    await client.query(fs.readFileSync(schemaPath, 'utf8'));

    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '60000'");

    const ROUTE_CHUNK_SIZE = 300;
    for (let i = 0; i < routes.length; i += ROUTE_CHUNK_SIZE) {
      const chunk = routes.slice(i, i + ROUTE_CHUNK_SIZE);
      const values = [];
      const placeholders = chunk.map((row, index) => {
        const base = index * 3;
        values.push(row.routeId, row.shortName, row.longName);
        return `($${base + 1},$${base + 2},$${base + 3})`;
      }).join(',');

      await client.query(
        `INSERT INTO routes(route_id, short_name, long_name)
         VALUES ${placeholders}
         ON CONFLICT(route_id) DO UPDATE SET
           short_name=EXCLUDED.short_name,
           long_name=EXCLUDED.long_name,
           updated_at=NOW()`,
        values
      );
    }

    const STOP_CHUNK_SIZE = 300;
    for (let i = 0; i < stops.length; i += STOP_CHUNK_SIZE) {
      const chunk = stops.slice(i, i + STOP_CHUNK_SIZE);
      const values = [];
      const placeholders = chunk.map((row, index) => {
        const base = index * 4;
        values.push(row.stopId, row.name, row.lat, row.lon);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4})`;
      }).join(',');

      await client.query(
        `INSERT INTO stops(stop_id, name, latitude, longitude)
         VALUES ${placeholders}
         ON CONFLICT(stop_id) DO UPDATE SET
           name=EXCLUDED.name,
           latitude=EXCLUDED.latitude,
           longitude=EXCLUDED.longitude,
           updated_at=NOW()`,
        values
      );
    }

    await client.query('DELETE FROM route_stops');

    const ROUTE_STOP_CHUNK_SIZE = 300;
    for (let i = 0; i < rows.length; i += ROUTE_STOP_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + ROUTE_STOP_CHUNK_SIZE);
      const values = [];
      const placeholders = chunk.map((row, index) => {
        const base = index * 3;
        values.push(row.routeId, row.stopId, row.stopSequence);
        return `($${base + 1},$${base + 2},$${base + 3})`;
      }).join(',');

      await client.query(
        `INSERT INTO route_stops(route_id, stop_id, stop_sequence)
         VALUES ${placeholders}
         ON CONFLICT(route_id, stop_id)
         DO UPDATE SET stop_sequence=LEAST(route_stops.stop_sequence, EXCLUDED.stop_sequence)`,
        values
      );
    }

    await client.query('COMMIT');
    console.log(
      `Import completed successfully: ${stops.length} stops, ${routes.length} routes, and ${rows.length} route-stop links.`
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

try {
  await importGtfs();
} finally {
  await pool.end().catch(() => {});
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
