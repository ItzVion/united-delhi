# UNITED DELHI — MASTER CLAUDE BUILD PROMPT

You are taking over the United Delhi project. Build it end-to-end. Do not stop at a scaffold, mock UI, placeholder map, fake bus data, or partial implementation.

## Mission

United Delhi is a non-commercial Delhi DTC bus-tracking mobile app for Android and iOS.

Build:
- live DTC bus map
- nearby bus stops
- stop search
- route search
- stop details
- route details
- live vehicle information and ETA where the data supports it
- Smart Leave: estimate when the user should leave for a selected stop using location, walking time, route/stop data, live bus observations, and an explicit safety buffer
- freshness/confidence labels so estimates are never presented as guaranteed

## Important existing facts

The repository already contains:
- Expo React Native + TypeScript
- Node/Express backend
- Neon PostgreSQL
- GTFS-Realtime protobuf decoding
- realtime vehicle endpoint
- nearby-stop endpoint
- search endpoint
- GTFS importer
- Render deployment configuration

The realtime OTD integration has already been tested successfully and returned 4,161 live vehicle entities during testing. Keep the real integration.

The user already has private environment values locally for DTC_API_KEY and DATABASE_URL. Never ask the user to paste them into chat. Never commit them.

## Official data

Use Delhi Open Transit Data where permitted:
- Static data: https://otd.delhi.gov.in/data/static/
- Documentation: https://otd.delhi.gov.in/documentation/
- Realtime GTFS-RT endpoint:
  https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=YOUR_PRIVATE_KEY

Never put the private OTD key in the mobile app, GitHub, screenshots, logs, or final ZIP.

OTD static GTFS download currently requires a website form/session. Do not rely on a guessed public ZIP URL. Support importing a user-downloaded ZIP or extracted directory containing files such as stops.txt, routes.txt, trips.txt and stop_times.txt.

## Build rules

1. Build the REAL application, not a demo.
2. No random/fake bus positions.
3. No hard-coded Delhi transit data.
4. Preserve good existing work but freely refactor or replace incomplete code.
5. Do not claim features are complete unless they work.
6. Never bypass provider terms, authentication, identity verification, payment, age requirements, or access controls.
7. Keep secrets in environment variables.
8. Add proper loading, error, empty, offline and stale-data states.
9. Make the UI polished, fast, mobile-first and accessible.
10. Do not add fake statistics, reviews, users or operational claims.

## Backend

Use Node.js + Express or an equally sensible Node architecture.

Implement and verify:
- health endpoint
- status endpoint
- realtime vehicles
- nearby stops
- stop search
- route search
- stop details
- route details
- request validation
- CORS
- strict upstream timeouts
- graceful upstream failure handling
- caching
- stale-data handling
- safe rate limiting
- structured logs without secrets
- graceful shutdown

Realtime behavior:
- do not let mobile users individually hammer OTD
- cache/refetch efficiently
- if OTD is unavailable, serve recent cached data when safe
- expose freshness timestamps
- never invent positions
- never leave requests hanging

## Database

Use Neon PostgreSQL.

Properly support:
- stops
- routes
- trips/service metadata where useful
- route-stop relationships
- live vehicle positions
- timestamps/freshness

Use indexes and efficient geographic querying. Avoid unnecessary full-table scans.

GTFS importer requirements:
- validation
- progress logging
- transaction safety
- efficient batch inserts
- duplicate handling
- repeatable imports
- useful errors
- tiny test fixtures

## Mobile app

Use Expo React Native + TypeScript.

### Home
- interactive map
- live vehicle markers
- current location
- nearby stops
- search
- freshness/status indicator

### Search
Search stops and routes with useful matching.

### Stop details
Show:
- stop name
- location
- routes serving it
- nearby/live buses when available
- ETA where legitimately computable
- data freshness
- Smart Leave action

### Route details
Show:
- route number/name
- ordered stops
- direction/variant where available
- live vehicles on route
- map representation where practical

### Smart Leave
Use:
- current location
- walking estimate
- selected stop
- route/stop relationships
- actual live vehicle positions when available
- recent observations
- defensible ETA logic
- explicit safety buffer

Do NOT use a blind fixed delay such as "bus takes 10 minutes".

Every estimate must explain its source, such as live-data estimate or schedule-based estimate. If reliable data is insufficient, say so.

