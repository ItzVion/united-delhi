# Static GTFS Refresh Safety

## Startup policy

The API may initialize bus or metro static tables automatically only when the corresponding static network is empty. When transit tables already contain data, automatic refresh is a no-op unless the configured archive has a matching SHA-256 fingerprint in the saved metadata and the recorded counts match the database. A missing fingerprint is intentionally treated as unverified, not as permission to replace data.

The importer records the archive fingerprint in the existing metadata `source_url` field as `#sha256=<hex>`; this avoids an implicit schema migration. Calendar checks use the Asia/Kolkata service date and inspect both `calendar.txt` and `calendar_dates.txt`. An advertised `feed_info.txt` date is not proof that a timetable is current.

## Explicit DTC replacement

Only run this after reviewing the source archive, verifying a current backup, and deciding to replace the current bus route/stop tables:

```bash
cd /opt/united-delhi/repo/server
DTC_STATIC_ALLOW_REPLACEMENT=true node scripts/import-dtc-static.mjs
```

If the feed calendar has expired, the import refuses by default. `DTC_ALLOW_EXPIRED_CALENDAR=true` is a separate override for an intentionally approved topology-only use; it must not be used to imply current timetable accuracy.

## Explicit Metro replacement

The scheduled API sync does not replace populated metro tables automatically. After source and backup review, the manual path is:

```bash
cd /opt/united-delhi/repo/server
METRO_STATIC_ALLOW_REPLACEMENT=true npm run sync:metro
```

An expired metro calendar is refused by default. `METRO_ALLOW_EXPIRED_CALENDAR=true` separately allows a reviewed topology-only import, not a claim that current train schedules are represented. Keep these override variables absent/false in service startup environments.

## Vehicle colours

GTFS-Realtime has no standard physical-paint colour field, and unknown protobuf extension fields are not trusted as paint evidence. The API accepts a colour only from a confirmed provider-specific extension explicitly configured using `TRANSPORT_STACK_COLOR_FIELD`, or from a reviewed vehicle-specific livery record. Do not set an extension field number just because its values resemble hex colours.

Until an authoritative field or reviewed livery evidence exists, grey (`#64748B)) and an “unknown physical colour” label are correct. Route line colours and fleet-type classifications remain separate from physical bus paint.
