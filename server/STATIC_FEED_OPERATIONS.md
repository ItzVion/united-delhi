# Static GTFS feed operations

## One-time import
Open https://united-delhi.vercel.app/static-import.html, enter the temporary backend token, and upload the bus and Metro ZIPs. The page sends the exact archives to Render over HTTPS and polls each import job.

## Safety
- One import runs at a time.
- Only ZIP uploads are accepted.
- Importer checks GTFS files, row counts, references and service calendar.
- Each importer creates hash-named backup tables before replacing current static tables.
- All replacements are transaction-scoped. On validation or SQL failure, PostgreSQL rolls back and existing data remains available.
- The token is compared in constant time, sent in a header, never logged, and removed from child-process environments.
- Clear STATIC_IMPORT_TOKEN in Render after the two successful imports.

## Uploaded Metro archive caveat
The supplied Metro ZIP contains 36 directional GTFS routes and 262 stations. Its calendar ended on 31 December 2025. Import it for route topology and station ordering only; journey times remain estimates.

## After upload
Verify static_feed_meta and metro_feed_meta source keys and counts, plus /api/search, /api/metro, /api/routes/:id, /api/metro/routes/:id and /api/plan/multimodal. Keep DTC_STATIC_AUTO_IMPORT=false and METRO_AUTO_SYNC=false so an external archive cannot overwrite this snapshot.