## Maps

Choose a map implementation compatible with Expo/React Native and the project's budget/licensing constraints. Do not introduce a provider that requires paid billing just to test the project. Document any required map keys.

## Design

Make it feel like a real transit product, not an AI-generated template:
- excellent hierarchy
- clean navigation
- readable typography
- useful map interactions
- polished cards
- fast search
- good animations
- responsive layouts
- accessible touch targets
- strong loading/error/empty states
- no unnecessary clutter

## Testing

Actually run tests. At minimum:
- TypeScript/type checking
- backend syntax checks
- unit tests for GTFS and realtime transformation
- GTFS importer fixture
- API tests
- realtime protobuf decoding fixture
- timeout/error tests
- mobile build validation

Do not claim real OTD static data was imported unless it actually was.
Do not claim deployment succeeded unless it actually did.

## Deployment

Target:
- Mobile: Expo React Native + EAS
- Backend: Render Web Service
- Database: Neon PostgreSQL
- Source: GitHub

Create/update:
- render.yaml
- production environment configuration
- safe environment variable documentation
- health checks
- deployment instructions
- update/rollback instructions

Production mobile builds must call the deployed backend URL, never localhost.

## Google Play

Do not falsely promise free public Google Play publishing.

As of September 2026, Google's full-distribution Android Developer Console account requires a one-time 25 USD registration fee. Limited distribution is free but limited to 20 devices, so it is not suitable for a public Delhi transit app.

Expo EAS has a free plan with limited monthly builds and supports store submission.

Create a complete Android release guide covering:
- package/application ID
- signing
- icon
- splash screen
- screenshots
- store listing
- privacy policy
- location permission wording
- Data safety
- content rating
- AAB build
- testing tracks
- Play Console setup
- production release
- future updates
- exact commands

Do not bypass Google verification, testing or payment requirements.

## iOS

Document the real requirements. Apple Developer Program membership is currently 99 USD/year unless an applicable fee waiver exists. Include the EAS/App Store Connect workflow without claiming it is free.

## Privacy/security

Because location is used:
- request it only when needed
- explain why
- do not store precise user location unless necessary
- do not log precise user locations
- minimize personal data
- document data flows
- use HTTPS in production
- validate inputs
- protect backend endpoints
- never expose secrets

## Required final documentation

Create BUILD_PLAN.md containing:
- architecture
- file structure
- database schema
- API endpoints
- environment variables
- local setup
- GTFS import
- Render deployment
- Neon setup
- Expo/EAS setup
- Android release
- Google Play release
- iOS release
- privacy/security
- testing
- troubleshooting
- future roadmap
- known limitations
- exact commands
- exact locations for secrets/configuration

Create CLAUDE_HANDOFF.md containing:
- what was built
- what was tested
- test results
- what could not be tested
- remaining manual steps
- known limitations
- deployment status
- important warnings

Create ZIP_CONTENTS.txt.

## Final ZIP

Create a clean final ZIP named united-delhi-final.zip.

Include:
- complete source
- documentation
- BUILD_PLAN.md
- CLAUDE_HANDOFF.md
- ZIP_CONTENTS.txt
- safe .env.example files

Exclude:
- node_modules
- build caches
- .expo
- real API keys
- DATABASE_URL
- private credentials
- generated junk

## GitHub handoff

If GitHub access is available:
- commit all source/documentation changes
- verify the repository is internally consistent
- verify scripts
- verify README
- verify gitignore
- verify deployment config
- verify no secrets are committed

## Do not stop early

Work in this order:
1. inspect repository
2. fix/rebuild architecture
3. implement backend
4. implement database
5. implement realtime
6. implement GTFS import
7. implement complete mobile UI
8. implement search
9. implement stop/route details
10. implement Smart Leave
11. test
12. add deployment
13. add release configuration
14. write BUILD_PLAN
15. write CLAUDE_HANDOFF
16. create clean ZIP
17. report exact remaining manual actions

If something requires a human website form, payment, identity verification, account approval or manual download, document it and continue everything else.

## Final response

Report only what was actually built and tested. Give the final ZIP path, BUILD_PLAN path, CLAUDE_HANDOFF path, deployment status and exact remaining manual actions. Never claim everything is complete if something remains.
