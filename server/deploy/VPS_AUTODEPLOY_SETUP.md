# VPS-only auto-deploy and Discord failure logs (legacy / optional)

> Current production is Vercel + Render + Neon. Keep this optional VPS timer disabled unless an explicit migration back to a VPS is planned.

United Delhi no longer uses GitHub Actions for backend deploys. The workflow was removed to avoid consuming GitHub Actions minutes. A systemd timer on the VPS polls the existing `main` checkout once per minute, runs the backend checks locally, and sends the full compressed failed-run log as a Discord attachment.

## One-time setup

The VPS bootstrap installs `united-delhi-autodeploy.service` and `united-delhi-autodeploy.timer`, but deliberately leaves the timer disabled until the repository clone, read-only GitHub deploy key, deployment environment, and backend service are ready.

1. Make sure `/opt/united-delhi/repo` is a clean clone of `git@github.com:ItzVion/united-delhi.git` and that `uddeploy` can run `git -C /opt/united-delhi/repo fetch origin main` without prompting.
2. Configure the deployment environment:
   ```bash
   sudoedit /etc/united-delhi/deploy.env
   ```
   Ensure these settings exist. Keep the Discord webhook private:
   ```dotenv
   AUTODEPLOY_ENABLED=1
   API_DEPLOY_ENABLED=1
   WEB_DEPLOY_ENABLED=0
   ANDROID_BUILD_ENABLED=0
   UD_API_BASE_URL=https://ud-api.mangotyping.fun
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
   ```
   Preserve any other values already in the file. `TRANSPORT_STACK_API_KEY` (live GTFS-RT) and `TRANSPORT_STACK_PLANNER_API_KEY` (multimodal planner) belong separately in `/etc/united-delhi/server.env`; the two values are distinct and neither belongs in source control.
3. Ensure the deploy user owns the updater's writable directories, then configure the environment and enable the timer:
   ```bash
   sudo chown uddeploy:uddeploy /opt/united-delhi
   sudo install -d -o uddeploy -g uddeploy -m 0700 /opt/united-delhi/logs /opt/united-delhi/state
   sudo install -d -o uddeploy -g uddeploy -m 0755 /opt/united-delhi/releases /opt/united-delhi/artifacts
   sudo chown root:uddeploy /etc/united-delhi/deploy.env
   sudo chmod 0640 /etc/united-delhi/deploy.env
   sudo systemctl daemon-reload
   sudo systemctl enable --now united-delhi-autodeploy.timer
   sudo systemctl start united-delhi-autodeploy.service
   sudo systemctl status united-delhi-autodeploy.timer --no-pager
   ```

## Operation

- The timer polls `origin/main` every 60 seconds; there are no GitHub Actions runs for this workflow.
- Only changes under `server/**` trigger a backend release. Frontend and APK deployment are disabled by default.
- The VPS runs `npm ci --omit=dev`, `npm run check`, `npm test`, switches to the release, restarts the service and checks health. It rolls back on restart or local health failure.
- Each run writes a log under `/opt/united-delhi/logs/`. On failure, the script gzips the full log and attaches it directly to a Discord webhook message. A marker prevents the timer from spamming the same alert on every retry of the same failed commit.
- Logs stay on the VPS for up to 14 days. If Discord is temporarily unavailable, the compressed log remains on disk.
- To inspect recent runs: `journalctl -u united-delhi-autodeploy.service -n 200 --no-pager`.
- To retrieve local logs: `ls -lt /opt/united-delhi/logs/`.

## Notes

- Polling has a maximum nominal delay of around one minute, plus build time. Instant deployment would require a GitHub webhook into a protected public endpoint on the VPS.
- Keep the repo's deploy SSH key read-only. Never put `TRANSPORT_STACK_API_KEY`, database credentials, or the Discord webhook into the repository.
