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
    routeShortName: null,
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
    const vehicles = feed.entity.map(entityToVehicle).filter(Boolean).filter(vehicle => vehicle.id);

    // GTFS-RT trip.routeId is the internal route_id (for example 2227),
    // while users should see the public DTC route number (for example 741).
    // Resolve the internal ID to routes.short_name once per realtime refresh.
    if (pool && vehicles.length > 0) {
      const routeIds = [...new Set(vehicles.map(vehicle => vehicle.routeId).filter(Boolean))];
      if (routeIds.length > 0) {
        const result = await pool.query(
          `SELECT route_id, short_name FROM routes WHERE route_id = ANY($1::text[])`,
          [routeIds]
        );
        const routeNames = new Map(result.rows.map(row => [String(row.route_id), row.short_name ? String(row.short_name) : null]));
        for (const vehicle of vehicles) {
          vehicle.routeShortName = vehicle.routeId ? routeNames.get(String(vehicle.routeId)) || null : null;
        }
      }
    }

    return vehicles;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('OTD realtime feed timed out after 15 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Background cache: poll DTC on a fixed interval instead of on every request.
// A slow/flaky DTC response then never blocks or fails a user's request -
// they always get whatever the last good snapshot was.
const realtimeCache = {
  vehicles: [],
  status: 'INIT',
  reason: null,
  fetchedAt: null
};

async function refreshRealtimeCache() {
  try {
    const vehicles = await getRealtimeVehicles();
    realtimeCache.vehicles = vehicles;
    realtimeCache.status = 'OK';
    realtimeCache.reason = null;
    realtimeCache.fetchedAt = new Date().toISOString();

    if (pool && vehicles.length > 0) {
      saveVehicles(vehicles).catch(error =>
        console.error('Failed to save realtime vehicles:', error)
      );
    }
  } catch (error) {
    if (!realtimeCache.fetchedAt) {
      realtimeCache.status = 'UNAVAILABLE';
    }
    realtimeCache.reason = error instanceof Error ? error.message : 'Realtime request failed';
    console.error('Realtime poll failed:', realtimeCache.reason);
  }
}

function startRealtimePolling() {
  if (!process.env.DTC_API_KEY) {
    realtimeCache.status = 'UNAVAILABLE';
    realtimeCache.reason = 'DTC_API_KEY is not configured';
    return;
  }
  refreshRealtimeCache();
  setInterval(refreshRealtimeCache, 12000);
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

app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'united-delhi-api' });
});

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

app.get('/api/realtime/vehicles', (_req, res) => {
  if (realtimeCache.status === 'UNAVAILABLE' && realtimeCache.vehicles.length === 0) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      count: 0,
      vehicles: [],
      reason: realtimeCache.reason || 'Realtime feed not yet available'
    });
  }

  res.json({
    status: 'OK',
    count: realtimeCache.vehicles.length,
    vehicles: realtimeCache.vehicles,
    fetchedAt: realtimeCache.fetchedAt
  });
});

app.get('/api/stops/nearby', async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'UNAVAILABLE', reason: 'DATABASE_URL is not configured', stops: [] });
  const lat = numberOrNull(req.query.lat);
  const lon = numberOrNull(req.query.lon);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  if (lat === null || lon === null) return res.status(400).json({ status: 'ERROR', reason: 'lat and lon are required', stops: [] });

  const result = await pool.query(
    `SELECT stop_id, name, latitude, longitude, distance_m
     FROM (
       SELECT DISTINCT ON (LOWER(TRIM(name)))
         stop_id, name, latitude, longitude, distance_m
       FROM (
         SELECT stop_id, name, latitude, longitude,
           (6371000 * acos(LEAST(1, GREATEST(-1,
             sin(radians($1))*sin(radians(latitude)) +
             cos(radians($1))*cos(radians(latitude))*cos(radians(longitude)-radians($2))
           )))) AS distance_m
         FROM stops
       ) calculated
       ORDER BY LOWER(TRIM(name)), distance_m
     ) unique_stops
     ORDER BY distance_m
     LIMIT $3`,
    [lat, lon, limit]
  );
  res.json({ status: 'OK', stops: result.rows });
});

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = value => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

