-- United Delhi base transit schema (additive, non-destructive).
-- Creates missing empty tables only. Does not DROP, TRUNCATE, or overwrite transit data.
-- Static GTFS contents must be imported separately through the reviewed importer scripts.

CREATE TABLE IF NOT EXISTS public.routes (
  route_id TEXT PRIMARY KEY,
  agency_id TEXT,
  short_name TEXT,
  long_name TEXT,
  route_color TEXT,
  route_text_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stops (
  stop_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.route_stops (
  route_id TEXT NOT NULL REFERENCES public.routes(route_id) ON DELETE CASCADE,
  stop_id TEXT NOT NULL REFERENCES public.stops(stop_id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL,
  PRIMARY KEY(route_id, stop_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS idx_stops_name ON public.stops(name);
CREATE INDEX IF NOT EXISTS idx_stops_coordinates ON public.stops(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop_sequence ON public.route_stops(stop_id, route_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_sequence ON public.route_stops(route_id, stop_sequence);

CREATE TABLE IF NOT EXISTS public.static_feed_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source_key TEXT,
  source_url TEXT,
  feed_version TEXT,
  feed_start_date TEXT,
  feed_end_date TEXT,
  imported_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_route_count INTEGER NOT NULL DEFAULT 0,
  imported_stop_count INTEGER NOT NULL DEFAULT 0,
  imported_route_stop_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vehicle_positions (
  vehicle_id TEXT PRIMARY KEY,
  route_id TEXT,
  trip_id TEXT,
  stop_id TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  bearing DOUBLE PRECISION,
  observed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_observed_at ON public.vehicle_positions(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_route_id ON public.vehicle_positions(route_id);

CREATE TABLE IF NOT EXISTS public.metro_routes (
  route_id TEXT PRIMARY KEY,
  agency_id TEXT,
  short_name TEXT,
  long_name TEXT,
  route_type INTEGER,
  route_color TEXT,
  route_text_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.metro_stops (
  stop_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_type INTEGER,
  parent_station TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.metro_route_stops (
  route_id TEXT NOT NULL REFERENCES public.metro_routes(route_id) ON DELETE CASCADE,
  direction_id INTEGER NOT NULL DEFAULT 0,
  stop_id TEXT NOT NULL REFERENCES public.metro_stops(stop_id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL,
  PRIMARY KEY(route_id, direction_id, stop_sequence, stop_id)
);
CREATE INDEX IF NOT EXISTS idx_metro_stops_name ON public.metro_stops(name);
CREATE INDEX IF NOT EXISTS idx_metro_stops_coordinates ON public.metro_stops(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_metro_route_stops_stop_sequence ON public.metro_route_stops(stop_id, route_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_metro_route_stops_route_sequence ON public.metro_route_stops(route_id, direction_id, stop_sequence);

CREATE TABLE IF NOT EXISTS public.metro_feed_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source_key TEXT,
  source_url TEXT,
  feed_version TEXT,
  feed_start_date TEXT,
  feed_end_date TEXT,
  imported_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_route_count INTEGER NOT NULL DEFAULT 0,
  imported_stop_count INTEGER NOT NULL DEFAULT 0,
  imported_route_stop_count INTEGER NOT NULL DEFAULT 0,
  -- Compatibility fields used by metro-sync.js.
  route_count INTEGER NOT NULL DEFAULT 0,
  stop_count INTEGER NOT NULL DEFAULT 0,
  route_stop_count INTEGER NOT NULL DEFAULT 0
);

-- Also upgrades an already-created table without dropping or replacing data.
ALTER TABLE public.metro_feed_meta ADD COLUMN IF NOT EXISTS route_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.metro_feed_meta ADD COLUMN IF NOT EXISTS stop_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.metro_feed_meta ADD COLUMN IF NOT EXISTS route_stop_count INTEGER NOT NULL DEFAULT 0;

-- Preserve imported direction data while aligning with integer direction IDs in the API.
ALTER TABLE public.metro_route_stops ALTER COLUMN direction_id DROP DEFAULT;
ALTER TABLE public.metro_route_stops ALTER COLUMN direction_id TYPE INTEGER USING direction_id::integer;
ALTER TABLE public.metro_route_stops ALTER COLUMN direction_id SET DEFAULT 0;
