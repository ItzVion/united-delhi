# United Delhi

Delhi DTC bus tracking app built with Expo React Native.

## Current state

The repository is intentionally kept free of private credentials. The mobile app can request location permission, while the DTC API integration belongs in the backend.

Official Delhi Open Transit Data documentation:
https://otd.delhi.gov.in/documentation/

The official realtime endpoint is documented as:
https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=YOUR_PRIVATE_KEY

Static GTFS data and realtime access require the relevant OTD access steps. The official documentation warns that stop_times.txt is only a rough constant-speed estimate, so the app must label scheduled ETAs as estimates.