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
