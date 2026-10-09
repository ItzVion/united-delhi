# United Delhi API v2

The server exposes HTTP immediately. Realtime polling and DMRC Metro static refresh run in the background after startup, so Render health checks never wait for Neon or the DTC feed. DTC static route/stop data is canonical in Neon and is not bundled into the server.

Secrets are server-only: DATABASE_URL and DTC_API_KEY must never be bundled into the web app or APK.

DTC route/stop metadata is loaded from the canonical Neon PostgreSQL database. Live DTC vehicles come from the configured GTFS-Realtime endpoint. Metro static data is refreshed separately by the DMRC GTFS synchronizer.

Endpoints:
GET /health
GET /healthz
GET /ready
GET /api/status
GET /api/realtime/vehicles
GET /api/search?q=
GET /api/routes/:id
GET /api/stops/:id
GET /api/stops/:id/arrivals
POST /api/stops/nearby
GET /api/plan?fromStopId=&toStopId=

### DTC static data
DTC static route/stop data is canonical in Neon. The repository does not bundle the old DTC dataset and the API does not overwrite Neon static data on every startup.

To populate or refresh the DTC static tables once, provide the Neon connection string and run:

```bash
DATABASE_URL="..." npm run import:dtc
```

The importer uses the current public Mobility Database snapshot by default. Override it with `DTC_STATIC_URL` when a newer verified GTFS ZIP becomes available. Run `server/sql/001_reset_and_schema.sql` first when a full database reset/rebuild is intended.

The realtime service refreshes its in-memory DTC route metadata when the database was previously empty and then periodically (at most every 15 minutes), so a completed one-time static import is picked up without requiring a database-side restart.

### Exact per-vehicle fleet colours

The API creates and maintains `public.vehicle_fleet_registry` automatically. Each row is keyed by the exact `vehicle_id` and includes `bus_type`, `service_type`, and `color_hex`. New live vehicles are inserted once; existing rows are deliberately not overwritten by prefix-based guesses, so a correction made in Neon remains the source of truth.

You can view/edit the table in Neon Console → Tables → `vehicle_fleet_registry`. To correct a specific bus, update its row, for example:

```sql
UPDATE public.vehicle_fleet_registry
SET bus_type = 'CNG NonAC (12 mtr)',
    service_type = 'dtc',
    color_hex = '#F97316',
    source = 'manual',
    updated_at = NOW()
WHERE vehicle_id = 'DL1PD4669';
```

Changes are loaded by the API within about one minute. Web and Android display the serviceColor returned by the API without client-side overrides.
