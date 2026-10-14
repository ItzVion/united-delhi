# United Delhi VPS rebuild checklist

This procedure is designed for an existing Ubuntu VPS with PostgreSQL and a Cloudflare Tunnel that must be preserved.

## Preserve before changing anything

1. Verify PostgreSQL is active and the `united_delhi` database exists.
2. Verify `/root/united-delhi-backups` contains a known-good dump and copy it off-server securely.
3. Record the current tunnel config path and verify the `cloudflared` service is active. Do not uninstall or rewrite it.
4. Keep `/etc/united-delhi/server.env`, `/etc/united-delhi/deploy.env`, and database credentials. Do not upload them to GitHub.
5. Keep Neon and Render available until public VPS API checks pass.

## Deployment-only cleanup

Upload/use `clean-deployment.sh` from this directory and run:

```bash
CONFIRM_DEPLOYMENT_CLEANUP=YES bash server/deploy/clean-deployment.sh
```

This intentionally removes only the United Delhi app service units, checkout, releases, generated artifacts and updater state. It preserves PostgreSQL, database files, credentials/env files, static transit archives under `/opt/united-delhi/data`, backups and Cloudflare Tunnel configuration. It does not uninstall system packages.

## Install and bootstrap

Run `bootstrap-vps.sh` as root to install base packages and Node.js 22, create the service users/directories if missing, preserve existing env files, configure a read-only SSH deploy key, and install systemd units. The bootstrap must not reset or migrate the database. Keep all automation flags off until a manual build/test and health check passes.

Add the public key from `/home/uddeploy/.ssh/github_readonly.pub` to the private GitHub repository as a read-only deploy key. Never enable write access.

Clone the private repository as `uddeploy`:

```bash
runuser -u uddeploy -- env HOME=/home/uddeploy USER=uddeploy LOGNAME=uddeploy git clone --branch main git@github.com:ItzVion/united-delhi.git /opt/united-delhi/repo
```

## First backend deployment

- Configure `/etc/united-delhi/server.env` with the existing local PostgreSQL URL and required API key using a secure editor.
- Keep `AUTODEPLOY_ENABLED=0`, `WEB_DEPLOY_ENABLED=0`, and `ANDROID_BUILD_ENABLED=0`.
- Run backend checks and tests from `/opt/united-delhi/repo/server`.
- Only start the backend service after confirming the current schema/data are compatible.
- Verify `http://127.0.0.1:10000/health` and `http://127.0.0.1:10000/api/status`; the status must report database OK.
- Verify the public API hostname through the existing Cloudflare Tunnel.
- Do not switch the app/web API origin away from Render until these checks and user tests pass.

## Security / resource limits

- Do not expose PostgreSQL port 5432 to the internet.
- Do not expose Adminer unless Cloudflare Access is enabled and verified.
- Do not change firewall/SSH rules without checking the current access path.
- Never run the disabled `server/sql/001_reset_and_schema.sql`.
- The VPS has limited RAM. Android builds can exhaust memory; enable them only after API stability, with a single Gradle worker and a memory limit. Vercel prebuilt deployment remains off unless deliberately configured.
- No GitHub Actions runner is needed for this flow. The VPS fetches read-only source; it never pushes commits.
