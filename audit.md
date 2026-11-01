# United Delhi repository audit

- **Audit date:** 16 October 2026
- **Repository:** `ItzVion/united-delhi`
- **Scope:** `app/`, `web/`, `server/`, privacy/legal copy, dependency locks, setup/deployment documentation, and Git delivery.

This is a record of the work performed in the Codex audit pass and its validation. It records what changed, what was actually run, and what remains unverified.

## Starting state and delivery

- Started in the existing clone on branch `main` at `075ed9441a8f7df3dbf4053be14a0a6ff4415573`.
- The working tree was clean at the start; there were no pre-existing user edits to preserve.
- Verified `origin` pointed to the intended `ItzVion/united-delhi` repository. The configured mixed-case URL redirected to GitHub's lowercase canonical URL on push.
- Inspected issue #29 and draft PR #30. The web lockfile was already present on `main`; PR #30's escape test was reviewed and its behavior check was implemented on `main` instead of blindly cherry-picking.
- Repository review covered package scripts and all three lockfiles, app/web API and deployment settings, Vercel/CSP and API CORS configuration, backend startup, relevant database/import/sync code, existing tests, and transit-colour source handling.
- Completed the code changes in commit `cdd2f946bce730abeeef2c6566aab0a9e445c55e` (`fix: harden transit app privacy and runtime paths`) and pushed it to `origin/main`.
- Verified after the push that remote `main` pointed to that commit and the working tree was clean.
- This report was requested and added as a follow-up after that code commit.

The first sandboxed app registry access and the first sandboxed push were blocked by network restrictions. The app install/audit and the push were retried with network access; the install and push then completed successfully. The push response confirmed GitHub's canonical lowercase repository URL.

## Changes made

### Android / React Native

- Reworked `app/src/lib/__tests__/escapeHtml.test.ts` to extract `escapeHtml` from the embedded map script, syntax-check it, execute it, and assert the exact output for `&`, `<`, `>`, `"`, and `'`. The old check only ran `node --check` and did not prove escaping behavior.
- Updated `app/scripts/build-local-v1.ps1` to use the current API origin, `https://ud-api.mangotyping.fun`, so a local release build does not bake in the stale Render hostname.
- Updated the app consent/legal text and `legal/PRIVACY_POLICY.txt` to describe current providers, the 16 October 2026 effective date, and location handling accurately. Mobile nearby-stop requests already round coordinates to four decimal places; the policy now says so.
- Reviewed the embedded `HomeScreen.tsx` map code and current bus-colour provenance. The suspected `escapeHtml`/`legendRows` issues were already fixed in the current source, so no duplicate production fix or colour behavior change was made.
- Did not build an APK, use an emulator/device, EAS, or a paid build service.

### Web

- Updated `web/src/api.ts` so nearby-stop requests send latitude/longitude rounded to four decimal places.
- Updated `web/src/App.tsx` to stop writing exact device coordinates to `ud-last-location` and remove any value left by an older version on startup.
- Updated `web/src/components/MapView.tsx` to save map viewport coordinates rounded to three decimal places. On restore, it normalizes an older, more precise stored viewport before saving it again.
- Added `web/test/location-precision.test.mjs` for the four-decimal request helper and three-decimal saved viewport helper; added the web test script to `web/package.json`.
- Updated `web/vite.config.ts` to proxy local `/api` calls to the current VPS API. The development proxy removes the browser `Origin` header on its server-to-server request so the API's restricted CORS handling can accept local proxied calls; production CORS/CSP settings were not broadened.
- Updated web privacy copy to explain the rounded request coordinates and rounded viewport storage. Updated the privacy and terms effective dates and current provider descriptions.

### Backend and transit data paths

- Added `server/src/runtime-paths.js` to resolve paths from the server package location rather than the process's current working directory.
- Updated `server/src/index.js` to start the DTC static importer using its absolute script path and stable server-root working directory; relative `DTC_STATIC_FILE` paths now resolve from the server root while absolute paths remain absolute.
- Updated `server/scripts/import-dtc-static.mjs` to use the stable resolved archive path.
- Added `server/test/runtime-paths.test.js` for relative and absolute path behavior.
- Reviewed startup, request handling, CORS, rate limits, SQL parameterization, polling overlap controls, importer/sync behavior, and reset SQL. No production database was connected to or modified. No import/sync was run against a populated database; the new tests cover path resolution, not end-to-end database replacement behavior.

### Dependency/security and documentation

