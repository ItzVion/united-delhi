# United Delhi API v2

The server exposes HTTP immediately. GTFS seeding and realtime polling run in the background after startup, so Render health checks never wait for Neon or the DTC feed.

Secrets are server-only: DATABASE_URL and DTC_API_KEY must never be bundled into the web app or APK.

Static route/stop metadata is loaded from data/otd_gtfs. Live vehicles come from the configured GTFS-Realtime endpoint.

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
