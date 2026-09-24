import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { spawn } from 'node:child_process';
import { rateLimit } from 'express-rate-limit';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000);

const databaseUrl = process.env.DATABASE_URL || '';
const isLocalDatabase = /(?:localhost|127(?:\\.\\d+){3}|::1)/i.test(databaseUrl);
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      ...(isLocalDatabase ? {} : { ssl: { rejectUnauthorized: false } })
    })
  : null;

if (pool) {
  pool.on('error', error => {
    console.error('PostgreSQL pool error:', error);
  });
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    status: 'RATE_LIMITED',
    reason: 'Too many requests. Please try again shortly.'
  }
});

const dbRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 45,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    status: 'RATE_LIMITED',
    reason: 'Too many database requests. Please try again shortly.'
  }
});

const healthRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    status: 'RATE_LIMITED',
    reason: 'Too many health checks. Please try again shortly.'
  }
});

const ok = value => value !== undefined && value !== null && value !== '';

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCoordinate(value, min, max) {
  const n = numberOrNull(value);
  return n !== null && n >= min && n <= max ? n : null;
}

function requestId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 200) return null;
  return id;
}

function normalizeSpeed(value) {
  const speed = numberOrNull(value);
  return speed !== null && speed >= 0 && speed <= 100 ? speed : null;
}

function normalizeBearing(value) {
  const bearing = numberOrNull(value);
  return bearing !== null && bearing >= 0 && bearing <= 360 ? bearing : null;
}

