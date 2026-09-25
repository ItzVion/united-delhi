# United Delhi — Database audit (Neon export, 25 Sep 2026)

This report is based on the four exported SQL tables supplied for this audit. It is a data-quality report, not a claim that every record is currently active in DTC operations.

## Counts
- `routes`: **2,403** rows
- `stops`: **10,558** rows
- `route_stops`: **98,656** rows
- `vehicle_positions`: **6,100** rows

## Important findings
- The exported `routes` table contains **2,403** route rows, while the official OTD static page currently advertises **543** routes and a last-updated date of **June 20, 2024**. The Neon dataset is therefore not identical to the current official OTD static snapshot.
- The exported `stops` table contains **10,558** rows, while official OTD currently advertises **3,464** active stops. This strongly suggests the Neon data includes a larger/newer/merged stop set.
- `vehicle_positions` contains **6,100** rows. **4,823** vehicles reference route IDs that do not exist in the exported `routes` table. This is the biggest live-data mapping defect found.
- Route names use direction suffixes such as `UP`, `DOWN`, and `DWN`. The UI should normalize these for passengers while retaining the underlying route ID internally.
- `route_long_name` is frequently identical to `route_short_name`, so it should not be presented as a human-readable origin/destination description unless endpoints are derived from `route_stops`.

## 801 family — exact exported route variants
- `1310` `801STLUP`: **Uttam Nagar → Kapashera Border** (50 stops)
- `133` `801DOWN`: **IGI Airport Terminal 2 (Air India Office) → Inderlok Metro Station** (67 stops)
- `262` `801STLDOWN`: **Kapashera Border → Uttam Nagar Terminal** (49 stops)
- `5304` `801UP`: **Inderlok Metro Station → Kapashera Border** (61 stops)
- `5771` `801DOWN`: **Kapashera Border → Inderlok Metro Station** (60 stops)
- `696` `801UP`: **Inderlok Metro Station → IGI Airport Terminal 2 (Air India Office)** (63 stops)

## 772
- `10337` `772UP`: Uttam Nagar Terminal → IGI Airport Terminal 2 (Air India Office) (46 stops)
- `10347` `772DOWN`: IGI Airport Terminal 2 (Air India Office) → Uttam Nagar Terminal (48 stops)
- `41` `772UP`: Uttam Nagar → IGI Airport Terminal 2 (Air India Office) (44 stops)
- `503` `772DOWN`: IGI Airport Terminal 2 (Air India Office) → Uttam Nagar Terminal (49 stops)

## 741
- `10654` `741DWN`: Jonti Village → Mangla Puri Terminal (66 stops)
- `2074` `741UP`: Mangla Puri Terminal → Jonti Village (66 stops)
- `5287` `741UP`: Mangla Puri Terminal → Jonti Village (60 stops)
- `5754` `741DOWN`: Jonti Village → Mangla Puri Terminal (59 stops)

## Implementation consequence
- Search must not choose a route merely because its internal ID sorts first. It now prefers the public variant with the largest known stop sequence when collapsing direction/variant records.
- Live vehicles whose `route_id` is absent from static routes must not be assigned a guessed passenger-facing route name. They can remain visible as live vehicles, but route-specific labels/arrivals require a verified mapping.
- OTD `stop_times.txt` values remain approximate rather than live ETA data.
