-- Realtime route lookups and freshness filtering use these indexes.
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_route_observed
  ON vehicle_positions(route_id, observed_at DESC);
