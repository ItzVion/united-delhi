# United Delhi GTFS source

United Delhi currently uses a pinned OTD-derived GTFS snapshot from CommuteLive commit
8d573d0c67cb8269b0fa16019d192a0e49172d4f.

The snapshot contains 2,403 route records, 10,559 stops and 99,286 stop-time
records. It was chosen because its route IDs partially match the Delhi OTD realtime
feed better than the alternatives previously tested.

Important limitation: this is a pinned snapshot, not a guarantee that every current
OTD realtime route ID exists in the static dataset. When a realtime route ID has a
matching routes.route_id, United Delhi displays routes.short_name as the public
route label. When no static match exists, the backend can only safely expose the
internal realtime route ID; it must not invent or hard-code a public route number.

The official OTD site currently publishes a separate static bus dataset and a
real-time VehiclePositions feed. The static site has historically been gated or
unreliable during development, so the project keeps this reproducible pinned source
until a compatible current static feed is verified.

The importer downloads:
- routes.txt
- stops.txt
- trips.txt
- stop_times.txt

The source is pinned so an upstream change cannot silently change route IDs.
