# United Delhi backend

Deploy this directory as the backend service root.

Current hosted backend:
- Provider: Deplexo
- Service root: `server`
- Install command: `npm ci`
- Start command: `npm start`
- Health endpoint: `/health`
- API base URL: `https://united-delhi.de.deplexo.com`

Required environment variables:
- PORT (the host supplies this; current hosted value is 3000)
- DTC_API_KEY (private; set only in the backend environment)
- DATABASE_URL (Neon PostgreSQL connection string; keep private)

Run locally from this directory:

```bash
npm ci
npm run check
npm start
```

The importer creates the required PostgreSQL tables when static GTFS data is missing.
The backend returns `UNAVAILABLE` when required production data is missing and never
fabricates live vehicles.