- Ran a non-forced `npm audit fix` in `app/`. It updated the app lockfile using compatible changes (14 packages added, 9 removed, 33 changed); the command exited nonzero because 15 high findings remained. No package manifest version was manually edited and `--force` was not used.
- Updated `app/SETUP.txt`, `server/deploy/SETUP.txt`, `server/deploy/VPS-AUDIT.md`, and `server/deploy/VPS-REBUILD.md` to align setup notes, lockfile status, API target, and deployment descriptions with the repository's current configuration.
- Preserved Vercel's existing native Git deployment configuration. Did not enable the VPS auto-deploy timer or alter deployment workflows.
- Ran `git diff --check` before delivery; it passed.
- Scanned changed files and reachable Git history for common credential/key patterns without printing matched values. No literal secrets were found. One historical URL pattern in `server/deploy/bootstrap-vps.sh` was inspected: it interpolates shell variables for a loopback database URL and does not contain a committed literal credential.

## Installs, checks, tests, and audits

All commands below were run in the named package directory. The successful final installs/checks used Node `v24.19.0` and npm `11.17.0`.

| Package | Command | Result |
|---|---|---|
| `app/` | `npm ci` | Passed after the app lockfile update. npm emitted `EBADENGINE`: this repository specifies Node 22, while the available runtime was Node 24.19. |
| `app/` | `npm run typecheck` | Passed. |
| `app/` | `npm test` | Passed: 20 tests, 20 passed, 0 failed. Includes the executed `escapeHtml` behavior regression test. |
| `app/` | `npm audit` | Completed with 15 high, 0 critical vulnerabilities; npm exits nonzero when findings remain. |
| `app/` | `npm audit --omit=dev` | Completed with the same 15 high, 0 critical findings. |
| `web/` | `npm ci` | Passed; audit reported 0 vulnerabilities. |
| `web/` | `npm audit` and `npm audit --omit=dev` | Both reported 0 vulnerabilities. |
| `web/` | `npm run typecheck` | Passed. |
| `web/` | `npm test` | Passed: 2 tests, 2 passed, 0 failed. |
| `web/` | `npm run build` | Passed. Existing Vite warning remains: the minified JavaScript chunk is 570.22 kB, above the 500 kB warning threshold. |
| `server/` | `npm ci` | Passed; audit reported 0 vulnerabilities. |
| `server/` | `npm audit` and `npm audit --omit=dev` | Both reported 0 vulnerabilities. |
| `server/` | `npm run check` | Passed. |
| `server/` | `npm test` | Passed: 19 tests, 19 passed, 0 failed. |

No separate lint command is configured in these package scripts. The app's initial audit had 18 findings (17 high and 1 critical). The compatible `npm audit fix` removed the critical finding; the final app audits still show 15 high findings. The remaining advisory chain includes `braces` and `node-forge` under the Expo/Metro/React Native dependency tree ([braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)). npm's suggested aggregate remediation would downgrade Expo to 44.0.6 and React Native to 0.72.17, so that breaking downgrade was not applied.

## Actions deliberately not taken

- No GitHub Actions workflow was run or added; no EAS, cloud APK, paid build, or local APK build was run.
- No SQL reset, drop, truncate, wipe, migration, database restore, or production database query was run. In particular, `server/sql/001_reset_and_schema.sql` was not executed.
- No VPS deploy/restart, Vercel configuration change, DNS/firewall/Cloudflare Tunnel/systemd change, or VPS auto-deploy enablement was performed.
- No PR was created, merged, or cherry-picked. No branch/worktree was created.
- Vercel deployment status, live API health, emulator/device behavior, and an end-to-end import against a non-empty database were not verified. A push may trigger the existing Vercel native Git deployment, but its result was not checked.

## Remaining caveats

1. The app still has 15 high npm audit findings. The proposed broad npm remediation is a breaking Expo/React Native downgrade, which was intentionally not taken.
2. Checks ran under Node 24.19 despite the repository's Node 22 requirement. Repeat installs and checks under Node 22 before relying on a local Android release build.
3. The web production build still emits a 570.22 kB chunk-size warning.
4. The backend path fix has unit coverage, but static import/sync behavior against a populated database was not integration-tested to avoid touching live or unisolated data.
5. Native UI flows were source-reviewed and typechecked/tested, but not exercised on a device or emulator.



## Production platform and repository review — 2 November 2026

