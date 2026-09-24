# United Delhi backend

Deploy this directory as the Render Web Service root.

Required environment variables:
- PORT (Render supplies this automatically)
- DTC_API_KEY (private; set only in Render environment variables)
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
