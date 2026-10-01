-- United Delhi V1 database reset + secure schema
-- WARNING: this DESTROYS the existing United Delhi application data in these tables.
-- Run in the United Delhi PostgreSQL database as the database owner/admin.
-- It is intentionally self-contained and does NOT contain credentials.
--
-- The API server uses the tables below and can still refresh static GTFS data afterwards.
-- RLS is enabled with a default-deny posture for direct SQL/API clients.
-- The server's PostgreSQL connection should use its normal trusted DB role.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Drop the application tables/views/functions owned by the app, regardless of prior schema state.
DROP TABLE IF EXISTS
  vehicle_positions,
  route_stops,
  routes,
  stops,
  static_feed_meta
CASCADE;

-- Static GTFS stops
CREATE TABLE stops (
  stop_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT stops_name_nonempty CHECK (btrim(name) <> ''),
  CONSTRAINT stops_latitude_valid CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT stops_longitude_valid CHECK (longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_stops_location ON stops (latitude, longitude);
CREATE INDEX idx_stops_name ON stops (lower(name));

-- Static GTFS routes
CREATE TABLE routes (
  route_id TEXT PRIMARY KEY,
  short_name TEXT,
  long_name TEXT,
  route_color TEXT,
  route_text_color TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT routes_id_nonempty CHECK (btrim(route_id) <> ''),
  CONSTRAINT routes_route_color_valid CHECK (
    route_color IS NULL OR route_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT routes_route_text_color_valid CHECK (
    route_text_color IS NULL OR route_text_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

CREATE INDEX idx_routes_short_name ON routes (lower(short_name));
CREATE INDEX idx_routes_long_name ON routes (lower(long_name));

-- Many-to-many route/stop relationship.
-- A route/stop pair is unique; stop_sequence keeps the first occurrence.
CREATE TABLE route_stops (
  route_id TEXT NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
  stop_id TEXT NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL,

  PRIMARY KEY (route_id, stop_id),
  CONSTRAINT route_stops_sequence_valid CHECK (stop_sequence >= 0)
);

CREATE INDEX idx_route_stops_stop ON route_stops (stop_id);
CREATE INDEX idx_route_stops_route_sequence ON route_stops (route_id, stop_sequence);

-- Latest realtime position per vehicle.
CREATE TABLE vehicle_positions (
  vehicle_id TEXT PRIMARY KEY,
  route_id TEXT,
  stop_id TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  bearing DOUBLE PRECISION,
  observed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vehicle_positions_id_nonempty CHECK (btrim(vehicle_id) <> ''),
  CONSTRAINT vehicle_positions_latitude_valid CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT vehicle_positions_longitude_valid CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT vehicle_positions_bearing_valid CHECK (
    bearing IS NULL OR bearing BETWEEN 0 AND 360
  )
);

CREATE INDEX idx_vehicle_positions_route ON vehicle_positions (route_id);
CREATE INDEX idx_vehicle_positions_stop ON vehicle_positions (stop_id);
CREATE INDEX idx_vehicle_positions_observed ON vehicle_positions (observed_at DESC);
CREATE INDEX idx_vehicle_positions_location
  ON vehicle_positions (latitude, longitude);

-- Realtime/static data source metadata and import counts.
CREATE TABLE static_feed_meta (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  source_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_route_count INTEGER,
  imported_stop_count INTEGER,
  imported_route_stop_count INTEGER,

  CONSTRAINT static_feed_meta_singleton CHECK (id),
  CONSTRAINT static_feed_meta_imported_counts_valid CHECK (
    (imported_route_count IS NULL OR imported_route_count >= 0)
    AND (imported_stop_count IS NULL OR imported_stop_count >= 0)
    AND (imported_route_stop_count IS NULL OR imported_route_stop_count >= 0)
  )
);

-- Enable RLS on every application table.
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE static_feed_meta ENABLE ROW LEVEL SECURITY;

-- RLS is enabled for direct clients. The current backend uses its PostgreSQL
-- owner/admin connection for imports and queries, so we intentionally do not
-- FORCE RLS on that role. Non-owner roles still need an explicit policy and
-- therefore receive PostgreSQL's default-deny behavior when no policy applies.
-- Do not expose these tables directly to an untrusted client role.

COMMIT;

-- Verification queries:
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('stops','routes','route_stops','vehicle_positions','static_feed_meta')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('stops','routes','route_stops','vehicle_positions','static_feed_meta')
ORDER BY tablename, policyname;
