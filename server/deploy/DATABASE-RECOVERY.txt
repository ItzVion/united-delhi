# United Delhi database backup and recovery

## Critical safety rules

- Never run `server/sql/001_reset_and_schema.sql`. It is a disabled legacy reset file and deliberately raises an exception.
- Never delete the PostgreSQL data directory, run `DROP DATABASE`, or reset the schema to troubleshoot the API.
- Never commit database dumps, credentials, `.env` files, API keys, or private deploy keys to GitHub.
- Keep at least one verified SQL backup outside the VPS (for example, encrypted local storage) and retain Neon until the VPS cutover is fully verified.
- A database backup is only useful if its size and restoreability have been checked. Prefer a test restore into a separate database before replacing any live data.

## What GitHub contains

GitHub is the source of truth for backend application code, deployment scripts, runtime schema changes, tests, and recovery instructions. It must not contain the production database dump or secrets. PostgreSQL data is operational state, not source code.

## Before a change

Run on the VPS as root, using a protected directory:

```bash
install -d -m 0700 /root/united-delhi-backups
umask 077
pg_dump --format=custom --no-owner --no-acl --dbname='postgresql://united_delhi_app@127.0.0.1:5432/united_delhi' --file="/root/united-delhi-backups/united-delhi-$(date +%Y%m%d-%H%M%S).dump"
```

The command intentionally does not embed a password. Use a protected `PGPASSFILE` or a local interactive prompt as appropriate; do not put a real password in shell history. Confirm the dump is non-empty and inspect it with `pg_restore --list <dump-file>`. Copy a backup off the VPS securely before major changes.

## Restore principles

1. Stop the API service before restoring so it cannot write during recovery.
2. Identify and verify the intended dump and target database. Do not overwrite the only live database.
3. Prefer restoring into a newly created, separate recovery database first, then verify table counts and app queries.
4. Only perform a production replacement after a fresh verified backup, a reviewed command, and explicit operator confirmation.
5. Restart the API and verify both `/health` and `/api/status` report a healthy database.
6. Keep the original backup and Neon fallback until the website and Android client have been tested.

A dump from a different database version may need compatibility review. Do not blindly pipe an unknown SQL file into `psql`.

## Schema evolution

The API's `ensureRuntimeSchema()` function uses non-destructive `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and index creation for the runtime tables it owns. It is not a substitute for restoring the existing base schema and static transit data. Review schema changes in code before deploying them.

## Verification

- `systemctl is-active postgresql`
- `sudo -u postgres psql -d united_delhi -c '\\dt'`
- `curl -fsS http://127.0.0.1:10000/health`
- `curl -fsS http://127.0.0.1:10000/api/status`

Do not declare recovery complete until database status is OK and expected route/stop data is present.