function entityToVehicle(entity) {
  const vehicle = entity.vehicle;
  if (!vehicle?.position) return null;

  const position = vehicle.position;
  const trip = vehicle.trip || {};
  const descriptor = vehicle.vehicle || {};
  const lat = parseCoordinate(position.latitude, -90, 90);
  const lon = parseCoordinate(position.longitude, -180, 180);
  if (lat === null || lon === null) return null;

  const timestamp = Number(vehicle.timestamp || 0);
  return {
    id: String(descriptor.id || vehicle.id || entity.id || '').trim(),
    routeId: ok(trip.routeId) ? String(trip.routeId).trim() : null,
    routeShortName: null,
    tripId: ok(trip.tripId) ? String(trip.tripId).trim() : null,
    stopId: ok(vehicle.stopId) ? String(vehicle.stopId).trim() : null,
    latitude: lat,
    longitude: lon,
    bearing: normalizeBearing(position.bearing),
    speedMps: normalizeSpeed(position.speed),
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
  const MAX_REALTIME_BYTES = 10 * 1024 * 1024;

  try {
    const upstream = await fetch(url, {
      headers: { accept: 'application/x-protobuf' },
      signal: controller.signal
    });

    if (!upstream.ok) {
      throw new Error(`OTD returned HTTP ${upstream.status}`);
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REALTIME_BYTES) {
      throw new Error('OTD realtime feed is unexpectedly large');
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_REALTIME_BYTES) {
      throw new Error('OTD realtime feed exceeded the 10 MB safety limit');
    }

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    if (feed.entity.length > 20_000) {
      throw new Error('OTD realtime feed contains too many entities');
    }

    const vehicles = feed.entity
      .map(entityToVehicle)
      .filter(Boolean)
      .filter(vehicle => vehicle.id);

    if (pool && vehicles.length > 0) {
      const routeIds = [...new Set(vehicles.map(vehicle => vehicle.routeId).filter(Boolean))];
      if (routeIds.length > 0) {
        try {
          const result = await pool.query(
            `SELECT route_id, short_name
             FROM routes
             WHERE route_id = ANY($1::text[])`,
            [routeIds]
          );
          const routeNames = new Map(
            result.rows.map(row => [
              String(row.route_id),
              row.short_name ? String(row.short_name).trim() : null
            ])
          );
          for (const vehicle of vehicles) {
            vehicle.routeShortName = vehicle.routeId
              ? routeNames.get(String(vehicle.routeId)) || null
              : null;
          }
        } catch (error) {
          console.error('Realtime route-name lookup failed:', error);
          // Keep realtime vehicles usable even when static DB lookup is temporarily unavailable.
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

const realtimeCache = {
  vehicles: [],
  status: 'INIT',
  reason: null,
  fetchedAt: null
};

let realtimeRefreshInFlight = null;

async function refreshRealtimeCache() {
  if (realtimeRefreshInFlight) return realtimeRefreshInFlight;

  realtimeRefreshInFlight = (async () => {
    try {
      const vehicles = await getRealtimeVehicles();
      realtimeCache.vehicles = vehicles;
      realtimeCache.status = 'OK';
      realtimeCache.reason = null;
      realtimeCache.fetchedAt = new Date().toISOString();

      if (pool && vehicles.length > 0) {
        saveVehicles(vehicles).catch(error => {
          console.error('Failed to save realtime vehicles:', error);
        });
      }
    } catch (error) {
      if (!realtimeCache.fetchedAt) {
        realtimeCache.status = 'UNAVAILABLE';
      }
      realtimeCache.reason = error instanceof Error ? error.message : 'Realtime request failed';
      console.error('Realtime poll failed:', realtimeCache.reason);
    }
  })().finally(() => {
    realtimeRefreshInFlight = null;
  });

  return realtimeRefreshInFlight;
}

function startRealtimePolling() {
  if (!process.env.DTC_API_KEY) {
    realtimeCache.status = 'UNAVAILABLE';
    realtimeCache.reason = 'DTC_API_KEY is not configured';
    return;
  }

  void refreshRealtimeCache();
  setInterval(() => void refreshRealtimeCache(), 12000);
}

async function saveVehicles(vehicles) {
  if (!pool || vehicles.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '15000'");

    const chunkSize = 500;
    for (let i = 0; i < vehicles.length; i += chunkSize) {
      const chunk = vehicles.slice(i, i + chunkSize);
      const values = [];
      const placeholders = chunk.map((v, index) => {
        const base = index * 8;
        values.push(
          v.id,
          v.routeId,
          v.stopId,
          v.latitude,
          v.longitude,
          v.bearing,
          v.speedMps,
          v.observedAt
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},NOW())`;
      }).join(',');

      await client.query(
        `INSERT INTO vehicle_positions
          (vehicle_id, route_id, stop_id, latitude, longitude, bearing, speed_mps, observed_at, updated_at)
         VALUES ${placeholders}
         ON CONFLICT (vehicle_id) DO UPDATE SET
           route_id=EXCLUDED.route_id,
           stop_id=EXCLUDED.stop_id,
           latitude=EXCLUDED.latitude,
           longitude=EXCLUDED.longitude,
           bearing=EXCLUDED.bearing,
           speed_mps=EXCLUDED.speed_mps,
           observed_at=EXCLUDED.observed_at,
           updated_at=NOW()`,
        values
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'united-delhi-api' });
});

app.get('/health', healthRateLimit, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let database = 'not_configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      database = 'ok';
    } catch {
      database = 'error';
    }
  }

  res.status(database === 'ok' ? 200 : 503).json({
    ok: database !== 'error',
    service: 'united-delhi-api',
    database,
    realtime: realtimeCache.status,
    lastRealtimeFetch: realtimeCache.fetchedAt,
    time: new Date().toISOString()
  });
});

app.get('/api/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    realtime: process.env.DTC_API_KEY ? 'configured' : 'unavailable',
    database: pool ? 'configured' : 'unavailable',
    realtimeCache: realtimeCache.status,
    lastRealtimeFetch: realtimeCache.fetchedAt
  });
});

app.get('/api/realtime/vehicles', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (realtimeCache.status === 'UNAVAILABLE' && realtimeCache.vehicles.length === 0) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      count: 0,
      vehicles: [],
      reason: realtimeCache.reason || 'Realtime feed not yet available'
    });
  }

  const stale = realtimeCache.fetchedAt
    ? Date.now() - Date.parse(realtimeCache.fetchedAt) > 180000
    : true;

  res.json({
    status: 'OK',
    count: realtimeCache.vehicles.length,
    vehicles: realtimeCache.vehicles,
    fetchedAt: realtimeCache.fetchedAt,
    stale
  });
});

app.get('/api/stops/nearby', dbRateLimit, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      reason: 'DATABASE_URL is not configured',
      stops: []
    });
  }

  const lat = parseCoordinate(req.query.lat, -90, 90);
  const lon = parseCoordinate(req.query.lon, -180, 180);
  const limitNumber = Number(req.query.limit);
  const limit = Number.isFinite(limitNumber)
    ? Math.min(Math.max(Math.trunc(limitNumber), 1), 50)
    : 10;

  if (lat === null || lon === null) {
    return res.status(400).json({
      status: 'ERROR',
      reason: 'Valid lat and lon are required',
      stops: []
    });
  }

  try {
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
         ORDER BY LOWER(TRIM(name)), distance_m, stop_id
       ) unique_stops
       ORDER BY distance_m, stop_id
       LIMIT $3`,
      [lat, lon, limit]
    );

    res.json({ status: 'OK', stops: result.rows });
  } catch (error) {
    console.error('Failed to load nearby stops:', error);
    res.status(500).json({ status: 'ERROR', stops: [], reason: 'Failed to load nearby stops' });
  }
});

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = value => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1))
    * Math.cos(toRad(lat2))
    * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

app.get('/api/stops/:id/arrivals', dbRateLimit, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      arrivals: [],
      reason: 'DATABASE_URL is not configured'
    });
  }

  const stopId = requestId(req.params.id);
  if (!stopId) {
    return res.status(400).json({
      status: 'ERROR',
      arrivals: [],
      reason: 'Invalid stop id'
    });
  }

  try {
    const result = await pool.query(
      `SELECT rs.route_id, r.short_name
       FROM route_stops rs
       LEFT JOIN routes r ON r.route_id = rs.route_id
       WHERE rs.stop_id = $1`,
      [stopId]
    );

    const routeNames = new Map(
      result.rows.map(row => [
        String(row.route_id),
        row.short_name ? String(row.short_name).trim() : null
      ])
    );
    const routeIds = new Set(routeNames.keys());

    const stop = await pool.query(
      `SELECT latitude, longitude
       FROM stops
       WHERE stop_id = $1`,
      [stopId]
    );

    if (stop.rows.length === 0) {
      return res.status(404).json({
        status: 'NOT_FOUND',
        arrivals: [],
        reason: 'Stop not found'
      });
    }

    const stopLat = Number(stop.rows[0].latitude);
    const stopLon = Number(stop.rows[0].longitude);
    const now = Date.now();

    const matchingVehicles = realtimeCache.vehicles.filter(
      vehicle => vehicle.routeId && routeIds.has(String(vehicle.routeId))
    );

    const output = matchingVehicles
      .map(vehicle => {
        const distanceMeters = haversineMeters(
          vehicle.latitude,
          vehicle.longitude,
          stopLat,
          stopLon
        );
        const speed = Number(vehicle.speedMps);
        const observedAt = Date.parse(vehicle.observedAt);
        const observedAgeSeconds = Number.isFinite(observedAt)
          ? Math.max(0, Math.round((now - observedAt) / 1000))
          : 0;
        const canEstimate = Number.isFinite(speed)
          && speed > 0.5
          && observedAgeSeconds <= 180;

        return {
          vehicleId: vehicle.id,
          routeId: vehicle.routeId,
          routeShortName: vehicle.routeId
            ? routeNames.get(String(vehicle.routeId)) || null
            : null,
          distanceMeters: Math.max(0, Math.round(distanceMeters)),
          etaSeconds: canEstimate
            ? Math.max(0, Math.round(distanceMeters / speed))
            : null,
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
    res.status(500).json({
      status: 'ERROR',
      arrivals: [],
      reason: 'Failed to load arrivals'
    });
  }
});

app.get('/api/stops/:id', dbRateLimit, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      reason: 'DATABASE_URL is not configured'
    });
  }

  const stopId = requestId(req.params.id);
  if (!stopId) {
    return res.status(400).json({ status: 'ERROR', reason: 'Invalid stop id' });
  }

  try {
    const stopResult = await pool.query(
      `SELECT stop_id, name, latitude, longitude
       FROM stops
       WHERE stop_id = $1`,
      [stopId]
    );

    if (stopResult.rows.length === 0) {
      return res.status(404).json({
        status: 'NOT_FOUND',
        reason: 'Stop not found'
      });
    }

    const routesResult = await pool.query(
      `SELECT r.route_id, r.short_name, r.long_name, rs.stop_sequence
       FROM route_stops rs
       JOIN routes r ON r.route_id = rs.route_id
       WHERE rs.stop_id = $1
       ORDER BY r.short_name NULLS LAST, r.route_id`,
      [stopId]
    );

    res.json({
      status: 'OK',
      stop: stopResult.rows[0],
      routes: routesResult.rows
    });
  } catch (error) {
    console.error('Failed to load stop:', error);
    res.status(500).json({
      status: 'ERROR',
      reason: 'Failed to load stop'
    });
  }
});

