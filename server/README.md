# United Delhi backend

Deploy this directory as the backend service root.

Current production backend:
- Provider: Render
- Service root: `server`
- Install command: `npm ci`
- Start command: `npm start`
- Health endpoint: `https://united-delhi.onrender.com/health`
- API base URL: `https://united-delhi.onrender.com`

Required environment variables:
- `PORT` (Render supplies this; the app defaults to 10000)
- `DTC_API_KEY` (private OTD realtime API key)
- `DATABASE_URL` (private Neon PostgreSQL connection string)
- `APP_ORIGINS` (optional comma-separated browser origins; production should include `https://united-delhi.vercel.app`)

There is no realtime relay. Render calls the official OTD realtime VehiclePositions protobuf endpoint directly with the private `DTC_API_KEY`.

Secrets must remain in the hosting provider's environment and must never be committed.

Run locally from this directory:

```bash
npm ci
npm run check
npm start
```

On startup, the backend applies the checked-in SQL migrations. If the pinned static GTFS data is missing or incomplete, it imports the validated dataset into Neon. Live vehicle positions are refreshed independently every 12 seconds and retained briefly in Neon for warm-cache fallback.
