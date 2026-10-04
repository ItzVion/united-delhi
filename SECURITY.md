# Security Policy

## Reporting a vulnerability

Please do not publish credentials, API keys, database URLs, or a working exploit in a public issue.

For a suspected security vulnerability in United Delhi, use a private GitHub security report if the repository enables GitHub Security Advisories. Otherwise, contact the repository owner privately through GitHub.

## Secrets

The following values must remain server-side and must never be committed:

- `DTC_API_KEY`
- `DATABASE_URL`

The mobile app and website receive only the public API base URL. There is no realtime relay secret in the current architecture.

## Scope

Security-sensitive changes should be tested with:

- frontend typecheck and tests
- backend syntax checks
- dependency audit
- database migration checks
- Android build validation where native configuration changes are involved
