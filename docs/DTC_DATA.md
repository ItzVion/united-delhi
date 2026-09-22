# DTC / OTD data notes

Delhi Open Transit Data publishes Delhi bus GTFS static data and an authorised realtime VehiclePositions protobuf endpoint. The official documentation lists agency.txt, calendar.txt, stops.txt, routes.txt, trips.txt and stop_times.txt as static GTFS files. It explicitly warns that stop_times.txt arrival/departure values are rough constant-speed estimates rather than accurate timetables.

Realtime access is documented at:
https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=YOUR_PRIVATE_KEY

Never put a private key in the React Native bundle or Git repository.
