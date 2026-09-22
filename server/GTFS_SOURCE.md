# United Delhi GTFS source

United Delhi uses the pinned OTD-derived GTFS snapshot from CommuteLive commit
8d573d0c67cb8269b0fa16019d192a0e49172d4f.

This snapshot contains 2,403 route records, 10,559 stops and 99,286 stop-time
records and matches the route IDs used by the current Delhi OTD realtime feed.

The importer downloads the four required files automatically:
- routes.txt
- stops.txt
- trips.txt
- stop_times.txt

The source is pinned so a future upstream change cannot silently change route IDs.
