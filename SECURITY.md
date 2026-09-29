# Security Policy

## Reporting a vulnerability

Please do not publish credentials, API keys, database URLs, or a working exploit in a public issue.

For a suspected security vulnerability in United Delhi, use a private GitHub security report if the repository enables GitHub Security Advisories. Otherwise, contact the repository owner privately through GitHub.

## Secrets

The following values must remain server-side and must never be committed:

- `DTC_API_KEY`
- `DATABASE_URL` (fallback database connection string)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` (Wasmer managed PostgreSQL)
- `DTC_REALTIME_RELAY_SECRET`

The mobile app only receives the public API base URL.

## Scope

Security-sensitive changes should be tested with:

- frontend typecheck and tests
- backend syntax checks
- dependency audit
- database migration checks
- Android build validation where native configuration changes are involved
