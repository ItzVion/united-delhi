# United Delhi Security & Reliability Audit

Audit date: 2026-09-24

## Scope

Reviewed the current `main` branch frontend, backend, Expo configuration, EAS workflow,
Render configuration, PostgreSQL schema, GTFS importer, realtime pipeline, API client,
navigation, map WebViews, and pure utility code.

## Fixed

- Fixed stop-arrivals runtime crash caused by destructuring vehicle objects incorrectly.
- Added public `routeShortName` to stop-arrival responses and use it in the UI.
- Added API rate limiting for the public API, health endpoint, and database-heavy endpoints.
- Added PostgreSQL pool error handling, connection timeouts, idle timeouts, and local-DB SSL handling.
- Added input validation for coordinates, route/stop IDs, speed, bearing, and search length.
- Escaped wildcard characters in PostgreSQL ILIKE search.
- Added realtime feed size/entity safety limits.
- Prevented overlapping realtime refreshes.
- Replaced thousands of individual vehicle INSERTs per poll with batched upserts.
- Added statement timeouts to vehicle persistence.
- Made realtime route-name lookup failure non-fatal to the realtime feed.
- Added cache-control headers for live/status endpoints.
- Made health checks return an actual unhealthy status when the database is down.
- Made GTFS import initialize the database schema when needed.
- Added GTFS download timeouts and size limits.
- Added GTFS validation before modifying database data.
- Ensured temporary GTFS data is cleaned up on failures.
- Removed the unused `adm-zip` dependency.
- Migrated screens to `react-native-safe-area-context`.
- Added missing `react-native-safe-area-context` and `react-native-screens` dependencies and synchronized the root lockfile.
- Removed the invalid/deprecated Expo splash configuration that triggered Expo Doctor.
- Fixed Search empty-state styling and distinguished API failure from a genuinely empty search.
- Added a timeout to Smart Leave location lookup.
- Added SRI integrity checks for Leaflet assets loaded in both map WebViews.
- Prevented the Nearby Stops action from silently doing nothing when location is unavailable.
- Removed non-functional Route Details tabs.
- Added automated frontend utility tests.
- Added GitHub CI for typechecking, tests, dependency audits, and backend syntax checks.
- Switched Render deployment to `npm ci` and added the Render health check path.
- Kept APK builds manual so ordinary code pushes do not consume EAS build resources.
- Applied the global API limiter middleware so the general 180/minute limit is actually enforced.
- Aligned render.yaml service name with the existing Render service.

## Important limitations / not fully verified here

- The repository could not be executed against the live OTD API or production Neon database from this audit environment.
- The official OTD static bus dataset currently published on the website is dated June 20, 2024; a compatible newer static dataset matching the current realtime route IDs has not been verified.
- Therefore some realtime internal route IDs may still lack a verified public `routes.short_name` mapping. No route number is hard-coded to hide that limitation.
- Full Android runtime testing and final APK installation still require the GitHub/EAS build and a physical Android device.
- Expo Doctor previously reported newer patch releases for Expo and expo-location. The project remains on tested SDK-57-compatible dependency ranges rather than changing a large transitive dependency graph without a complete build verification.

## Security posture

No application code path intentionally exposes `DTC_API_KEY` or `DATABASE_URL`.
SQL queries use PostgreSQL parameters.
The API is read-only from the public client surface.
Visible route/stop values are escaped or inserted with DOM `textContent`; map popup handlers no longer interpolate stop IDs into inline JavaScript.

## Verification

GitHub Actions workflow:
`.github/workflows/ci.yml`

APK workflow:
`.github/workflows/build-apk.yml`
