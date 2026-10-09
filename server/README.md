# United Delhi API v2

The server exposes HTTP immediately. Realtime polling and DMRC Metro static refresh run in the background after startup, so Render health checks never wait for Neon or the Transport Stack feed. DTC static route/stop data is canonical in Neon and is not bundled into the server.

Secrets are server-only: DATABASE_URL and TRANSPORT_STACK_API_KEY must never be bundled into the web app or APK.

DTC route/stop metadata is loaded from the canonical Neon PostgreSQL database. Live vehicle positions come from the Delhi Transport Stack GTFS-Realtime VehiclePositions.pb endpoint using the x-api-key request header. Set TRANSPORT_STACK_API_KEY in Render; TRANSPORT_STACK_REALTIME_URL defaults to the approved endpoint. Metro static data is refreshed separately by the DMRC GTFS synchronizer.

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

The realtime service refreshes its in-memory route metadata when the database was previously empty and then periodically (at most every 15 minutes), so a completed one-time static import is picked up without requiring a database-side restart.

### Live bus-livery colours

The current Transport Stack GTFS-Realtime VehiclePositions feed provides vehicle positions and identifiers, but it does not provide a verified physical bus-livery colour field. The API therefore returns `serviceColor: null` and `fleetColorSource: "not-provided-by-realtime-feed"` rather than inventing a colour from vehicle-ID prefixes or reusing old automatically generated Neon registry colours.

The fleet registry may retain vehicle-type metadata, but its `color_hex` value is not authoritative for live map rendering. Do not use `DL1PD`, `DL1PE`, or other registration prefixes to infer a bus's livery. Accurate per-vehicle colours require a separate, verified source that explicitly maps vehicle IDs to colours.
