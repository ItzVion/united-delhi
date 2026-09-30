CREATE TABLE IF NOT EXISTS static_feed_meta (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  source_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT static_feed_meta_singleton CHECK (id)
);


ALTER TABLE static_feed_meta
  ADD COLUMN IF NOT EXISTS imported_route_count INTEGER,
  ADD COLUMN IF NOT EXISTS imported_stop_count INTEGER,
  ADD COLUMN IF NOT EXISTS imported_route_stop_count INTEGER;