app.get('/api/routes/:id', dbRateLimit, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      reason: 'DATABASE_URL is not configured'
    });
  }

  const routeId = requestId(req.params.id);
  if (!routeId) {
    return res.status(400).json({ status: 'ERROR', reason: 'Invalid route id' });
  }

  try {
    const routeResult = await pool.query(
      `SELECT route_id, short_name, long_name
       FROM routes
       WHERE route_id = $1`,
      [routeId]
    );

    if (routeResult.rows.length === 0) {
      return res.status(404).json({
        status: 'NOT_FOUND',
        reason: 'Route not found'
      });
    }

    const stopsResult = await pool.query(
      `SELECT s.stop_id, s.name, s.latitude, s.longitude, rs.stop_sequence
       FROM route_stops rs
       JOIN stops s ON s.stop_id = rs.stop_id
       WHERE rs.route_id = $1
       ORDER BY rs.stop_sequence, s.name, s.stop_id`,
      [routeId]
    );

    const vehicles = realtimeCache.vehicles.filter(
      vehicle => String(vehicle.routeId || '') === routeId
    );

    res.json({
      status: 'OK',
      route: routeResult.rows[0],
      stops: stopsResult.rows,
      vehicles
    });
  } catch (error) {
    console.error('Failed to load route:', error);
    res.status(500).json({
      status: 'ERROR',
      reason: 'Failed to load route'
    });
  }
});

