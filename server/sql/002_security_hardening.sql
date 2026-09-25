REVOKE CREATE ON SCHEMA public FROM PUBLIC;

ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_positions ENABLE ROW LEVEL SECURITY;

UPDATE routes
SET route_color = CASE
  WHEN route_color IS NULL THEN NULL
  WHEN route_color ~ '^#[0-9A-Fa-f]{6}$' THEN upper(route_color)
  WHEN route_color ~ '^[0-9A-Fa-f]{6}$' THEN '#' || upper(route_color)
  ELSE NULL
END,
route_text_color = CASE
  WHEN route_text_color IS NULL THEN NULL
  WHEN route_text_color ~ '^#[0-9A-Fa-f]{6}$' THEN upper(route_text_color)
  WHEN route_text_color ~ '^[0-9A-Fa-f]{6}$' THEN '#' || upper(route_text_color)
  ELSE NULL
END;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stops_stop_id_length') THEN
    ALTER TABLE stops ADD CONSTRAINT stops_stop_id_length CHECK (length(stop_id) BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stops_name_length') THEN
    ALTER TABLE stops ADD CONSTRAINT stops_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stops_latitude_range') THEN
    ALTER TABLE stops ADD CONSTRAINT stops_latitude_range CHECK (latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stops_longitude_range') THEN
    ALTER TABLE stops ADD CONSTRAINT stops_longitude_range CHECK (longitude BETWEEN -180 AND 180);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_route_id_length') THEN
    ALTER TABLE routes ADD CONSTRAINT routes_route_id_length CHECK (length(route_id) BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_short_name_length') THEN
    ALTER TABLE routes ADD CONSTRAINT routes_short_name_length CHECK (short_name IS NULL OR length(btrim(short_name)) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_long_name_length') THEN
    ALTER TABLE routes ADD CONSTRAINT routes_long_name_length CHECK (long_name IS NULL OR length(btrim(long_name)) <= 300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_color_format') THEN
    ALTER TABLE routes ADD CONSTRAINT routes_color_format CHECK (route_color IS NULL OR route_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_text_color_format') THEN
    ALTER TABLE routes ADD CONSTRAINT routes_text_color_format CHECK (route_text_color IS NULL OR route_text_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_stops_sequence_nonnegative') THEN
    ALTER TABLE route_stops ADD CONSTRAINT route_stops_sequence_nonnegative CHECK (stop_sequence >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_vehicle_id_length') THEN
    ALTER TABLE vehicle_positions ADD CONSTRAINT vehicle_positions_vehicle_id_length CHECK (length(vehicle_id) BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_route_id_length') THEN
    ALTER TABLE vehicle_positions ADD CONSTRAINT vehicle_positions_route_id_length CHECK (route_id IS NULL OR length(route_id) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_stop_id_length') THEN
    ALTER TABLE vehicle_positions ADD CONSTRAINT vehicle_positions_stop_id_length CHECK (stop_id IS NULL OR length(stop_id) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_latitude_range') THEN
    ALTER TABLE vehicle_positions ADD CONSTRAINT vehicle_positions_latitude_range CHECK (latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_longitude_range') THEN
    ALTER TABLE vehicle_positions ADD CONSTRAINT vehicle_positions_longitude_range CHECK (longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_positions_bearing_range') THEN
    ALTER TABLE vehicle_positions ADD CONSTRAINT vehicle_positions_bearing_range CHECK (bearing IS NULL OR bearing BETWEEN 0 AND 360);
  END IF;

END $$;

CREATE INDEX IF NOT EXISTS idx_stops_name_lower ON stops (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_routes_short_name_lower ON routes (lower(btrim(short_name)));
CREATE INDEX IF NOT EXISTS idx_route_stops_route_sequence ON route_stops (route_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop_route ON route_stops (stop_id, route_id);
