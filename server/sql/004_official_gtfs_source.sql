CREATE TABLE IF NOT EXISTS static_feed_meta (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  source_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT static_feed_meta_singleton CHECK (id)
);
