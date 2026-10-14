#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=/opt/united-delhi
REPO="$ROOT/repo"
STATE="$ROOT/state"
RELEASES="$ROOT/releases"
ARTIFACTS="$ROOT/artifacts"
API_BASE="${UD_API_BASE_URL:-https://ud-api.mangotyping.fun}"
MAIN_REF=refs/remotes/origin/main

log() { printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"; }
fail() { log "ERROR: $*" >&2; return 1; }

if [[ "${AUTODEPLOY_ENABLED:-0}" != 1 ]]; then
  log 'Automatic updates are disabled. Set AUTODEPLOY_ENABLED=1 in /etc/united-delhi/deploy.env after setup.'
  exit 0
fi

if [[ ! -d "$REPO/.git" ]]; then
  fail "Repository clone not found at $REPO. Clone main as uddeploy before enabling the timer."
  exit 1
fi

mkdir -p "$STATE" "$RELEASES" "$ARTIFACTS"
exec 9>/run/lock/united-delhi-autodeploy.lock
if ! flock -n 9; then
  log 'Another updater run is active; skipping this timer tick.'
  exit 0
fi

if [[ "$(git -C "$REPO" remote get-url origin)" != "git@github.com:ItzVion/united-delhi.git" ]]; then
  fail 'Repository origin is not the expected read-only SSH remote; refusing to fetch.'
  exit 1
fi

log 'Fetching latest main from GitHub (no GitHub Actions are used).'
git -C "$REPO" fetch --prune origin main
target="$(git -C "$REPO" rev-parse "$MAIN_REF")"
log "Latest main commit: $target"

git -C "$REPO" checkout --detach --force "$target" >/dev/null
mkdir -p "$REPO/web/.vercel"
if ! grep -Fxq '/web/.vercel/' "$REPO/.git/info/exclude" 2>/dev/null; then
  printf '\n/web/.vercel/\n' >> "$REPO/.git/info/exclude"
fi
chmod 0700 "$REPO/web/.vercel"

component_due() {
  local component="$1"; shift
  local marker="$STATE/$component.sha" previous
  if [[ ! -s "$marker" ]]; then return 0; fi
  previous="$(cat "$marker")"
  if [[ "$previous" == "$target" ]]; then return 1; fi
  if ! git -C "$REPO" cat-file -e "$previous^{commit}" 2>/dev/null; then return 0; fi
  if git -C "$REPO" diff --quiet "$previous" "$target" -- "$@"; then return 1; fi
  return 0
}

mark_done() {
  local component="$1"
  printf '%s\n' "$target" > "$STATE/$component.sha.tmp"
  mv -f "$STATE/$component.sha.tmp" "$STATE/$component.sha"
}

wait_local_api() {
  local i body
  for i in $(seq 1 25); do
    if curl -fsS --max-time 5 http://127.0.0.1:10000/health >/dev/null 2>&1; then
      body="$(curl -fsS --max-time 6 http://127.0.0.1:10000/api/status 2>/dev/null || true)"
      if printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("database")=="OK" else 1)' 2>/dev/null; then return 0; fi
    fi
    sleep 2
  done
  return 1
}

backend_build_deploy() {
  local release="$RELEASES/$target" previous='' healthy=false
  log 'Building backend on the VPS.'
  install -d -m 0755 "$release" || return 1
  rsync -a --delete --exclude='.env' --exclude='.env.*' --exclude='node_modules/' "$REPO/server/" "$release/" || return 1
  (
    cd "$release" &&
    npm ci --omit=dev &&
    npm run check &&
    npm test
  ) || return 1

  previous="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
  ln -sfn "$release" "$ROOT/current.next" || return 1
  mv -Tf "$ROOT/current.next" "$ROOT/current" || return 1
  if ! sudo -n /usr/bin/systemctl restart united-delhi; then
    log 'Backend service restart failed; rolling back the code symlink.'
    if [[ -n "$previous" && -d "$previous" ]]; then
      ln -sfn "$previous" "$ROOT/current.next"
      mv -Tf "$ROOT/current.next" "$ROOT/current"
      sudo -n /usr/bin/systemctl restart united-delhi || true
    else
      rm -f "$ROOT/current"
      sudo -n /usr/bin/systemctl stop united-delhi || true
    fi
    return 1
  fi

  if wait_local_api; then healthy=true; fi
  if [[ "$healthy" != true ]]; then
    log 'Local API/database health check failed; rolling back the code symlink.'
    if [[ -n "$previous" && -d "$previous" ]]; then
      ln -sfn "$previous" "$ROOT/current.next"
      mv -Tf "$ROOT/current.next" "$ROOT/current"
      sudo -n /usr/bin/systemctl restart united-delhi || true
    else
      rm -f "$ROOT/current"
      sudo -n /usr/bin/systemctl stop united-delhi || true
    fi
    return 1
  fi

  log 'Backend is healthy locally with database=OK.'
  if curl -fsS --max-time 12 "$API_BASE/health" >/dev/null 2>&1; then
    log "Public API tunnel responded: $API_BASE/health"
  else
    log "WARNING: local API is healthy but public tunnel check failed for $API_BASE/health. Check the Cloudflare Tunnel hostname route."
  fi

  local current_path candidate i=0
  current_path="$(readlink -f "$ROOT/current")"
  while IFS= read -r candidate; do
    i=$((i + 1))
    if (( i > 6 )) && [[ "$candidate" != "$current_path" && "$candidate" != "$previous" ]]; then rm -rf -- "$candidate"; fi
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  return 0
}

