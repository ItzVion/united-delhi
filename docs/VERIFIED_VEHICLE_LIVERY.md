# Verified physical bus livery registry

This registry deliberately separates a bus's **physical exterior livery** from route colours and map marker colours.

## Runtime API

- `GET /api/vehicle-colors` — lists only records marked `verified` and containing evidence.
- `GET /api/vehicle-colors/:id` — looks up a verified record by normalized vehicle ID or registration.
- A missing record returns `404` with `status: "UNKNOWN"`; clients must not guess a colour.

The backend creates `vehicle_livery_verifications` during its normal runtime schema setup. It is intentionally not seeded with guessed bus colours. The table stores identity, hex/name, evidence URL, source label, review status and verification timestamp. Only rows with `status='verified'` and a non-null `verified_at` affect live vehicle colours.

## Verification rules

1. Evidence must identify the individual bus (stable feed ID or legible registration), not merely a route or model.
2. Prefer a dated photo showing the bus exterior and identifiable vehicle; official vehicle-specific fleet records are stronger.
3. Record a public evidence URL and a human-readable source label. Don't copy images without permission.
4. Use `pending` while reviewing and `verified` only after checking the evidence. A conflicting or outdated record should be rejected/re-reviewed.
5. API-supplied `serviceColor` remains unchanged and takes precedence. The verified registry is a fallback when the realtime feed has no valid explicit colour.
6. Do not infer physical livery from GTFS `route_color`, registration prefixes, operator type, or route number.

## Current coverage

The registry starts empty by design. This is an honest evidence-backed foundation, **not** a claim that any buses have already been verified. The public GTFS-Realtime vehicle descriptor does not define a physical-livery field, so full coverage requires vehicle-specific official records or individually verified evidence.
