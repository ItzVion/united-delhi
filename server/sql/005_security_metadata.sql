-- Keep import metadata protected from direct database roles.
-- The backend connection can still operate as the database owner.
ALTER TABLE IF EXISTS static_feed_meta ENABLE ROW LEVEL SECURITY;
