-- Defense-in-depth for the Neon/PostgreSQL database.
-- The backend connects through DATABASE_URL; the public app never connects directly to Postgres.
-- RLS is enabled on every application table. Direct application-owner access remains available
-- for the backend importer, while PUBLIC table privileges are removed.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

ALTER TABLE IF EXISTS stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vehicle_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS static_feed_meta ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE stops, routes, route_stops, vehicle_positions, static_feed_meta FROM PUBLIC;

-- Prevent future objects from accidentally becoming PUBLIC-readable/writable.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
