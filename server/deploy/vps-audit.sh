#!/usr/bin/env bash
set -uo pipefail
ROOT=/opt/united-delhi
REPO="$ROOT/repo"

section(){ printf '\n========== %s ==========\n' "$1"; }

section "SYSTEM / REPO"
date -Is
uname -a
node --version 2>&1 || true
npm --version 2>&1 || true
df -h /
free -h
runuser -u uddeploy -- env HOME=/home/uddeploy git -C "$REPO" fetch origin main 2>&1 || true
printf 'HEAD='; git -C "$REPO" rev-parse HEAD 2>/dev/null || true
printf 'ORIGIN_MAIN='; git -C "$REPO" rev-parse origin/main 2>/dev/null || true
git -C "$REPO" status --short --branch 2>&1 || true

section "SERVICES"
systemctl is-active united-delhi postgresql cloudflared 2>&1 || true
systemctl is-enabled united-delhi-autodeploy.timer 2>&1 || true

section "LISTENING PORTS"
ss -lntp 2>&1 || true
section "FIREWALL"
ufw status 2>&1 || true

section "ENVIRONMENT PRESENCE (NO VALUES/SECRETS)"
python3 - <<'PY'
from pathlib import Path
for file, keys in [
 (Path('/etc/united-delhi/server.env'), ['DATABASE_URL','OTD_API_KEY','DTC_STATIC_FILE','METRO_STATIC_FILE']),
 (Path('/etc/united-delhi/deploy.env'), ['AUTODEPLOY_ENABLED','API_DEPLOY_ENABLED','WEB_DEPLOY_ENABLED','ANDROID_BUILD_ENABLED','VERCEL_TOKEN','VERCEL_ORG_ID','VERCEL_PROJECT_ID']),
]:
 print(file, 'present' if file.exists() else 'MISSING')
 text=file.read_text(errors='replace') if file.exists() else ''
 values={}
 for line in text.splitlines():
  if line.strip() and not line.lstrip().startswith('#') and '=' in line:
   k,v=line.split('=',1); values[k.strip()]=v.strip()
 for key in keys:
  v=values.get(key,'')
  print(f'  {key}: {"SET" if v else "EMPTY/MISSING"}')
PY
stat -c '%U:%G %a %n' /etc/united-delhi/server.env /etc/united-delhi/deploy.env 2>&1 || true
namei -l /etc/united-delhi/server.env 2>&1 || true

section "STATIC ARCHIVES"
ls -lh "$ROOT/data" 2>&1 || true
for file in "$ROOT/data/dtc-static.zip" "$ROOT/data/metro-static.zip"; do
 if [ -s "$file" ]; then unzip -t "$file" 2>&1 | tail -1; else echo "MISSING/EMPTY: $file"; fi
done

section "DATABASE COUNTS"
if command -v psql >/dev/null 2>&1; then
 sudo -u postgres psql -X -P pager=off -d united_delhi -c "SELECT (SELECT count(*) FROM routes) AS bus_routes,(SELECT count(*) FROM stops) AS bus_stops,(SELECT count(*) FROM route_stops) AS bus_route_stop_links,(SELECT count(*) FROM metro_routes) AS metro_routes,(SELECT count(*) FROM metro_stops) AS metro_stops,(SELECT count(*) FROM metro_route_stops) AS metro_route_stop_links" 2>&1 || true
 sudo -u postgres psql -X -P pager=off -d united_delhi -c "SELECT * FROM static_feed_meta" 2>&1 || true
 sudo -u postgres psql -X -P pager=off -d united_delhi -c "SELECT * FROM metro_feed_meta" 2>&1 || true
fi

section "LOCAL AND PUBLIC HEALTH"
curl -fsS --max-time 10 http://127.0.0.1:10000/health 2>&1 || true; echo
curl -fsS --max-time 10 http://127.0.0.1:10000/api/status 2>&1 || true; echo
curl -fsS --max-time 15 https://ud-api.mangotyping.fun/health 2>&1 || true; echo
curl -fsS --max-time 15 https://ud-api.mangotyping.fun/api/status 2>&1 || true; echo

section "RECENT BACKEND ERRORS"
journalctl -u united-delhi --since "24 hours ago" --no-pager 2>/dev/null | grep -Ei 'error|failed|exception|warning|unauthorized|forbidden' | tail -60 || true

section "GITHUB ENDPOINT DRIFT"
for file in "$REPO/web/vercel.json" "$REPO/app/eas.json" "$REPO/app/src/config.ts"; do
 if [ -f "$file" ]; then
  echo "--- $file"
  grep -nE 'onrender\.com|ud-api\.mangotyping\.fun' "$file" || true
 fi
done

section "PLACEHOLDER / STALE MARKERS"
git -C "$REPO" grep -n -I -E 'TODO|FIXME|PLACEHOLDER|CHANGE_ME|REPLACE_WITH|onrender\.com' origin/main -- ':!*.lock' 2>/dev/null | head -150 || true

section "TRACKED SECRET PATTERN SCAN (REVIEW MATCHES MANUALLY)"
git -C "$REPO" grep -n -I -E '(api[_-]?key|token|password)[[:space:]]*[:=][[:space:]]*["\x27][A-Za-z0-9_\-]{24,}' origin/main -- ':!*.lock' 2>/dev/null | sed -E 's/(key|token|password)([[:space:]]*[:=][[:space:]]*)["\x27][^"\x27]*/\1\2[REDACTED]/Ig' | head -50 || true

section "DONE"
echo "This script is read-only except for refreshing origin/main refs and normal curl/network requests."
