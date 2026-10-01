# United Delhi backend

Deploy this directory as the backend service root.

Current production backend:
- Provider: Wasmer
- Service root: `server`
- Install command: `npm ci`
- Start command: `npm start`
- Health endpoint: `https://united-delhi.wasmer.app/health`
- API base URL: `https://united-delhi.wasmer.app`

Required environment variables:
- PORT (the host supplies this)
- DTC_REALTIME_RELAY_URL=https://united-delhi-realtime-relay.vercel.app/api/vehicles
- DTC_REALTIME_RELAY_SECRET (private; shared only between the backend and relay)
- DTC_API_KEY (private fallback; only needed if the relay is not used)
- DATABASE_URL (private Neon PostgreSQL connection string), or the Wasmer managed PostgreSQL fields:
  - DB_HOST
  - DB_PORT
  - DB_NAME
  - DB_USERNAME
  - DB_PASSWORD
- APP_ORIGINS (comma-separated browser origins; production should include https://united-delhi.vercel.app)

Secrets must remain in the hosting provider's environment and must never be committed.

Run locally from this directory:

```bash
npm ci
npm run check
npm start
```

The importer creates the required PostgreSQL tables when static GTFS data is missing or incomplete. The backend returns `UNAVAILABLE` when required production data is missing and never fabricates live vehicles.
