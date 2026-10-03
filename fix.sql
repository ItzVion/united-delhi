-- United Delhi - safe database performance fixes
-- REVIEW BEFORE RUNNING. This file is non-destructive and idempotent.
-- It does NOT add, delete, update, truncate, or replace application data.
-- It requires permission to create the pg_trgm extension.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_stops_name_trgm
  ON public.stops USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_routes_short_name_trgm
  ON public.routes USING gin ((COALESCE(short_name, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_routes_long_name_trgm
  ON public.routes USING gin ((COALESCE(long_name, '')) gin_trgm_ops);
