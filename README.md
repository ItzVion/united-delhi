# United Delhi

Delhi DTC bus tracking app built with Expo React Native.

## Current state

The repository is intentionally kept free of private credentials. The mobile app can request location permission, while the DTC API integration belongs in the backend.

Official Delhi Open Transit Data documentation:
https://otd.delhi.gov.in/documentation/

The official realtime endpoint is documented as:
https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=YOUR_PRIVATE_KEY

Static GTFS data and realtime access require the relevant OTD access steps. The official documentation warns that stop_times.txt is only a rough constant-speed estimate, so the app must label scheduled ETAs as estimates.

## Legal

- Privacy Policy: `PRIVACY_POLICY.md`
- Terms of Service: `TERMS_OF_SERVICE.md`
- Third-Party Notices: `THIRD_PARTY_NOTICES.md`
- Security Policy: `SECURITY.md`
- Legal & Compliance Checklist: `LEGAL_COMPLIANCE.md`

The app uses a Terms of Service and Privacy Policy acknowledgement screen before entering the main experience; age-specific requirements should be reviewed before any public or commercial launch.


## Platforms

United Delhi keeps the Android and iOS Expo app in the repository root and includes a responsive browser/desktop web client in `web/`.

Run the browser client locally:

```bash
npm run web
```

Then open `http://localhost:8080`.

The browser client uses the same Render-hosted backend as the mobile app and does not contain private DTC or Neon credentials. It can be hosted as a static website; see `web/README.md`.

Expo SDK 57 supports Android, iOS and web targets, while the dedicated `web/` client is used here so desktop browsers do not depend on native-only WebView components.