web_build_deploy() {
  if [[ -z "${VERCEL_TOKEN:-}" || -z "${VERCEL_ORG_ID:-}" || -z "${VERCEL_PROJECT_ID:-}" ]]; then
    fail 'WEB_DEPLOY_ENABLED=1 but VERCEL_TOKEN, VERCEL_ORG_ID or VERCEL_PROJECT_ID is missing in /etc/united-delhi/deploy.env.'
    return 1
  fi
  if [[ "$API_BASE" != https://* ]]; then
    fail "Refusing to build production web output with a non-HTTPS API origin: $API_BASE"
    return 1
  fi
  if ! curl -fsS --max-time 12 "$API_BASE/health" >/dev/null 2>&1; then
    fail "Public API $API_BASE/health is not healthy; postponing the Vercel cutover."
    return 1
  fi
  local status_body
  status_body="$(curl -fsS --max-time 12 "$API_BASE/api/status" 2>/dev/null || true)"
  if ! printf '%s' "$status_body" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("database")=="OK" else 1)' 2>/dev/null; then
    fail "Public API database status is not OK; refusing to publish the frontend against an unhealthy backend."
    return 1
  fi
  log 'Building the Vercel frontend on this VPS and uploading the prebuilt output (no GitHub Actions).'
  # Patch the build checkout's Vercel rewrite targets and CSP to the VPS API.
  # The next fetch/checkout restores tracked files; this is a build-time transform only.
  python3 - "$REPO/web/vercel.json" "$API_BASE" "$REPO/web/.vercel/project.json" "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" <<'PY'
import json, os, sys, tempfile
config_path, api_base, project_path, org, project = sys.argv[1:]
api_base = api_base.rstrip('/')
with open(config_path, encoding='utf-8') as f:
    original = f.read()
old_origin = 'https://united-delhi-api.onrender.com'
if old_origin in original:
    updated = original.replace(old_origin, api_base)
elif api_base in original:
    updated = original
else:
    raise SystemExit('Could not identify the known API origin in web/vercel.json; refusing to deploy the wrong backend.')
json.loads(updated)
fd, temp = tempfile.mkstemp(prefix='.vercel-json-', dir=os.path.dirname(config_path), text=True)
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write(updated)
os.chmod(temp, 0o644)
os.replace(temp, config_path)
print('Vercel config rewrite/CSP API origin set to ' + api_base)
os.makedirs(os.path.dirname(project_path), mode=0o700, exist_ok=True)
fd, temp = tempfile.mkstemp(prefix='.project-', dir=os.path.dirname(project_path), text=True)
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    json.dump({'orgId': org, 'projectId': project, 'projectName': 'united-delhi'}, f)
    f.write('\n')
os.chmod(temp, 0o600)
os.replace(temp, project_path)
PY
  (
    cd "$REPO/web" &&
    npx --yes vercel@latest pull --yes --environment=production --token="$VERCEL_TOKEN" &&
    npx --yes vercel@latest build --prod --token="$VERCEL_TOKEN" &&
    npx --yes vercel@latest deploy --prebuilt --prod --yes --token="$VERCEL_TOKEN"
  ) || return 1
  log 'Vercel prebuilt deployment command completed.'
}

android_build() {
  if ! wait_local_api; then fail 'API/database is not healthy locally; refusing to build an APK configured to use the new API.'; return 1; fi
  if ! curl -fsS --max-time 12 "$API_BASE/health" >/dev/null 2>&1; then fail "Public API $API_BASE/health is not reachable yet; APK build postponed until the tunnel works."; return 1; fi
  log 'Type-checking and building the Android APK locally on the VPS (single Gradle worker).'
  (
    cd "$REPO/app" &&
    export EXPO_PUBLIC_API_BASE_URL="$API_BASE" &&
    export NODE_ENV=production &&
    export NODE_OPTIONS=--max-old-space-size=768 &&
    npm ci &&
    npm run typecheck &&
    npm test &&
    npx expo prebuild --clean --platform android --no-install &&
    cd android &&
    bash ./gradlew --no-daemon --max-workers=1 :app:assembleRelease
  ) || return 1
  local apk="$REPO/app/android/app/build/outputs/apk/release/app-release.apk"
  if [[ ! -s "$apk" ]]; then fail 'Gradle exited without producing app-release.apk.'; return 1; fi
  local output="$ARTIFACTS/united-delhi-${target:0:12}.apk"
  install -o uddeploy -g uddeploy -m 0644 "$apk" "$output" || return 1
  ln -sfn "$output" "$ARTIFACTS/latest.apk.next" || return 1
  mv -Tf "$ARTIFACTS/latest.apk.next" "$ARTIFACTS/latest.apk" || return 1
  sha256sum "$output" > "$output.sha256" || return 1
  chmod 0644 "$output.sha256"
  log "APK saved to $output. This is a locally built release APK; Play Store publishing may require a separate production signing keystore."
}

failed=0
if [[ "${API_DEPLOY_ENABLED:-1}" == 1 ]]; then
  if component_due server server; then
    if backend_build_deploy; then mark_done server; else log 'Backend phase failed; it will retry on a later timer run.'; failed=1; fi
  else mark_done server; fi
else log 'API deployment phase disabled by configuration.'; fi

if [[ "${WEB_DEPLOY_ENABLED:-0}" == 1 ]]; then
  if component_due web web; then
    if web_build_deploy; then mark_done web; else log 'Web phase failed; it will retry on a later timer run.'; failed=1; fi
  else mark_done web; fi
else log 'Vercel build/deploy is disabled until Vercel token and project IDs are configured.'; fi

if [[ "${ANDROID_BUILD_ENABLED:-0}" == 1 ]]; then
  if component_due app app; then
    if android_build; then mark_done app; else log 'Android APK phase failed; it will retry on a later timer run.'; failed=1; fi
  else mark_done app; fi
else log 'Android build phase disabled by configuration.'; fi

if (( failed != 0 )); then exit 1; fi
log 'Updater cycle finished.'
