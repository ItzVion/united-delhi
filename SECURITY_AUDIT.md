# United Delhi Security & Reliability Audit

Audit date: 2026-10-04

## Scope

Reviewed:

- Expo/React Native frontend
- API client and configuration
- Leaflet WebViews and dynamic map content
- Express backend and realtime pipeline
- PostgreSQL schema/migrations
- GTFS importer
- GitHub Actions
- dependency configuration
- uploaded PostgreSQL exports
- repository secrets/configuration
- branch state

## Findings fixed

### Backend / API

- Enforced TLS certificate verification for non-local PostgreSQL connections.
- Added strict JSON parsing and a 32 KB request-body limit.
- Added security response headers including nosniff, no-referrer, X-Frame-Options, restrictive Permissions-Policy, CSP for API responses, and HSTS on HTTPS requests.
- Disabled API response caching with Cache-Control: no-store.
- Kept CORS deny-by-default unless explicit APP_ORIGINS are configured.
- Kept global and endpoint-specific rate limits.
- Added strict identifier/text bounds.
- Rejected empty wildcard-only search patterns so % and _ input cannot force an unbounded search.
- Kept SQL parameterized throughout the reviewed backend.
- Added realtime vehicle ID bounds and coordinate/bearing validation.
- Deduplicated realtime vehicles by vehicle ID before persistence.
- Rejected realtime timestamps older than 24 hours or more than 5 minutes in the future.
- Added HTTP request/header/keep-alive timeouts.
- Added JSON 404 and final error handling without exposing internal exception details to clients.
- Restored/fixed the /api/plan backend endpoint so the Journey Planner is not a dead client feature.
- Corrected direct and one-transfer planner sequence calculations.
- Kept planner input bounded and parameterized.

### Database

Added server/sql/002_security_hardening.sql and server/sql/006_database_security.sql with rerunnable integrity and access-control hardening:

- stop ID/name length checks
- stop latitude/longitude bounds
- route ID/name length checks
- normalized six-digit route colors
- route color format checks
- non-negative stop sequences
- vehicle ID/route/stop ID bounds
- vehicle coordinate/bearing bounds
- indexes for stop-name lookup, route-name lookup, route sequencing, and stop-to-route lookup
- revoked public CREATE privilege on the public PostgreSQL schema to reduce object-shadowing risk
- enabled PostgreSQL Row Level Security on all application tables, including static_feed_meta and the Metro static tables; no permissive policies are created because the mobile app has no direct database connection, so non-owner roles default to deny
- revoked PUBLIC table privileges for the application tables and revoked future default table/sequence/function privileges from PUBLIC

The migration is applied before static-data checks and by the GTFS importer.

No foreign key was added from realtime vehicle_positions.route_id to routes.route_id, because the current dataset contains realtime route IDs that are not present in the static routes table. Adding that FK would break realtime ingestion rather than fix it.

### GTFS importer

- Runs all numbered SQL migrations.
- Uses verified TLS for remote PostgreSQL connections.
- Normalizes GTFS route colors before storage.
- Keeps parameterized bulk inserts and bounded chunks.
- Keeps source download size/time limits and temporary-file cleanup.

### Frontend

- API base URL is normalized and must use HTTPS outside localhost development.
- Existing WebView map code was checked for HTML/JavaScript injection.
- Dynamic route labels are HTML-escaped.
- Route colors are validated against a strict six-digit hex format before being inserted into map styles.
- Stop names in route-map popups use DOM textContent, not HTML interpolation.
- No dangerouslySetInnerHTML, WebView injected JavaScript, or arbitrary evaluateJavaScript path was found in the reviewed screens.
- API request paths encode route/stop/search parameters.

### GitHub Actions / supply chain

- GitHub Actions checkout and setup-node are pinned to immutable commit SHAs.
- Dependency audits run in CI.
- Added an npm override for uuid 11.1.1 to eliminate the transitive moderate-severity advisory without forcing an Expo SDK downgrade.
- CI enforces the repository's configured npm audit severity gate; the current gate is `critical` because the Expo toolchain has higher-severity advisories that cannot be removed safely without an incompatible toolchain upgrade.
- Added a security reporting policy.
- Workflow permissions are read-only for CI.
- Security review distinguishes known advisories from exploitable production exposure instead of claiming that a non-zero advisory count is automatically zero risk.

## Database export audit

The supplied exports were also checked independently.

Known export sizes:

- routes: 2,403 rows
- stops: 10,558 rows
- route_stops: 98,656 rows
- vehicle_positions: 6,100 rows

No SQL GRANT, REVOKE, CREATE ROLE, CREATE USER, password, or database credential statements were found in those data exports.

The realtime/static route-ID mismatch remains a data-model issue, not something to solve by guessing route numbers.

## Secrets

Repository configuration was checked for the expected secret boundary.

The repository contains only placeholders in .env.example:

- DTC_API_KEY=YOUR_PRIVATE_DTC_KEY
- DATABASE_URL=YOUR_NEON_POSTGRES_CONNECTION_STRING

No real values were added to the repository.

## Remaining external verification

The live Neon database could not be directly queried from this session because the available Neon connector runtime requires a project ID that was not available to the tool. Therefore I did not claim a live production-role/privilege audit.

The migration is in the repository and is applied automatically by the backend/importer, but the actual production database should still be checked after deployment for:

- current constraints/indexes
- database role privileges
- SSL enforcement
- connection limits
- Neon security-advisor findings

The current realtime/static route-ID reconciliation also remains unresolved and is deliberately not guessed.

## Legal and privacy controls

- Added an in-app Terms/Privacy consent gate. The current client does not perform age verification; any public age policy and child-specific controls must be finalized before launch.
- Added an in-app legal center linking the Privacy Policy, Terms of Service, Third-Party Notices, and Security Policy.
- Added a pre-permission location disclosure explaining nearby-stop processing and reduced-precision location handling.
- Nearby coordinates are rounded on-device and sent in a POST body rather than query parameters, reducing accidental exposure through URL logs.
- Added explicit third-party notices for Delhi Open Transit Data and OpenStreetMap.
- Added a legal/compliance checklist covering Indian data-protection, contract, consumer, copyright, cybersecurity, and app-store requirements.

## Branch policy

The production branch is `main`. Historical/test branches have been reviewed; branches that are strictly behind `main` or contain obsolete experiments should not be merged into production. Dependency-update branches that upgrade React Native outside Expo SDK 57's supported version should remain unmerged until the corresponding Expo SDK upgrade is performed.
