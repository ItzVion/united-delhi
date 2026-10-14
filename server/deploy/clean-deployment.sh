#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi
if [[ "${CONFIRM_DEPLOYMENT_CLEANUP:-}" != "YES" ]]; then
  echo "This removes United Delhi application releases and service units only."
  echo "It does NOT delete PostgreSQL, database files, /etc/united-delhi secrets, Cloudflare Tunnel config, backups, or /opt/united-delhi/data."
  echo "To proceed, run: CONFIRM_DEPLOYMENT_CLEANUP=YES bash $0"
  exit 2
fi

echo "Stopping only United Delhi application deployment units..."
systemctl disable --now united-delhi-autodeploy.timer 2>/dev/null || true
systemctl stop united-delhi-autodeploy.service 2>/dev/null || true
systemctl stop united-delhi.service 2>/dev/null || true

rm -f /etc/systemd/system/united-delhi.service
rm -f /etc/systemd/system/united-delhi-autodeploy.service
rm -f /etc/systemd/system/united-delhi-autodeploy.timer
rm -f /etc/sudoers.d/united-delhi-deploy
systemctl daemon-reload
systemctl reset-failed united-delhi.service united-delhi-autodeploy.service 2>/dev/null || true

# Remove code/releases and generated artifacts, preserving static data and all DB/config files.
rm -rf /opt/united-delhi/repo /opt/united-delhi/releases /opt/united-delhi/artifacts /opt/united-delhi/state
rm -f /opt/united-delhi/current /opt/united-delhi/current.next

echo
echo "Deployment code and units removed."
echo "Preserved: PostgreSQL and all databases; /etc/united-delhi; /opt/united-delhi/data;"
echo "/root/united-delhi-backups; /root/united-delhi-db-credentials.txt; Cloudflare Tunnel config."
echo "No package removal, database migration, SQL execution, firewall change, or tunnel change was performed."
