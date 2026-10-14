# United Delhi VPS / GitHub drift and security audit

Use this checklist after a production change and before enabling the updater timer. It does not certify the entire application is free of vulnerabilities; it records reproducible checks.

## Important current notes

- Production API host: `https://ud-api.mangotyping.fun`.
- Keep the Cloudflare Tunnel configuration in place. Do not expose PostgreSQL 5432 publicly.
- `server/sql/001_reset_and_schema.sql` is a disabled legacy reset file and deliberately raises an exception; never use it.
- The updater uses a read-only GitHub deploy key. Source fixes need to be committed to GitHub via an authorized write workflow, then fetched on the VPS.
- Automatic deployment is separate from Vercel native Git integration. Keep the updater timer disabled until a manual run has been verified.
- Android builds default off because the VPS is memory constrained.
- Do not commit production environment files, API keys, backup dumps, deploy keys, or generated APKs.
- The web workspace currently has no committed package-lock.json. Add/review one before claiming reproducible locked web dependencies.

## Compare live code to GitHub main

Run as root. This refreshes the Git refs only; it does not check out, reset, build, or restart anything:

```bash
runuser -u uddeploy -- env HOME=/home/uddeploy git -C /opt/united-delhi/repo fetch origin main
printf 'VPS checkout: '; git -C /opt/united-delhi/repo rev-parse HEAD
printf 'GitHub main:  '; git -C /opt/united-delhi/repo rev-parse origin/main
git -C /opt/united-delhi/repo status --short --branch
```

If the hashes differ, inspect the diff before deploying. Do not use `git reset --hard` when the working tree has local edits.

## Runtime API checks

```bash
systemctl is-active united-delhi postgresql cloudflared
curl -fsS --max-time 10 http://127.0.0.1:10000/health
curl -fsS --max-time 10 http://127.0.0.1:10000/api/status
curl -fsS --max-time 15 https://ud-api.mangotyping.fun/health
curl -fsS --max-time 15 https://ud-api.mangotyping.fun/api/status
```

Compare DTC/metro counts and timestamps against the latest import metadata before calling the static feed current.

## Security posture checks

```bash
ss -lntp
ufw status
systemctl is-enabled united-delhi-autodeploy.timer || true
namei -l /etc/united-delhi/server.env
stat -c '%U:%G %a %n' /etc/united-delhi/server.env /etc/united-delhi/deploy.env
```

Port 10000 was observed listening on all interfaces during the initial audit, while UFW was inactive. With Cloudflare Tunnel in place, consider binding the API to loopback, but only after confirming the tunnel target is `http://localhost:10000` and a rollback path is available. Check the provider firewall separately; do not change SSH/network rules blindly. Adminer on 127.0.0.1:18080 must not be public and its Cloudflare hostname must be protected by Cloudflare Access.

## Dependency checks

From the checkout of `main` with internet/npm access:

```bash
cd /opt/united-delhi/repo/server && npm audit --omit=dev
cd /opt/united-delhi/repo/web && npm audit
cd /opt/united-delhi/repo/app && npm audit
```

The web audit is not lockfile-reproducible until `web/package-lock.json` is committed. Review advisories and compatible fixes; don't use `npm audit fix --force` without change review. Node package audits cover published npm advisories, not all code or OS vulnerabilities.

## Source scans / functional checks

- Run backend `npm run check` and `npm test`.
- Run web `npm run typecheck` and `npm run build`.
- Run app `npm run typecheck` and `npm test`.
- Search tracked files for old Render origins, TODO/FIXME markers, placeholder values, and accidentally committed credentials; review matches manually because tests/docs may legitimately mention examples.
- Review Ubuntu security updates with `apt list --upgradable` and `unattended-upgrades --dry-run --debug` before applying updates.
- Test routes, stops, metro routes, realtime freshness, and frontend clients after deployment.

A successful health endpoint, clean Git status, passing tests, or zero npm advisories are useful signals—not proof that the whole system has no defects.