app.get('/api/search', dbRateLimit, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      results: [],
      reason: 'DATABASE_URL is not configured'
    });
  }

  const rawQuery = String(req.query.q || '').trim();
  if (rawQuery.length < 2) {
    return res.json({ status: 'OK', results: [] });
  }

  const q = rawQuery.slice(0, 80);
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const like = `%${escaped}%`;

  try {
    const result = await pool.query(
      `SELECT 'stop' AS type, stop_id AS id, name AS label
       FROM stops
       WHERE name ILIKE $1 ESCAPE '\\'
       UNION ALL
       SELECT 'route' AS type, route_id AS id,
              COALESCE(short_name, '') ||
              CASE WHEN long_name IS NOT NULL THEN ' — ' || long_name ELSE '' END AS label
       FROM routes
       WHERE COALESCE(short_name, '') ILIKE $1 ESCAPE '\\'
          OR COALESCE(long_name, '') ILIKE $1 ESCAPE '\\'
       ORDER BY label
       LIMIT 30`,
      [like]
    );

    res.json({ status: 'OK', results: result.rows });
  } catch (error) {
    console.error('Failed to search transit data:', error);
    res.status(500).json({
      status: 'ERROR',
      results: [],
      reason: 'Search is temporarily unavailable'
    });
  }
});

async function ensureStaticData() {
  if (!pool) return;

  const tables = await pool.query(`
    SELECT
      to_regclass('public.stops') AS stops_table,
      to_regclass('public.routes') AS routes_table,
      to_regclass('public.route_stops') AS route_stops_table
  `);

  const row = tables.rows[0];
  const tablesExist = Boolean(row.stops_table && row.routes_table && row.route_stops_table);
  if (tablesExist) {
    const countsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM stops) AS stops,
        (SELECT COUNT(*) FROM routes) AS routes,
        (SELECT COUNT(*) FROM route_stops) AS route_stops
    `);
    const counts = countsResult.rows[0];

    if (
      Number(counts.stops) >= 1000
      && Number(counts.routes) >= 500
      && Number(counts.route_stops) >= 10000
    ) {
      return;
    }
  }

  console.log('Static GTFS data is missing/incomplete; starting the pinned dataset import...');

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

app.listen(port, () => {
  console.log(`United Delhi API listening on :${port}`);
  startRealtimePolling();
  void ensureStaticData().catch(error => {
    console.error('Static GTFS bootstrap failed:', error);
  });
});
