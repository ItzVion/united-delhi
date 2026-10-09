# United Delhi

Delhi DTC bus tracking app built with Expo React Native.

## Current state

The repository is intentionally kept free of private credentials. The mobile app can request location permission, while the DTC API integration belongs in the backend.

Live bus positions are retrieved server-side from the approved Delhi Transport Stack GTFS-Realtime feed:
https://dts-backend.transportstack.in/api/dataset/otd/get-file?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb

The API key is sent in the `x-api-key` request header and must be configured only as `TRANSPORT_STACK_API_KEY` on the backend. The website and mobile app never receive this secret. Static route/stop metadata remains in Neon and is managed independently from the live positions feed. Scheduled arrival estimates should be labelled as estimates.

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

The browser client uses the same Render-hosted backend as the mobile app and does not contain private DTC or Neon credentials. Vercel serves this repository from the project root and builds the browser client into `web/dist`. It can be hosted as a static website; see `web/README.md`.

Expo SDK 57 supports Android, iOS and web targets, while the dedicated `web/` client is used here so desktop browsers do not depend on native-only WebView components.