app.get('/api/stops/:id/arrivals', async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'UNAVAILABLE', arrivals: [], reason: 'DATABASE_URL is not configured' });

  try {
    const stopId = String(req.params.id);
    const result = await pool.query(
      `SELECT route_id FROM route_stops WHERE stop_id = $1`,
      [stopId]
    );
    const routeIds = new Set(result.rows.map(row => String(row.route_id)));
    const now = Date.now();
    const arrivals = realtimeCache.vehicles
      .filter(vehicle => vehicle.routeId && routeIds.has(String(vehicle.routeId)));

    const stop = await pool.query(`SELECT latitude, longitude FROM stops WHERE stop_id = $1`, [stopId]);
    if (stop.rows.length === 0) {
      return res.status(404).json({ status: 'NOT_FOUND', arrivals: [], reason: 'Stop not found' });
    }
    const stopLat = Number(stop.rows[0].latitude);
    const stopLon = Number(stop.rows[0].longitude);

    const output = arrivals.map(({ vehicle }) => {
      const distanceMeters = haversineMeters(vehicle.latitude, vehicle.longitude, stopLat, stopLon);
      const speed = Number(vehicle.speedMps);
      const observedAt = Date.parse(vehicle.observedAt);
      const observedAgeSeconds = Number.isFinite(observedAt) ? Math.max(0, Math.round((now - observedAt) / 1000)) : 0;
      const canEstimate = Number.isFinite(speed) && speed > 0.5 && observedAgeSeconds <= 180;
      return {
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        distanceMeters: Math.round(distanceMeters),
        etaSeconds: canEstimate ? Math.max(0, Math.round(distanceMeters / speed)) : null,
        source: canEstimate ? 'live-data-estimate' : 'live-position-no-speed',
        observedAgeSeconds,
        confidence: canEstimate ? 'medium' : 'low'
      };
    })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 20);

    res.json({ status: 'OK', arrivals: output });
  } catch (error) {
    console.error('Failed to load stop arrivals:', error);
    res.status(500).json({ status: 'ERROR', arrivals: [], reason: 'Failed to load arrivals' });
  }
});

app.get('/api/stops/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'UNAVAILABLE', reason: 'DATABASE_URL is not configured' });
  try {
    const stopId = String(req.params.id);
    const stopResult = await pool.query(
      `SELECT stop_id, name, latitude, longitude FROM stops WHERE stop_id = $1`,
      [stopId]
    );
    if (stopResult.rows.length === 0) {
      return res.status(404).json({ status: 'NOT_FOUND', reason: 'Stop not found' });
    }
    const routesResult = await pool.query(
      `SELECT r.route_id, r.short_name, r.long_name, rs.stop_sequence
       FROM route_stops rs
       JOIN routes r ON r.route_id = rs.route_id
       WHERE rs.stop_id = $1
       ORDER BY r.short_name NULLS LAST, r.route_id`,
      [stopId]
    );
    res.json({ status: 'OK', stop: stopResult.rows[0], routes: routesResult.rows });
  } catch (error) {
    console.error('Failed to load stop:', error);
    res.status(500).json({ status: 'ERROR', reason: 'Failed to load stop' });
  }
});

app.get('/api/routes/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'UNAVAILABLE', reason: 'DATABASE_URL is not configured' });
  try {
    const routeId = String(req.params.id);
    const routeResult = await pool.query(
      `SELECT route_id, short_name, long_name FROM routes WHERE route_id = $1`,
      [routeId]
    );
    if (routeResult.rows.length === 0) {
      return res.status(404).json({ status: 'NOT_FOUND', reason: 'Route not found' });
    }
    const stopsResult = await pool.query(
      `SELECT s.stop_id, s.name, s.latitude, s.longitude, rs.stop_sequence
       FROM route_stops rs
       JOIN stops s ON s.stop_id = rs.stop_id
       WHERE rs.route_id = $1
       ORDER BY rs.stop_sequence, s.name`,
      [routeId]
    );
    const vehicles = realtimeCache.vehicles.filter(vehicle => String(vehicle.routeId || '') === routeId);
    res.json({ status: 'OK', route: routeResult.rows[0], stops: stopsResult.rows, vehicles });
  } catch (error) {
    console.error('Failed to load route:', error);
    res.status(500).json({ status: 'ERROR', reason: 'Failed to load route' });
  }
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
startRealtimePolling();
app.listen(port, () => console.log(`United Delhi API listening on :${port}`));