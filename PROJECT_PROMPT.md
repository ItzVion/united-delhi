# United Delhi — Project Prompt / Maintainer Context

Use this as the source of truth before making changes. Repository: ItzVion/united-delhi, branch main. This is a Delhi-wide transit app, not a single-neighborhood demo.

## Non-negotiable working rules
- Preserve working features. Inspect current main, live deployment state, and actual Neon schema before editing; don't assume an old chat, ZIP, dump, or stale deployment reflects current code.
- Make targeted, backward-compatible fixes. Never run destructive SQL, drop schemas, truncate tables, replace static datasets, or reset the database unless the user explicitly approves that exact destructive operation.
- Keep secrets out of Git, prompts, browser bundles, Android APKs, logs, and screenshots. DATABASE_URL and DTC_API_KEY belong in Render environment secrets only. Never copy a signed Neon Storage URL including its query string into documentation; signed URLs are temporary bearer credentials.
- No automatic GitHub Actions: .github/workflows/ci.yml is manual-only (workflow_dispatch). Vercel/Render may auto-deploy commits according to platform integration, but don't add extra workflows, builds, cron jobs, or cloud operations without need.
- Avoid unnecessary paid services, surprise bills, EAS cloud builds, and unrequested APK builds. Test the website first; the user manually builds/tests the APK later.
- Prefer grouped PowerShell commands with clear checks/error handling. Explain changes before destructive or billable operations.
- After edits, inspect diffs, run relevant typecheck/build/tests, deploy only through the intended setup, and verify live behavior. Do not claim tests/deploy/imports succeeded without evidence.

## Architecture

### Repository layout
- Root App.tsx, src/, app.json: Expo React Native mobile app (Android/iOS).
- web/: separate React + Vite browser frontend; build output is web/dist.
- server/: Node.js 22 + Express + PostgreSQL (pg) backend.
- server/scripts/import-dtc-static.mjs: validated, transactional DTC static GTFS importer.
- server/src/metro-sync.js: DMRC/Metro static GTFS import and direction-aware route linking.
- server/sql/001_reset_and_schema.sql: full schema rebuild script; DESTRUCTIVE because it drops public tables/views and recreates them. Never run it as a routine fix.
- web/vercel.json and root vercel.json: headers/CSP and Vercel API rewrites.

### Render backend
- Existing Render web service is United Delhi's backend.
- Backend source and working directory are server/ (Windows checkout equivalent ends in ...\server).
- Current committed render.yaml expresses commands from repository root as cd server && npm ci and cd server && npm start; server/package.json starts node src/index.js. Runtime must listen on 0.0.0.0:$PORT (current configured port 10000), health check /health.
- Avoid the double-path trap: if Render Dashboard's Root Directory is server/, use npm ci and npm start there (no additional cd server). If Root Directory is repository root, retain cd server && ... . Inspect actual live settings and logs before changing either.
- Start listening before slow initialization; never block health checks on feed imports. Realtime polling must be asynchronous, DB operations bounded, cache preserved on transient upstream errors, stale/error status honest.
- Main endpoints include /health, /healthz, /api/status, /api/realtime/vehicles, /api/search, /api/routes/:id, /api/stops/:id, /api/stops/:id/arrivals, /api/stops/nearby, /api/plan, /api/metro, /api/metro/routes/:id.

### Vercel website
- Production site: https://united-delhi.vercel.app.
- Vercel serves the repo project/root configuration and builds the dedicated web/ frontend into web/dist (root build script invokes the web build).
- Browser API default is same-origin /api; root vercel.json rewrites /api/:path* to https://united-delhi.onrender.com/api/:path*. Keep CSP connect-src, OSM tile hosts in img-src, and rewrites aligned. Avoid double prefixes such as /api/api.
- Web uses Leaflet/OpenStreetMap. Map logic is primarily web/src/components/MapView.tsx, fleet-colour logic web/src/lib.ts, and the legend web/src/components/Legend.tsx.

### Android / APK workflow
- Native Expo app is in root App.tsx and src/; package com.uniteddelhi.app. Version is recorded in app.json and root package.json.
- Native API base is EXPO_PUBLIC_API_BASE_URL; default production API is https://united-delhi.onrender.com. Never bundle DATABASE_URL or DTC_API_KEY.
- Local Windows APK command: npm run build:apk (calls scripts/build-local-v1.ps1); build:android:local also exists. User prefers local/manual APK builds over EAS cloud builds.
- Do not build an APK unless specifically asked. User tests website first, then manually builds the APK. Web deployments do not rebuild or update an APK automatically.
- When changing bus logic/colours, update backend + web + native consistently; verify route/vehicle-ID fallbacks and stale status in both apps.

