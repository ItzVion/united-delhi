# United Delhi backend

Deploy this directory as a Render Web Service.

Environment variables:
- PORT (Render supplies this automatically)
- DTC_API_KEY (private; set only in Render environment variables)

Run locally:
npm install
npm run check
npm start

The backend deliberately returns UNAVAILABLE when the private DTC key or production GTFS data is missing. It never fabricates live vehicles.
