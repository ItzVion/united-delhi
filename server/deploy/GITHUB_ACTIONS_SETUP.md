# GitHub Actions: backend auto-deploy and Discord alerts

The `.github/workflows/backend-checks.yml` workflow runs from **main only** when any file under `server/**` changes. It installs backend dependencies, checks syntax, runs the backend tests, and then asks the VPS to execute the existing `server/deploy/vps-autodeploy.sh` script. Web and APK deployment stay disabled in this workflow.

If any build, test, SSH, deployment, or health-check step fails, the workflow uploads its logs as a ZIP artifact and the notification job sends a Discord webhook message linking to the run and downloadable artifacts.

## 1. Add the four repository Actions secrets

In GitHub open **Settings → Secrets and variables → Actions → New repository secret** and add:

- `VPS_SSH_HOST`: the VPS hostname or IP only; do not include `uddeploy@`.
- `VPS_SSH_PRIVATE_KEY`: the private half of a dedicated SSH key used by GitHub Actions.
- `VPS_SSH_KNOWN_HOSTS`: the verified SSH host-key line(s) for that VPS.
- `DISCORD_WEBHOOK_URL`: the URL of a Discord webhook in the channel where deployment failure alerts should arrive.

Never commit any of these values or paste them into application source files.

## 2. Create a dedicated deployment SSH key on Windows

Run in PowerShell. Press Enter twice when asked for a passphrase, leaving it empty so Actions can use the key non-interactively.

```powershell
ssh-keygen -t ed25519 -C "github-actions-united-delhi-deploy" -f "$env:USERPROFILE\.ssh\united-delhi-actions"
Get-Content "$env:USERPROFILE\.ssh\united-delhi-actions.pub"
Get-Content "$env:USERPROFILE\.ssh\united-delhi-actions" -Raw
```

Copy the **public** key (the `.pub` output) into the VPS's `/home/uddeploy/.ssh/authorized_keys`. Run the following on the VPS as root, replacing the example key line with the complete public key you generated:

```bash
install -d -o uddeploy -g uddeploy -m 0700 /home/uddeploy/.ssh
touch /home/uddeploy/.ssh/authorized_keys
chown uddeploy:uddeploy /home/uddeploy/.ssh/authorized_keys
chmod 0600 /home/uddeploy/.ssh/authorized_keys
printf '%s\n' 'ssh-ed25519 REPLACE_WITH_YOUR_PUBLIC_KEY github-actions-united-delhi-deploy' >> /home/uddeploy/.ssh/authorized_keys
```

Paste the private-key output (without adding quotation marks) into the `VPS_SSH_PRIVATE_KEY` secret. Keep the private key on your computer and in GitHub Actions Secrets only.

## 3. Pin the VPS SSH host key

Use the same exact host or IP you plan to save as `VPS_SSH_HOST`. On Windows PowerShell, collect the SSH host key:

```powershell
$VPS_HOST = "REPLACE_WITH_YOUR_VPS_HOST"
ssh-keyscan -t ed25519 $VPS_HOST 2>$null | Set-Content "$env:USERPROFILE\.ssh\united-delhi-known-hosts"
ssh-keygen -lf "$env:USERPROFILE\.ssh\united-delhi-known-hosts"
Get-Content "$env:USERPROFILE\.ssh\united-delhi-known-hosts" -Raw
```

Compare the printed fingerprint with the VPS's own host-key fingerprint before trusting it. On the VPS, run:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

After confirming they match, save the entire known-hosts file as the `VPS_SSH_KNOWN_HOSTS` secret. Save only the host/IP in `VPS_SSH_HOST`.

## 4. Create the Discord webhook

In Discord, open the desired server's **Server Settings → Integrations → Webhooks**, create a webhook for the alert channel, and copy its URL into the GitHub `DISCORD_WEBHOOK_URL` secret. Treat that URL as a password.

## 5. Test it

Once the secrets and SSH public key are installed, open **GitHub → Actions → Backend auto-deploy** and run it manually on `main`. The workflow will test the backend and invoke the current main-only VPS deployment script. After that, pushes to `server/**` on `main` start this workflow automatically.

For failures, download the ZIP from the workflow run's **Artifacts** section. It contains `npm-ci.log`, `syntax-check.log`, `backend-tests.log`, `vps-deploy.log` (if reached), and run metadata. Discord messages link directly to the workflow run and its artifacts page.

## Important

- The workflow does not deploy frontend code or build an APK when only the backend changes.
- The official OTD key belongs in `/etc/united-delhi/server.env` as `OTD_API_KEY`; it is separate from these GitHub Actions secrets.
- If VPS SSH credentials or the Discord webhook secret are not configured, deployment/notification cannot work. The workflow reports the missing secret names in its logs without exposing any values.
