BEGIN;

-- ============================================================
-- UNITED DELHI — COMPLETE DATABASE RESET + FIXED REBUILD
-- WARNING: THIS DELETES ALL EXISTING PUBLIC TABLE DATA.
-- ============================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'DROP TABLE IF EXISTS public.%I CASCADE',
            r.tablename
        );
    END LOOP;

    FOR r IN
        SELECT viewname
        FROM pg_views
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'DROP VIEW IF EXISTS public.%I CASCADE',
            r.viewname
        );
    END LOOP;

    FOR r IN
        SELECT matviewname
        FROM pg_matviews
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE',
            r.matviewname
        );
    END LOOP;
END $$;

CREATE TABLE public.routes (
    route_id TEXT PRIMARY KEY,
    agency_id TEXT,
    short_name TEXT,
    long_name TEXT,
    route_color TEXT,
    route_text_color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.stops (
    stop_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL
        CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL
        CHECK (longitude BETWEEN -180 AND 180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.route_stops (
    route_id TEXT NOT NULL
        REFERENCES public.routes(route_id)
        ON DELETE CASCADE,
    stop_id TEXT NOT NULL
        REFERENCES public.stops(stop_id)
        ON DELETE CASCADE,
    stop_sequence INTEGER NOT NULL
        CHECK (stop_sequence >= 0),
    PRIMARY KEY (route_id, stop_id, stop_sequence)
);

CREATE TABLE public.static_feed_meta (
    id INTEGER PRIMARY KEY
        CHECK (id = 1),
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

INSERT INTO public.static_feed_meta (id) VALUES (1);

CREATE TABLE public.vehicle_positions (
    vehicle_id TEXT PRIMARY KEY,
    route_id TEXT,
    trip_id TEXT,
    stop_id TEXT,
    latitude DOUBLE PRECISION NOT NULL
        CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL
        CHECK (longitude BETWEEN -180 AND 180),
    bearing DOUBLE PRECISION
        CHECK (bearing IS NULL OR bearing BETWEEN 0 AND 360),
    observed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.vehicle_fleet_registry (
    vehicle_id TEXT PRIMARY KEY,
    bus_type TEXT NOT NULL DEFAULT 'Unknown',
    service_type TEXT NOT NULL DEFAULT 'unknown'
        CHECK (service_type IN ('dtc', 'electric', 'unknown')),
    color_hex TEXT NOT NULL DEFAULT '#64748B'
        CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    source TEXT NOT NULL DEFAULT 'auto'
        CHECK (source IN ('auto', 'manual')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.metro_routes (
    route_id TEXT PRIMARY KEY,
    agency_id TEXT,
    short_name TEXT,
    long_name TEXT,
    route_type INTEGER,
    route_color TEXT,
    route_text_color TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.metro_stops (
    stop_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL
        CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL
        CHECK (longitude BETWEEN -180 AND 180),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.metro_route_stops (
    route_id TEXT NOT NULL
        REFERENCES public.metro_routes(route_id)
        ON DELETE CASCADE,
    direction_id INTEGER NOT NULL DEFAULT 0,
    stop_id TEXT NOT NULL
        REFERENCES public.metro_stops(stop_id)
        ON DELETE CASCADE,
    stop_sequence INTEGER NOT NULL
        CHECK (stop_sequence >= 0),
    PRIMARY KEY (route_id, direction_id, stop_id, stop_sequence)
);

CREATE TABLE public.metro_feed_meta (
    id INTEGER PRIMARY KEY
        CHECK (id = 1),
    source_url TEXT NOT NULL,
    source_key TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    route_count INTEGER NOT NULL DEFAULT 0,
    stop_count INTEGER NOT NULL DEFAULT 0,
    route_stop_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO public.metro_feed_meta (id, source_url, source_key)
VALUES (
    1,
    'https://otd.delhi.gov.in/data/staticDMRC/',
    'official-dmrc-gtfs'
);

CREATE INDEX idx_routes_short_name ON public.routes (LOWER(short_name));
CREATE INDEX idx_routes_long_name ON public.routes (LOWER(long_name));
CREATE INDEX idx_stops_name ON public.stops (LOWER(name));
CREATE INDEX idx_stops_lat_lon ON public.stops (latitude, longitude);
CREATE INDEX idx_route_stops_stop ON public.route_stops (stop_id, route_id, stop_sequence);
CREATE INDEX idx_route_stops_route_sequence ON public.route_stops (route_id, stop_sequence);
CREATE INDEX idx_vehicle_positions_observed ON public.vehicle_positions (observed_at DESC);
CREATE INDEX idx_vehicle_positions_route ON public.vehicle_positions (route_id, observed_at DESC);
CREATE INDEX idx_vehicle_positions_trip ON public.vehicle_positions (trip_id, observed_at DESC);
CREATE INDEX idx_vehicle_fleet_registry_color ON public.vehicle_fleet_registry (color_hex);
CREATE INDEX idx_vehicle_fleet_registry_type ON public.vehicle_fleet_registry (bus_type);

CREATE INDEX idx_metro_routes_short_name ON public.metro_routes (LOWER(short_name));
CREATE INDEX idx_metro_routes_long_name ON public.metro_routes (LOWER(long_name));
CREATE INDEX idx_metro_stops_name ON public.metro_stops (LOWER(name));
CREATE INDEX idx_metro_stops_lat_lon ON public.metro_stops (latitude, longitude);
CREATE INDEX idx_metro_route_stops_stop ON public.metro_route_stops (stop_id, stop_sequence);
CREATE INDEX idx_metro_route_stops_route ON public.metro_route_stops (route_id, stop_sequence);
CREATE INDEX idx_metro_route_stops_route_dir ON public.metro_route_stops (route_id, direction_id, stop_sequence);

ANALYZE public.routes;
ANALYZE public.stops;
ANALYZE public.route_stops;
ANALYZE public.vehicle_positions;
ANALYZE public.vehicle_fleet_registry;
ANALYZE public.metro_routes;
ANALYZE public.metro_stops;
ANALYZE public.metro_route_stops;
ANALYZE public.static_feed_meta;
ANALYZE public.metro_feed_meta;

COMMIT;

SELECT
    'routes' AS table_name, COUNT(*) AS rows
FROM public.routes
UNION ALL
SELECT 'stops', COUNT(*) FROM public.stops
UNION ALL
SELECT 'route_stops', COUNT(*) FROM public.route_stops
UNION ALL
SELECT 'vehicle_positions', COUNT(*) FROM public.vehicle_positions
UNION ALL
SELECT 'metro_routes', COUNT(*) FROM public.metro_routes
UNION ALL
SELECT 'metro_stops', COUNT(*) FROM public.metro_stops
UNION ALL
SELECT 'metro_route_stops', COUNT(*) FROM public.metro_route_stops
ORDER BY table_name;
