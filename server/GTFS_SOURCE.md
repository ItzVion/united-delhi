# United Delhi GTFS source

United Delhi uses one pinned OTD-derived GTFS snapshot for **operational route-ID mapping and bus stop/route topology**:

https://github.com/Anusharana510/CommuteLive/tree/8d573d0c67cb8269b0fa16019d192a0e49172d4f/data/otd_gtfs

Pinned commit: `8d573d0c67cb8269b0fa16019d192a0e49172d4f`

Files bundled under `server/data/otd_gtfs/`:
- routes.txt
- trips.txt
- stops.txt
- stop_times.txt
- agency.txt
- calendar.txt

The snapshot contains 2,403 route records, 10,559 stops and 99,286 stop-time records. It is OTD-derived and is pinned so a changing upstream source cannot silently change the realtime route-ID mapping.

Realtime route identity is handled separately:
1. OTD VehiclePositions provides the live `trip.routeId` and `trip.tripId`.
2. United Delhi performs an exact lookup against the pinned OTD-derived operational routes/trips.
3. Only the matching `route_short_name` is shown as the public route label.
4. A missing match is shown as `LIVE`, never as `ID 684`, `684STL`, or another guessed public number.
5. If the realtime route ID and trip-to-route mapping conflict, no public route label is attached.

The pinned GTFS `route_color` field is intentionally **not used as a bus-livery colour**. The source generator synthesised those colours from route IDs, so keeping them would make the app display invented colours.

The server also classifies live vehicles for map colouring:
- `electric`: light blue for the verified Delhi electric-bus registration series `DL51EV` / `DL51GD`
- `dtc`: green when the operational route is marked `DTC`
- `cluster`: orange when the operational route is marked `DIMTS`
- `unknown`: neutral gray

These are service/category colours, not claims that every physical bus has exactly that paint scheme. The OTD realtime protobuf does not expose a verified per-vehicle livery-colour field.

The database keeps the pinned operational dataset because the realtime route IDs are operational/internal IDs and do not equal the public route numbers. Do not replace the 2,403-route operational dataset with the separate 543-route public static listing without also redesigning the realtime route-ID mapping.
