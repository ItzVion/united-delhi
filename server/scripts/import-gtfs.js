import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import pg from 'pg';
import { parse } from 'csv-parse/sync';

const { Pool } = pg;
const GTFS_URL = 'https://otd.delhi.gov.in/data/static/';
const arg = process.argv[2];
let dir = arg;
let tempDir = null;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

if (!dir || arg === '--download') {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'united-delhi-gtfs-'));
  const zipPath = path.join(tempDir, 'GTFS.zip');
  console.log('Downloading Delhi OTD GTFS static data...');
  const page = await fetch(GTFS_URL);
  if (!page.ok) throw new Error(`OTD static data page failed with HTTP ${page.status}`);
  const html = await page.text();
  const match = html.match(/(?:href|src)=["']([^"']+\.zip(?:\?[^"']*)?)["']/i);
  if (!match) throw new Error('Could not find the OTD GTFS ZIP download link on the static data page');
  const zipUrl = new URL(match[1], GTFS_URL).toString();
  console.log(`Downloading GTFS from ${zipUrl}`);
  const response = await fetch(zipUrl);
  if (!response.ok) throw new Error(`GTFS download failed with HTTP ${response.status}`);
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  new AdmZip(zipPath).extractAllTo(tempDir, true);
  dir = tempDir;
  console.log('GTFS downloaded and extracted.');
}

function readCsv(name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) throw new Error(`Missing ${name}`);
  return parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true, bom: true });
}

const stops = readCsv('stops.txt');
const routes = readCsv('routes.txt');
const stopTimes = readCsv('stop_times.txt');

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const row of routes) {
    await client.query(
      `INSERT INTO routes(route_id, short_name, long_name) VALUES($1,$2,$3)
       ON CONFLICT(route_id) DO UPDATE SET short_name=EXCLUDED.short_name,long_name=EXCLUDED.long_name,updated_at=NOW()`,
      [row.route_id, row.route_short_name || null, row.route_long_name || null]
    );
  }

  for (const row of stops) {
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    if (!row.stop_id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    await client.query(
      `INSERT INTO stops(stop_id,name,latitude,longitude) VALUES($1,$2,$3,$4)
       ON CONFLICT(stop_id) DO UPDATE SET name=EXCLUDED.name,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,updated_at=NOW()`,
      [row.stop_id, row.stop_name || row.stop_id, lat, lon]
    );
  }

  for (const row of stopTimes) {
    if (!row.trip_id || !row.stop_id || !row.stop_sequence) continue;
  }

  await client.query('DELETE FROM route_stops');
  const tripRoutes = new Map();
  const trips = readCsv('trips.txt');
  for (const trip of trips) tripRoutes.set(trip.trip_id, trip.route_id);

  const routeStops = new Map();
  for (const row of stopTimes) {
    const routeId = tripRoutes.get(row.trip_id);
    if (!routeId || !row.stop_id || !row.stop_sequence) continue;
    const key = `${routeId}\\x1f${row.stop_id}`;
    const sequence = Number(row.stop_sequence);
    const existing = routeStops.get(key);
    if (existing === undefined || sequence < existing.stopSequence) {
      routeStops.set(key, { routeId, stopId: row.stop_id, stopSequence: sequence });
    }
  }

  const rows = [...routeStops.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = [];
    const placeholders = chunk.map((row, index) => {
      const base = index * 3;
      values.push(row.routeId, row.stopId, row.stopSequence);
      return `($${base + 1},$${base + 2},$${base + 3})`;
    }).join(',');
    await client.query(
      `INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES ${placeholders}
       ON CONFLICT(route_id,stop_id) DO UPDATE SET stop_sequence=LEAST(route_stops.stop_sequence,EXCLUDED.stop_sequence)`,
      values
    );
  }


  await client.query('COMMIT');
  console.log(`Imported ${stops.length} stops and ${routes.length} routes.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
}
