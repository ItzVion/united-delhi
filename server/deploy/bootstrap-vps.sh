#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [[ ${EUID} -ne 0 ]]; then echo 'Run as root.' >&2; exit 1; fi
. /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) echo "Unsupported OS: ${PRETTY_NAME:-unknown}" >&2; exit 1;; esac

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git rsync unzip openssh-client sudo
major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [[ "$major" != 22 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  chmod 0644 /etc/apt/keyrings/nodesource.gpg
  printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Node.js 22 install/verification failed.' >&2; exit 1; }

getent group united-delhi >/dev/null || groupadd --system united-delhi
id united-delhi >/dev/null 2>&1 || useradd --system --gid united-delhi --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin united-delhi
id uddeploy >/dev/null 2>&1 || useradd --create-home --home-dir /home/uddeploy --shell /bin/bash uddeploy
install -d -o root -g united-delhi -m 0750 /etc/united-delhi /opt/united-delhi/data
install -d -o uddeploy -g uddeploy -m 0755 /opt/united-delhi /opt/united-delhi/releases /opt/united-delhi/artifacts /opt/united-delhi/state
install -d -o uddeploy -g uddeploy -m 0700 /home/uddeploy/.ssh

if [[ ! -e /etc/united-delhi/server.env ]]; then
  db_url=''
  if [[ -r /root/united-delhi-db-credentials.txt ]]; then
    password="$(sed -n 's/^Password: //p' /root/united-delhi-db-credentials.txt | head -n 1)"
    if [[ "$password" =~ ^[a-fA-F0-9]{40,80}$ ]]; then db_url="postgresql://united_delhi_app:${password}@127.0.0.1:5432/united_delhi"; fi
    unset password
  fi
  cat > /etc/united-delhi/server.env <<ENV
NODE_ENV=production
PORT=10000
APP_ORIGINS=https://united-delhi.vercel.app
DATABASE_URL=${db_url}
TRANSPORT_STACK_API_KEY=
TRANSPORT_STACK_REALTIME_URL=https://dts-backend.transportstack.in/api/dataset/otd/get-file?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb
DTC_STATIC_FILE=/opt/united-delhi/data/dtc-static.zip
DTC_STATIC_SOURCE_KEY=uploaded-dtc-static-local-v1-20261013
DTC_STATIC_AUTO_IMPORT=true
METRO_STATIC_FILE=/opt/united-delhi/data/metro-static.zip
METRO_STATIC_SOURCE_KEY=uploaded-dmrc-static-local-v1-20261013
METRO_AUTO_SYNC=true
ENV
  chown root:united-delhi /etc/united-delhi/server.env
  chmod 0640 /etc/united-delhi/server.env
fi

if [[ ! -e /etc/united-delhi/deploy.env ]]; then
  cat > /etc/united-delhi/deploy.env <<'ENV'
AUTODEPLOY_ENABLED=0
API_DEPLOY_ENABLED=1
WEB_DEPLOY_ENABLED=0
ANDROID_BUILD_ENABLED=1
UD_API_BASE_URL=https://ud-api.mangotyping.fun
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
ENV
  chown root:uddeploy /etc/united-delhi/deploy.env
  chmod 0640 /etc/united-delhi/deploy.env
fi

cat > /home/uddeploy/.ssh/known_hosts <<'KNOWN_HOSTS'
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
KNOWN_HOSTS
cat > /home/uddeploy/.ssh/config <<'SSHCONFIG'
Host github.com
    HostName github.com
    User git
    IdentityFile /home/uddeploy/.ssh/github_readonly
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    UserKnownHostsFile /home/uddeploy/.ssh/known_hosts
SSHCONFIG
chown uddeploy:uddeploy /home/uddeploy/.ssh/known_hosts /home/uddeploy/.ssh/config
chmod 0600 /home/uddeploy/.ssh/known_hosts /home/uddeploy/.ssh/config
if [[ ! -s /home/uddeploy/.ssh/github_readonly ]]; then runuser -u uddeploy -- ssh-keygen -q -t ed25519 -N '' -C 'united-delhi-vps-readonly' -f /home/uddeploy/.ssh/github_readonly; fi
chown uddeploy:uddeploy /home/uddeploy/.ssh/github_readonly /home/uddeploy/.ssh/github_readonly.pub
chmod 0600 /home/uddeploy/.ssh/github_readonly
chmod 0644 /home/uddeploy/.ssh/github_readonly.pub

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install -o root -g root -m 0644 "$SCRIPT_DIR/united-delhi.service" /etc/systemd/system/united-delhi.service
install -o root -g root -m 0644 "$SCRIPT_DIR/united-delhi-autodeploy.service" /etc/systemd/system/united-delhi-autodeploy.service
install -o root -g root -m 0644 "$SCRIPT_DIR/united-delhi-autodeploy.timer" /etc/systemd/system/united-delhi-autodeploy.timer
printf '%s\n' 'uddeploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart united-delhi' > /etc/sudoers.d/united-delhi-deploy
chmod 0440 /etc/sudoers.d/united-delhi-deploy
visudo -cf /etc/sudoers.d/united-delhi-deploy
systemctl daemon-reload
systemctl enable united-delhi
systemctl disable --now united-delhi-autodeploy.timer >/dev/null 2>&1 || true

echo
printf 'READ-ONLY GITHUB DEPLOY KEY — add to https://github.com/ItzVion/united-delhi/settings/keys with write access OFF:\n'
cat /home/uddeploy/.ssh/github_readonly.pub
echo
echo 'This base bootstrap does not install Android SDK or GTFS ZIPs. Use the supplied United-Delhi-VPS-AutoBuild-Kit.zip for the complete VPS build setup.'
echo 'Do not start the poll timer until the repo clone and deployment environment are ready.'
