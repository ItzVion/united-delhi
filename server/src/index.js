import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { spawn } from 'node:child_process';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000); // Render auto-deploy trigger
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

app.use(cors());
app.use(express.json({ limit: '64kb' }));

const ok = (value) => value !== undefined && value !== null && value !== '';

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function entityToVehicle(entity) {
  const vehicle = entity.vehicle;
  if (!vehicle?.position) return null;
  const position = vehicle.position;
  const trip = vehicle.trip || {};
  const descriptor = vehicle.vehicle || {};
  const lat = numberOrNull(position.latitude);
  const lon = numberOrNull(position.longitude);
  if (lat === null || lon === null) return null;

  const timestamp = Number(vehicle.timestamp || 0);
  return {
    id: String(descriptor.id || vehicle.id || entity.id || ''),
    routeId: ok(trip.routeId) ? String(trip.routeId) : null,
    tripId: ok(trip.tripId) ? String(trip.tripId) : null,
    stopId: ok(vehicle.stopId) ? String(vehicle.stopId) : null,
    latitude: lat,
    longitude: lon,
    bearing: numberOrNull(position.bearing),
    speedMps: numberOrNull(position.speed),
    observedAt: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : new Date().toISOString()
  };
}

async function getRealtimeVehicles() {
  if (!process.env.DTC_API_KEY) {
    const error = new Error('DTC_API_KEY is not configured');
    error.code = 'NO_API_KEY';
    throw error;
  }

  const url = `https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=${encodeURIComponent(process.env.DTC_API_KEY)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(url, {
      headers: { accept: 'application/x-protobuf' },
      signal: controller.signal
    });

    if (!upstream.ok) {
      throw new Error(`OTD returned HTTP ${upstream.status}`);
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer());
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    return feed.entity.map(entityToVehicle).filter(Boolean).filter(vehicle => vehicle.id);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('OTD realtime feed timed out after 15 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function saveVehicles(vehicles) {
  if (!pool || vehicles.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const v of vehicles) {
      await client.query(
        `INSERT INTO vehicle_positions
          (vehicle_id, route_id, stop_id, latitude, longitude, bearing, speed_mps, observed_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (vehicle_id) DO UPDATE SET
           route_id=EXCLUDED.route_id, stop_id=EXCLUDED.stop_id,
           latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
           bearing=EXCLUDED.bearing, speed_mps=EXCLUDED.speed_mps,
           observed_at=EXCLUDED.observed_at, updated_at=NOW()`,
        [v.id, v.routeId, v.stopId, v.latitude, v.longitude, v.bearing, v.speedMps, v.observedAt]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.get('/health', async (_req, res) => {
  let database = 'not_configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      database = 'ok';
    } catch {
      database = 'error';
    }
  }
  res.json({ ok: database !== 'error', service: 'united-delhi-api', database, time: new Date().toISOString() });
});

app.get('/api/status', (_req, res) => {
  res.json({
    realtime: process.env.DTC_API_KEY ? 'configured' : 'unavailable',
    database: pool ? 'configured' : 'unavailable'
  });
});

app.get('/api/realtime/vehicles', async (_req, res) => {
  try {
    const vehicles = await Promise.race([
      getRealtimeVehicles(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Realtime request exceeded 20 seconds')), 20000)
      )
    ]);

    if (pool && vehicles.length > 0) {
      saveVehicles(vehicles).catch(error =>
        console.error('Failed to save realtime vehicles:', error)
      );
    }

    res.json({ status: 'OK', count: vehicles.length, vehicles });
  } catch (error) {
    const status = error?.code === 'NO_API_KEY' ? 503 : 502;
    res.status(status).json({
      status: 'UNAVAILABLE',
      count: 0,
      vehicles: [],
      reason: error instanceof Error ? error.message : 'Realtime request failed'
    });
  }
});

app.get('/api/stops/nearby', async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'UNAVAILABLE', reason: 'DATABASE_URL is not configured', stops: [] });
  const lat = numberOrNull(req.query.lat);
  const lon = numberOrNull(req.query.lon);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  if (lat === null || lon === null) return res.status(400).json({ status: 'ERROR', reason: 'lat and lon are required', stops: [] });

  const result = await pool.query(
    `SELECT DISTINCT ON (LOWER(TRIM(name)))
       stop_id, name, latitude, longitude, distance_m
     FROM (
       SELECT stop_id, name, latitude, longitude,
         (6371000 * acos(LEAST(1, GREATEST(-1,
           sin(radians($1))*sin(radians(latitude)) +
           cos(radians($1))*cos(radians(latitude))*cos(radians(longitude)-radians($2))
         )))) AS distance_m
       FROM stops
     ) nearby
     ORDER BY LOWER(TRIM(name)), distance_m
     LIMIT $3`,
    [lat, lon, limit]
  );
  res.json({ status: 'OK', stops: result.rows });
});

app.get('/api/search', async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'UNAVAILABLE', results: [], reason: 'DATABASE_URL is not configured' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ status: 'OK', results: [] });
  const like = `%${q}%`;
  const result = await pool.query(
    `SELECT 'stop' AS type, stop_id AS id, name AS label FROM stops WHERE name ILIKE $1
     UNION ALL
     SELECT 'route' AS type, route_id AS id,
            COALESCE(short_name, '') || CASE WHEN long_name IS NOT NULL THEN ' — ' || long_name ELSE '' END AS label
     FROM routes WHERE COALESCE(short_name,'') ILIKE $1 OR COALESCE(long_name,'') ILIKE $1
     ORDER BY label
     LIMIT 30`,
    [like]
  );
  res.json({ status: 'OK', results: result.rows });
});

async function ensureStaticData() {
  if (!pool) return;
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM stops) AS stops,
      (SELECT COUNT(*) FROM routes) AS routes,
      (SELECT COUNT(*) FROM route_stops) AS route_stops
  `);
  const counts = result.rows[0];
  if (Number(counts.stops) >= 1000 && Number(counts.routes) >= 500 && Number(counts.route_stops) >= 10000) {
    return;
  }

  console.log('Static GTFS data is missing/incomplete; importing the pinned OTD-derived dataset...');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/import-gtfs.js'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`GTFS import exited with code ${code}`));
    });
  });
}

await ensureStaticData();
app.listen(port, () => console.log(`United Delhi API listening on :${port}`));
