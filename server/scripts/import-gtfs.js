import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pg from 'pg';
import { readGtfsCsv, parseStops, parseRoutes, buildRouteStops } from '../src/lib/gtfsImport.js';

const { Pool } = pg;
const arg = process.argv[2];
let dir = arg;
let tempDir = null;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const GTFS_SOURCE_COMMIT = '8d573d0c67cb8269b0fa16019d192a0e49172d4f';
const GTFS_RAW_BASE = `https://raw.githubusercontent.com/Anusharana510/CommuteLive/${GTFS_SOURCE_COMMIT}/data/otd_gtfs`;
const GTFS_FILES = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];

async function downloadGtfs() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'united-delhi-gtfs-'));
  console.log(`Downloading pinned Delhi GTFS metadata from CommuteLive ${GTFS_SOURCE_COMMIT.slice(0, 7)}...`);

  for (const name of GTFS_FILES) {
    const response = await fetch(`${GTFS_RAW_BASE}/${name}`);
    if (!response.ok) {
      throw new Error(`GTFS source failed for ${name}: HTTP ${response.status}`);
    }
    fs.writeFileSync(path.join(tempDir, name), Buffer.from(await response.arrayBuffer()));
  }

  return tempDir;
}

if (!dir || arg === '--download') {
  dir = await downloadGtfs();
}

const stops = parseStops(readGtfsCsv(dir, 'stops.txt'));
const routes = parseRoutes(readGtfsCsv(dir, 'routes.txt'));
const stopTimes = readGtfsCsv(dir, 'stop_times.txt');
const trips = readGtfsCsv(dir, 'trips.txt');

const client = await pool.connect();
try {
  await client.query('BEGIN');

  for (const row of routes) {
    await client.query(
      `INSERT INTO routes(route_id, short_name, long_name) VALUES($1,$2,$3)
       ON CONFLICT(route_id) DO UPDATE SET
         short_name=EXCLUDED.short_name,
         long_name=EXCLUDED.long_name,
         updated_at=NOW()`,
      [row.routeId, row.shortName, row.longName]
    );
  }

  for (const row of stops) {
    await client.query(
      `INSERT INTO stops(stop_id,name,latitude,longitude) VALUES($1,$2,$3,$4)
       ON CONFLICT(stop_id) DO UPDATE SET
         name=EXCLUDED.name,
         latitude=EXCLUDED.latitude,
         longitude=EXCLUDED.longitude,
         updated_at=NOW()`,
      [row.stopId, row.name, row.lat, row.lon]
    );
  }

  await client.query('DELETE FROM route_stops');

  const rows = buildRouteStops(trips, stopTimes);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = [];
    const placeholders = chunk.map((row, index) => {
      const base = index * 3;
      values.push(row.routeId, row.stopId, row.stopSequence);
      return `(${base + 1},${base + 2},${base + 3})`;
    }).join(',');

    await client.query(
      `INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES ${placeholders}
       ON CONFLICT(route_id,stop_id)
       DO UPDATE SET stop_sequence=LEAST(route_stops.stop_sequence,EXCLUDED.stop_sequence)`,
      values
    );
  }

  await client.query('COMMIT');
  console.log(`Imported ${stops.length} stops, ${routes.length} routes and ${rows.length} route-stop links.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
}
