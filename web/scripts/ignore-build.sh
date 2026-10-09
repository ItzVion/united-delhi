#!/usr/bin/env bash
# Vercel Ignored Build Step.
# Vercel runs this from the configured Root Directory (web/).
# Exit 0 = skip deployment; exit 1 = continue building.
set -u

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Cannot locate repository root; fail open and build."
  exit 1
}
previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [[ -z "$previous" || -z "$current" ]]; then
  echo "No previous deployment SHA; build to initialize the site."
  exit 1
fi

if ! git -C "$repo_root" cat-file -e "$previous^{commit}" 2>/dev/null; then
  git -C "$repo_root" fetch --quiet --no-tags --deepen=100 origin "$current" || true
fi
if ! git -C "$repo_root" cat-file -e "$previous^{commit}" 2>/dev/null ||
   ! git -C "$repo_root" cat-file -e "$current^{commit}" 2>/dev/null; then
  echo "Previous deployment commit is unavailable; fail open and build."
  exit 1
fi

set +e
git -C "$repo_root" diff --quiet "$previous" "$current" -- web
result=$?
set -e

case "$result" in
  0)
    echo "No changes under web/ since the last successful deployment; skipping website build."
    exit 0
    ;;
  1)
    echo "Website source changed; continue the Vercel build."
    exit 1
    ;;
  *)
    echo "Unable to compare commit trees (git diff exit $result); fail open and build."
    exit 1
    ;;
esac
