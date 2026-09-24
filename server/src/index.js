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
      statement_timeout: 10000,
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

const realtimeRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    status: 'RATE_LIMITED',
    reason: 'Too many realtime-feed requests. Please try again shortly.'
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

app.use('/api', apiRateLimit);

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

function observedAtFromTimestamp(value) {
  const seconds = numberOrNull(value);
  const milliseconds = seconds === null ? NaN : seconds * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || Math.abs(milliseconds) > 8640000000000000) {
    return new Date().toISOString();
  }
  return new Date(milliseconds).toISOString();
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
    observedAt: timestamp > 0 ? observedAtFromTimestamp(timestamp) : new Date().toISOString()
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
let vehicleSaveInFlight = false;

async function persistVehiclesIfIdle(vehicles) {
  if (!pool || vehicles.length === 0 || vehicleSaveInFlight) return;
  vehicleSaveInFlight = true;
  try {
    await saveVehicles(vehicles);
  } catch (error) {
    console.error('Failed to save realtime vehicles:', error);
  } finally {
    vehicleSaveInFlight = false;
  }
}

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
        void persistVehiclesIfIdle(vehicles);
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

app.get('/api/realtime/vehicles', realtimeRateLimit, (_req, res) => {
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
      `WITH route_matches AS (
         SELECT route_id, short_name, long_name
         FROM routes
         WHERE COALESCE(short_name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(long_name, '') ILIKE $1 ESCAPE '\\'
         ORDER BY
           CASE WHEN COALESCE(short_name, '') ILIKE $1 ESCAPE '\\' THEN 0 ELSE 1 END,
           short_name NULLS LAST,
           route_id
         LIMIT 30
       ),
       stop_matches AS (
         SELECT 'stop' AS type,
                stop_id AS id,
                name AS label,
                NULL::TEXT AS "fromStop",
                NULL::TEXT AS "toStop"
         FROM stops
         WHERE name ILIKE $1 ESCAPE '\\'
         ORDER BY name, stop_id
         LIMIT 20
       ),
       route_results AS (
         SELECT 'route' AS type,
                r.route_id AS id,
                CASE
                  WHEN r.short_name IS NULL OR TRIM(r.short_name) = '' THEN COALESCE(r.long_name, '')
                  ELSE REGEXP_REPLACE(TRIM(r.short_name), '(UP|DOWN)$', '', 'i')
                END AS label,
                (
                  SELECT s.name
                  FROM route_stops rs
                  JOIN stops s ON s.stop_id = rs.stop_id
                  WHERE rs.route_id = r.route_id
                  ORDER BY rs.stop_sequence ASC, s.name, s.stop_id
                  LIMIT 1
                ) AS "fromStop",
                (
                  SELECT s.name
                  FROM route_stops rs
                  JOIN stops s ON s.stop_id = rs.stop_id
                  WHERE rs.route_id = r.route_id
                  ORDER BY rs.stop_sequence DESC, s.name, s.stop_id
                  LIMIT 1
                ) AS "toStop"
         FROM route_matches r
       )
       SELECT type, id, label, "fromStop", "toStop"
       FROM (
         SELECT type, id, label, "fromStop", "toStop", 0 AS result_order
         FROM route_results
         UNION ALL
         SELECT type, id, label, "fromStop", "toStop", 1 AS result_order
         FROM stop_matches
       ) combined
       ORDER BY result_order, label, id
       LIMIT 50`,
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


app.get('/api/plan', dbRateLimit, async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'UNAVAILABLE', options: [], reason: 'DATABASE_URL is not configured' });

  const fromQuery = String(req.query.from || '').trim().slice(0, 80);
  const toQuery = String(req.query.to || '').trim().slice(0, 80);
  if (fromQuery.length < 2 || toQuery.length < 2) {
    return res.status(400).json({ status: 'ERROR', options: [], reason: 'Both from and to are required' });
  }

  try {
    const fromLike = '%' + fromQuery.replace(/[\\%_]/g, '\\\\async function ensureStaticData() {') + '%';
    const toLike = '%' + toQuery.replace(/[\\%_]/g, '\\\\async function ensureStaticData() {') + '%';

    const candidates = await pool.query(
      \`WITH origin AS (
         SELECT stop_id, name, latitude, longitude,
                CASE WHEN LOWER(name) = LOWER($1) THEN 0 ELSE 1 END AS priority
         FROM stops WHERE name ILIKE $2 ESCAPE '\\\\'
         ORDER BY priority, LENGTH(name), name, stop_id LIMIT 5
       ),
       destination AS (
         SELECT stop_id, name, latitude, longitude,
                CASE WHEN LOWER(name) = LOWER($3) THEN 0 ELSE 1 END AS priority
         FROM stops WHERE name ILIKE $4 ESCAPE '\\\\'
         ORDER BY priority, LENGTH(name), name, stop_id LIMIT 5
       )
       SELECT 'origin' AS kind, stop_id, name, latitude, longitude FROM origin
       UNION ALL
       SELECT 'destination' AS kind, stop_id, name, latitude, longitude FROM destination\`,
      [fromQuery, fromLike, toQuery, toLike]
    );

    const origins = candidates.rows.filter(row => row.kind === 'origin');
    const destinations = candidates.rows.filter(row => row.kind === 'destination');
    if (!origins.length || !destinations.length) {
      return res.json({
        status: 'NOT_FOUND',
        origin: origins[0] || null,
        destination: destinations[0] || null,
        options: [],
        reason: !origins.length ? 'Starting place not found' : 'Destination not found'
      });
    }

    const originIds = origins.map(row => String(row.stop_id));
    const destinationIds = destinations.map(row => String(row.stop_id));

    const direct = await pool.query(
      \`WITH matches AS (
         SELECT r.route_id, r.short_name,
                o.stop_id AS from_stop_id, o.name AS from_stop,
                d.stop_id AS to_stop_id, d.name AS to_stop,
                ABS(d.stop_sequence - o.stop_sequence) AS stop_hops
         FROM route_stops o
         JOIN route_stops d ON d.route_id = o.route_id
         JOIN routes r ON r.route_id = o.route_id
         WHERE o.stop_id = ANY($1::text[])
           AND d.stop_id = ANY($2::text[])
           AND d.stop_sequence > o.stop_sequence
       ), ranked AS (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY stop_hops, from_stop_id, to_stop_id) rn
         FROM matches
       )
       SELECT route_id, short_name, from_stop_id, from_stop, to_stop_id, to_stop, stop_hops
       FROM ranked WHERE rn = 1 ORDER BY stop_hops, route_id LIMIT 6\`,
      [originIds, destinationIds]
    );

    const originRoutes = await pool.query(
      \`SELECT DISTINCT route_id FROM route_stops WHERE stop_id = ANY($1::text[])\`,
      [originIds]
    );
    const destinationRoutes = await pool.query(
      \`SELECT DISTINCT route_id FROM route_stops WHERE stop_id = ANY($1::text[])\`,
      [destinationIds]
    );
    const originRouteIds = originRoutes.rows.map(row => String(row.route_id));
    const destinationRouteIds = destinationRoutes.rows.map(row => String(row.route_id));

    let transfers = { rows: [] };
    if (originRouteIds.length && destinationRouteIds.length) {
      transfers = await pool.query(
        \`WITH transfer_candidates AS (
           SELECT a.route_id AS first_route_id, b.route_id AS second_route_id,
                  a.stop_id AS transfer_stop_id, t.name AS transfer_stop,
                  a.stop_sequence AS first_transfer_seq, b.stop_sequence AS second_transfer_seq
           FROM route_stops a
           JOIN stops t ON t.stop_id = a.stop_id
           JOIN route_stops b ON b.stop_id = a.stop_id AND b.route_id = ANY($2::text[])
           WHERE a.route_id = ANY($1::text[]) AND a.route_id <> b.route_id
         ),
         journey_matches AS (
           SELECT tc.*, o.stop_id AS from_stop_id, o.name AS from_stop,
                  d.stop_id AS to_stop_id, d.name AS to_stop,
                  ABS(tc.first_transfer_seq - o.stop_sequence)
                    + ABS(d.stop_sequence - tc.second_transfer_seq) AS stop_hops
           FROM transfer_candidates tc
           JOIN route_stops o ON o.route_id = tc.first_route_id AND o.stop_id = ANY($3::text[])
           JOIN route_stops d ON d.route_id = tc.second_route_id AND d.stop_id = ANY($4::text[])
           WHERE tc.first_transfer_seq > o.stop_sequence
             AND d.stop_sequence > tc.second_transfer_seq
         ), ranked AS (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY first_route_id, second_route_id
             ORDER BY stop_hops, transfer_stop_id
           ) rn
           FROM journey_matches
         )
         SELECT * FROM ranked WHERE rn = 1
         ORDER BY stop_hops, first_route_id, second_route_id LIMIT 6\`,
        [originRouteIds, destinationRouteIds, originIds, destinationIds]
      );
    }

    const routeIds = [
      ...direct.rows.map(row => String(row.route_id)),
      ...transfers.rows.flatMap(row => [String(row.first_route_id), String(row.second_route_id)])
    ];
    const routeNames = routeIds.length
      ? await pool.query(\`SELECT route_id, short_name FROM routes WHERE route_id = ANY($1::text[])\`, [routeIds])
      : { rows: [] };
    const names = new Map(routeNames.rows.map(row => [
      String(row.route_id),
      String(row.short_name || row.route_id).replace(/(UP|DOWN)$/i, '')
    ]));

    const makeDuration = hops => Math.max(8, Math.round(Number(hops || 0) * 2.1 + 6));
    const options = [
      ...direct.rows.map(row => ({
        type: 'direct',
        durationMinutes: makeDuration(row.stop_hops),
        walkingMinutes: 6,
        legs: [{
          routeId: String(row.route_id),
          routeName: names.get(String(row.route_id)) || String(row.short_name || row.route_id),
          fromStop: row.from_stop, toStop: row.to_stop,
          fromStopId: String(row.from_stop_id), toStopId: String(row.to_stop_id)
        }],
        transferStop: null
      })),
      ...transfers.rows.map(row => ({
        type: 'one-transfer',
        durationMinutes: makeDuration(row.stop_hops) + 5,
        walkingMinutes: 6,
        legs: [
          {
            routeId: String(row.first_route_id),
            routeName: names.get(String(row.first_route_id)) || String(row.first_route_id),
            fromStop: row.from_stop, toStop: row.transfer_stop,
            fromStopId: String(row.from_stop_id), toStopId: String(row.transfer_stop_id)
          },
          {
            routeId: String(row.second_route_id),
            routeName: names.get(String(row.second_route_id)) || String(row.second_route_id),
            fromStop: row.transfer_stop, toStop: row.to_stop,
            fromStopId: String(row.transfer_stop_id), toStopId: String(row.to_stop_id)
          }
        ],
        transferStop: row.transfer_stop
      }))
    ].sort((a, b) => a.durationMinutes - b.durationMinutes);

    const unique = [];
    const seen = new Set();
    for (const option of options) {
      const key = option.legs.map(leg => leg.routeId).join('>');
      if (!seen.has(key)) { seen.add(key); unique.push(option); }
      if (unique.length === 5) break;
    }

    res.json({ status: 'OK', origin: origins[0], destination: destinations[0], options: unique });
  } catch (error) {
    console.error('Failed to plan journey:', error);
    res.status(500).json({ status: 'ERROR', options: [], reason: 'Journey planner is temporarily unavailable' });
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
