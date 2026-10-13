#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash bootstrap-vps.sh" >&2
  exit 1
fi
if [[ ! -r /etc/os-release ]]; then
  echo "Cannot identify this Linux distribution." >&2
  exit 1
fi
. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ;;
  *) echo "Supported distributions: Ubuntu or Debian. Found: ${PRETTY_NAME:-unknown}" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SOURCE="$SCRIPT_DIR/united-delhi.service"
if [[ ! -f "$UNIT_SOURCE" ]]; then
  echo "Missing $UNIT_SOURCE. Copy all files from server/deploy/ to one directory first." >&2
  exit 1
fi

if [[ -z "${DEPLOY_PUBLIC_KEY:-}" ]]; then
  read -r -p "Paste the dedicated GitHub Actions SSH PUBLIC key (ssh-ed25519 ...): " DEPLOY_PUBLIC_KEY
fi
if [[ ! "$DEPLOY_PUBLIC_KEY" =~ ^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)[[:space:]]+ ]]; then
  echo "That does not look like a supported SSH public key. Do not paste a private key." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg rsync sudo

install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
  gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod 0644 /etc/apt/keyrings/nodesource.gpg
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "22" ]]; then
  echo "Expected Node.js 22, found $(node --version)." >&2
  exit 1
fi

if ! getent group united-delhi >/dev/null; then groupadd --system united-delhi; fi
if ! id united-delhi >/dev/null 2>&1; then
  useradd --system --gid united-delhi --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin united-delhi
fi
if ! id uddeploy >/dev/null 2>&1; then
  useradd --create-home --home-dir /home/uddeploy --shell /bin/bash uddeploy
fi
install -d -o uddeploy -g uddeploy -m 0755 /opt/united-delhi /opt/united-delhi/releases
install -d -o root -g united-delhi -m 0750 /opt/united-delhi/data
install -d -o uddeploy -g uddeploy -m 0700 /home/uddeploy/.ssh
touch /home/uddeploy/.ssh/authorized_keys
if ! grep -Fq -- "$DEPLOY_PUBLIC_KEY" /home/uddeploy/.ssh/authorized_keys; then
  printf 'no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty %s\n' "$DEPLOY_PUBLIC_KEY" \
    >> /home/uddeploy/.ssh/authorized_keys
fi
chown -R uddeploy:uddeploy /home/uddeploy/.ssh
chmod 0700 /home/uddeploy/.ssh
chmod 0600 /home/uddeploy/.ssh/authorized_keys

install -d -o root -g united-delhi -m 0750 /etc/united-delhi
if [[ ! -f /etc/united-delhi/server.env ]]; then
  cat > /etc/united-delhi/server.env <<'ENV'
NODE_ENV=production
PORT=10000
APP_ORIGINS=https://united-delhi.vercel.app
DATABASE_URL=
TRANSPORT_STACK_API_KEY=
TRANSPORT_STACK_REALTIME_URL=https://dts-backend.transportstack.in/api/dataset/otd/get-file?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb
DTC_STATIC_FILE=/opt/united-delhi/data/dtc-static.zip
DTC_STATIC_SOURCE_KEY=uploaded-dtc-static-local-v1-20261013
DTC_STATIC_AUTO_IMPORT=true
METRO_STATIC_FILE=/opt/united-delhi/data/metro-static.zip
METRO_STATIC_SOURCE_KEY=uploaded-dmrc-static-local-v1-20261013
METRO_AUTO_SYNC=true
ENV
fi
chown root:united-delhi /etc/united-delhi/server.env
chmod 0640 /etc/united-delhi/server.env

install -o root -g root -m 0644 "$UNIT_SOURCE" /etc/systemd/system/united-delhi.service
printf '%s\n' 'uddeploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart united-delhi' \
  > /etc/sudoers.d/united-delhi-deploy
chmod 0440 /etc/sudoers.d/united-delhi-deploy
visudo -cf /etc/sudoers.d/united-delhi-deploy
systemctl daemon-reload
systemctl enable united-delhi

echo
echo "VPS prepared. Node: $(node --version)"
echo "Service is enabled but not started until a release is deployed."
echo "Next: configure DATABASE_URL for the local united_delhi PostgreSQL database."
echo "Add TRANSPORT_STACK_API_KEY if live vehicle tracking is required."
echo "Place dtc-static.zip and metro-static.zip in /opt/united-delhi/data/ before starting the API."
echo "Then add the SSH host/key secrets and set GitHub repository variable VPS_DEPLOY_ENABLED=true."