- Reviewed the current `main` tree, recent commit history, the open GitHub issue and all currently open Dependabot PR patches; no new GitHub Actions jobs were run and no additional branch was created.
- **Render:** `united-delhi-api` is configured for automatic deployment from `main`, rooted at `server/`, and its current deployment on commit `b0b9608` is live. Recent runtime logs showed the Delhi OTD poll decoding approximately 60–66 vehicles, with no warnings or errors in the sampled 4-hour window.
- **Neon:** the `united-delhi-api` project’s single default `main` branch is ready. The stored static network currently contains 2,403 DTC routes, 10,559 DTC stops and 99,286 route-stop links; Metro contains 18 grouped lines, 262 stations and 830 route-stop links. The Metro import metadata uses `route_count`, `stop_count`, and `route_stop_count`; these match the runtime sync implementation. Earlier zero values were from querying the unrelated `imported_*` columns, not a data inconsistency. Read-only health checks found no locks or vacuum issue.
- **Vercel:** the project remains linked to this repository and the verified production domain `united-delhi.vercel.app` is attached to the last successful `main` web deployment. The newest preview deployment is a Dependabot branch and is not the production domain. The latest `main` commit `b0b9608` only changed backend files, so Vercel's unchanged frontend deployment is expected; the existing production web version remains on the last frontend-changing commit. No Vercel settings or environment variables were changed. No runtime error clusters were reported for the last seven days.
- Closed GitHub issue #29 as completed: `web/package-lock.json` is present on `main`, and this audit's recorded web verification includes reproducible install, clean npm audit, typecheck, tests and build.
- The production app still has **15 high npm audit advisories** in the Expo/Metro/React Native dependency tree per the prior package audit. The broad npm auto-remediation is a breaking downgrade to older Expo/React Native releases; it was not applied. Open Dependabot PRs were reviewed but not merged without package-specific test execution.
- The mobile first-launch privacy copy contained stale provider names (VPS/Transport Stack). Updated it to match the current Render/Neon/OTD/Vercel architecture. Corrected the privacy-request email's accidental four-asterisk Markdown formatting.
- The internal compliance checklist now points to the actual `.txt` legal/security document names and has a current review date. This remains an engineering checklist, not legal advice.
- **Data work intentionally blocked:** the more recent supplied DTC archive (2,554 routes/6,812 stops) has not been imported into production; the currently deployed database still contains the older counts. The archive is not attached to this task and the one-time import credential is not available here. No production data replacement, truncation, migration, or backup manipulation was performed. Metro service dates expired on 31 December 2025, so existing Metro information remains topology-only; don't present it as current schedule data.
- **Live tracking dependency:** Render logs show OTD polling works in the sampled window. The actual OTD private key is required and remains a server-side secret; this review did not read or expose it.
- **Validation limits:** no Node 22 local install/test execution was available through the connected repository tools, no Android APK/device test was run, no end-to-end static-feed upload was performed, and no live external API/browser smoke test was available. Do not infer those checks passed from a successful past build or from the platform deployment state.


## Provider and journey-planner architecture — 30 October 2026

- Removed the external realtime relay and external journey-planner dependency; transit planning now runs entirely against the network stored in Neon.
- Live bus positions now use Delhi OTD's authorised GTFS-Realtime VehiclePositions endpoint. The server reads the private key from `OTD_API_KEY` and passes it in OTD's documented `key` query parameter; the key is never sent to the clients or written to logs.
- Trip planning is calculated by United Delhi's own backend using the transit network stored in Neon. Bus suggestions use `/api/search`; Metro suggestions use `/api/metro`; route results use `/api/plan/multimodal`.
- Added OTD request-builder tests for the correct endpoint, query authentication, missing-key fail-closed behavior and query encoding.
- Live tracking remains unavailable until an authorised OTD private key is entered in Render as `OTD_API_KEY`. No substitute or fabricated key is configured.
- GitHub Actions remains manual-only; no branches were created. Render and Vercel continue to deploy from `main`.
- Metro timetable data remains topology-only because its imported static calendar is expired. All computed travel times are estimates.


## Supplied GTFS network refresh — 30 October 2026

- Inspected the uploaded bus and Metro ZIP archives, including table schemas, row counts and all route/trip/stop references.
- The supplied bus ZIP contains 2,554 routes and 6,812 stops with complete route/trip/stop references. The existing database held an older 2,403-route/10,559-stop snapshot.
- The supplied Metro ZIP contains 36 directional route records and 262 stations. Its calendar ended 31 December 2025, so it is suitable for topology only and not a current timetable.
- Added a password-protected one-time ZIP import page, transaction-based backend job runner, hash-named Neon snapshots and status polling for long imports.
- Production static network replacement is complete only after the two uploads have been run and the resulting Neon metadata/counts are verified.
