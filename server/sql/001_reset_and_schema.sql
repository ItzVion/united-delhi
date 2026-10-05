-- UNITED DELHI COMPLETE DATABASE RESET + REBUILD
-- WARNING: this intentionally drops EVERY TABLE in public.
-- Paste the entire block into Neon SQL Editor.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE',r.tablename);
  END LOOP;
END $$;

CREATE TABLE routes (
  route_id TEXT PRIMARY KEY,
  agency_id TEXT,
  short_name TEXT,
  long_name TEXT,
  route_color TEXT,
  route_text_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stops (
  stop_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE route_stops (
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL CHECK(stop_sequence>=0),
  PRIMARY KEY(route_id,stop_id)
);

CREATE TABLE vehicle_positions (
  vehicle_id TEXT PRIMARY KEY,
  route_id TEXT,
  trip_id TEXT,
  stop_id TEXT,
  latitude DOUBLE PRECISION NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  bearing DOUBLE PRECISION CHECK(bearing IS NULL OR bearing BETWEEN 0 AND 360),
  observed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE static_feed_meta (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id),
  source_key TEXT,
  source_url TEXT,
  imported_at TIMESTAMPTZ,
  imported_route_count INTEGER NOT NULL DEFAULT 0,
  imported_stop_count INTEGER NOT NULL DEFAULT 0,
  imported_route_stop_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO static_feed_meta(id) VALUES(TRUE);

CREATE INDEX idx_routes_short_name ON routes(lower(short_name));
CREATE INDEX idx_routes_long_name ON routes(lower(long_name));
CREATE INDEX idx_stops_name ON stops(lower(name));
CREATE INDEX idx_stops_lat_lon ON stops(latitude,longitude);
CREATE INDEX idx_route_stops_stop ON route_stops(stop_id,route_id,stop_sequence);
CREATE INDEX idx_route_stops_route_sequence ON route_stops(route_id,stop_sequence);
CREATE INDEX idx_vehicle_positions_observed ON vehicle_positions(observed_at DESC);
CREATE INDEX idx_vehicle_positions_route ON vehicle_positions(route_id,observed_at DESC);
