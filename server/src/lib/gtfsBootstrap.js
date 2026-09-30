import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

export const GTFS_SOURCE_KEY = 'otd-derived-gtfs-2024-06-20-commutelive-8d573d0c';
export const GTFS_SOURCE_URL = 'https://github.com/Anusharana510/CommuteLive/tree/8d573d0c67cb8269b0fa16019d192a0e49172d4f/data/otd_gtfs';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/otd_gtfs');

function readGtfsCsv(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) throw new Error('Pinned OTD GTFS file is missing: ' + filename);
  return parse(fs.readFileSync(file, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  });
}

function loadStops() {
  const rows = readGtfsCsv('stops.txt');
  const unique = new Map();
  for (const row of rows) {
    const stopId = String(row.stop_id ?? '').trim();
    const name = String(row.stop_name ?? '').trim();
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    if (!stopId || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    if (!unique.has(stopId)) unique.set(stopId, { stopId, name, lat, lon });
  }
  return [...unique.values()];
}

function loadRoutes() {
  const rows = readGtfsCsv('routes.txt');
  const unique = new Map();
  for (const row of rows) {
    const routeId = String(row.route_id ?? '').trim();
    if (!routeId || unique.has(routeId)) continue;
    unique.set(routeId, {
      routeId,
      agencyId: String(row.agency_id ?? '').trim() || null,
      shortName: String(row.route_short_name ?? '').trim() || null,
      longName: String(row.route_long_name ?? '').trim() || null,
    });
  }
  return [...unique.values()];
}

function buildRouteStops() {
  const trips = readGtfsCsv('trips.txt');
  const stopTimes = readGtfsCsv('stop_times.txt');
  const tripToRoute = new Map();

  for (const trip of trips) {
    const tripId = String(trip.trip_id ?? '').trim();
    const routeId = String(trip.route_id ?? '').trim();
    if (tripId && routeId) tripToRoute.set(tripId, routeId);
  }

  const unique = new Map();
  for (const row of stopTimes) {
    const tripId = String(row.trip_id ?? '').trim();
    const stopId = String(row.stop_id ?? '').trim();
    const routeId = tripToRoute.get(tripId);
    const sequence = Number(row.stop_sequence);
    if (!routeId || !stopId || !Number.isFinite(sequence)) continue;

    const key = routeId + '\\0' + stopId;
    const existing = unique.get(key);
    if (existing === undefined || sequence < existing) unique.set(key, sequence);
  }

  return [...unique.entries()].map(([key, stopSequence]) => {
    const separator = key.indexOf('\\0');
    return {
      routeId: key.slice(0, separator),
      stopId: key.slice(separator + 1),
      stopSequence,
    };
  });
}

async function insertChunks(client, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values = [];
    const placeholders = chunk.map((row, index) => {
      const base = index * 3;
      values.push(row.routeId, row.stopId, row.stopSequence);
      return '($' + (base + 1) + ',$' + (base + 2) + ',$' + (base + 3) + ')';
    }).join(',');
    await client.query(
      'INSERT INTO route_stops(route_id,stop_id,stop_sequence) VALUES ' + placeholders +
      ' ON CONFLICT(route_id,stop_id) DO UPDATE SET stop_sequence=LEAST(route_stops.stop_sequence,EXCLUDED.stop_sequence)',
      values
    );
    inserted += chunk.length;
  }
  return inserted;
}

export async function importGtfs({ pool }) {
  if (!pool) throw new Error('Database pool is required');

  const routes = loadRoutes();
  const stops = loadStops();
  const routeStops = buildRouteStops();

  if (routes.length < 2000 || stops.length < 9000 || routeStops.length < 50000) {
    throw new Error(
      'Pinned OTD GTFS validation failed: routes=' + routes.length +
      ', stops=' + stops.length + ', route_stops=' + routeStops.length
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='120000'");

    const sqlDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../sql');
    const sqlFiles = fs.readdirSync(sqlDir).filter(name => /^\d+.*\.sql$/i.test(name)).sort();
    for (const name of sqlFiles) {
      await client.query(fs.readFileSync(path.join(sqlDir, name), 'utf8'));
    }

    await client.query('TRUNCATE TABLE route_stops, vehicle_positions, routes, stops RESTART IDENTITY CASCADE');

    for (let i = 0; i < routes.length; i += 200) {
      const chunk = routes.slice(i, i + 200);
      const values = [];
      const placeholders = chunk.map((row, index) => {
        const base = index * 4;
        // CommuteLive generated route_color by hash; it is not a real bus-livery colour.
        values.push(row.routeId, row.shortName, row.longName, null);
        return '($' + (base + 1) + ',$' + (base + 2) + ',$' + (base + 3) + ',$' + (base + 4) + ')';
      }).join(',');
      await client.query(
        'INSERT INTO routes(route_id,short_name,long_name,route_color) VALUES ' + placeholders +
        ' ON CONFLICT(route_id) DO UPDATE SET short_name=EXCLUDED.short_name,long_name=EXCLUDED.long_name,route_color=NULL,updated_at=NOW()',
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
        ' ON CONFLICT(stop_id) DO UPDATE SET name=EXCLUDED.name,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,updated_at=NOW()',
        values
      );
    }

    await insertChunks(client, routeStops);

    await client.query(
      'INSERT INTO static_feed_meta(id,source_key,source_url,imported_at,imported_route_count,imported_stop_count,imported_route_stop_count) VALUES(TRUE,$1,$2,NOW(),$3,$4,$5) ' +
      'ON CONFLICT(id) DO UPDATE SET source_key=EXCLUDED.source_key,source_url=EXCLUDED.source_url,imported_at=EXCLUDED.imported_at,imported_route_count=EXCLUDED.imported_route_count,imported_stop_count=EXCLUDED.imported_stop_count,imported_route_stop_count=EXCLUDED.imported_route_stop_count',
      [GTFS_SOURCE_KEY, GTFS_SOURCE_URL, routes.length, stops.length, routeStops.length]
    );

    await client.query('COMMIT');
    console.log('Pinned OTD GTFS import completed: ' + routes.length + ' routes, ' + stops.length + ' stops, ' + routeStops.length + ' route-stop links.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
