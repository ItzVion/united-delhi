# United Delhi GTFS source

United Delhi now uses the official Delhi Open Transit Data (OTD) static bus GTFS ZIP:

https://otd.delhi.gov.in/data/static/GTFS.zip

The OTD site currently lists the bus static dataset as 3464 stops, 543 routes, 16562 trips and 378324 stop-time records, last updated June 20, 2024. The realtime VehiclePositions feed is a separate live source.

Route labels are never inferred from GPS coordinates, vehicle IDs, or route-number patterns. A realtime vehicle carries OTD's internal `trip.routeId`; United Delhi only attaches a public route label when that exact route ID exists in the official OTD static `routes.txt`. When there is no exact static match, the UI displays the internal ID (for example `ID 1547`) rather than inventing a public route number.

The server stores the static feed identity in `static_feed_meta` and automatically refreshes the database when the configured GTFS source changes or the static data is incomplete.

The official OTD documentation notes that static `stop_times.txt` times are approximate, so journey-planning durations are not treated as live schedule guarantees.