## Neon / PostgreSQL / static feeds
- Neon is the canonical PostgreSQL database. User's project is patient-pine-59663945, default branch main. Keep credentials private.
- DTC tables: routes, stops, route_stops, static_feed_meta. Realtime cache: vehicle_positions. Metro tables: metro_routes, metro_stops, metro_route_stops, metro_feed_meta.
- Replacing static data must preserve vehicle_positions. DTC importer must only replace DTC static tables; Metro importer only Metro static tables; use transactions/validation/rollback and verify row counts afterward.
- User's supplied archives are in the existing Neon Storage bucket united-delhi-static-v1, object names dtc-static-gtfs-v1.zip and dmrc-static-gtfs-v1.zip. Documentation may include object paths but must never include signed upload URL query strings.
- User-supplied reference exports attached on 2026-10-09:
  - DTC files: routes (2)(1).sql, stops (1)(2).sql, route_stops (2)(1).sql, static_feed_meta.sql. Metadata in the export records 2,554 routes, 6,812 stops and 86,326 route-stop links.
  - Metro files: metro_routes.sql, metro_stops.sql, metro_route_stops.sql, metro_feed_meta.sql. Metadata records 18 directional route rows, 262 stops and 830 route-stop links.
  - GTFS archives: delhi_buses_static_gtfs_v1 (1).zip (bus data dated around 2026-09-02) and dmrc_static_gtfs_v1(1).zip (Metro data dated 2023-08-10).
- The uploaded .sql files are data-export INSERT scripts, not migrations and not guaranteed to match current production forever. Treat the counts above as reference counts from those snapshots. Check current Neon row counts + feed metadata before judging freshness. Do not blindly replay the INSERT dumps into production.
- Schema changes belong in a non-destructive migration. server/sql/001_reset_and_schema.sql is a deliberate full reset and requires explicit approval.
- Metro directions must stay separate in metro_route_stops via direction_id. Never combine opposite-direction stops into one sorted list; stations will interleave. The route API should expose directions and the frontend should let users select one.
- Verify static_feed_meta and metro_feed_meta after imports rather than trusting old logs.

## Fleet colouring — regression rule
The registration/vehicle identity is authoritative over potentially stale serviceColor values. Keep the same map in backend classifyFleet, web busColor/map markers, native resolveVehicleColor, and the legend:
- DL51EV… -> EV AC (12 mtr), dark teal #0E7490.
- DL51GD… -> EV DEVI AC (9 mtr), green #16A34A.
- DL1PB…, DL1PC…, DL1PD… -> CNG Non-AC (12 mtr), orange #F97316.
- DL1PE… -> CNG AC (12 mtr), blue #1D4ED8.
- Unknown IDs -> slate #64748B unless reliable fleet metadata is available.
- User's exact screenshot example DL1PD4669 must be orange, never blue. Don't infer fleet colour from the bus route number/route ID. Ensure visible map marker, popup pill, route page, stop arrivals, and legend agree. If API colour is correct while browser still displays blue, inspect CDN/browser/local cache and deployed asset version. Add regression test for DL1PD4669 if touching classification logic.
- At low zoom, distinguish crowded markers using category-specific sizes/outlines. Do not hide real live vehicles just to make colours look balanced; category counts can genuinely be uneven.

## Realtime and freshness
- Realtime comes from Delhi OTD VehiclePositions.pb; DTC_API_KEY is server-side only.
- Poll interval is about 15 seconds; Neon vehicle persistence is throttled (currently once per minute) to reduce writes. Preserve last-good vehicles when upstream fetch/protobuf decoding fails and report stale status honestly.
- Logs have sometimes shown protobuf errors such as missing required 'header' or empty/invalid responses. These must not erase cached vehicles; inspect actual logs/timestamps.

## Validation commands
From repository root:
~~~powershell
npm ci
npm run typecheck
npm test
npm run web:check
npm --prefix web install
npm --prefix web run typecheck
npm --prefix web run build
cd server
npm ci
npm run check
node --check scripts/import-dtc-static.mjs
~~~
Use existing lockfiles and avoid needless installs if dependencies are already present. Web build success does not prove the native app builds; don't claim Android checks passed unless actually run.

## Security and deployment guardrails
- Never paste/commit .env, Render secret values, DATABASE_URL, DTC_API_KEY, or signed Neon Storage URLs.
- Do not clear vehicle_positions as part of static-data replacement.
- Don't add auto-triggered GitHub Actions, monitoring automations, cron jobs, or cloud builds unless the user explicitly asks.
- After changes, verify Vercel and Render commits/states, /health, /api/status, /api/realtime/vehicles, bus search/route/stop, and both directions on representative Metro lines.
- Be explicit about what actually passed and what hasn't been tested.

## User's intended workflow
1. Inspect/update main.
2. Fix website/backend first while preserving live service.
3. User tests https://united-delhi.vercel.app.
4. Only after user approves website does the user manually build the APK locally.
5. No unrequested EAS build and no claim an APK exists unless it was built.
