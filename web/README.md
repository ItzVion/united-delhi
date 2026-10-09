# United Delhi Web

React + Vite + TypeScript browser client for United Delhi.

## Vercel
- Root Directory: `web`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

The live API is `https://united-delhi-api.onrender.com`. Production requests are proxied through `web/vercel.json`; local Vite development proxies `/api` to the same API. No DTC API key, Neon credential, or server secret belongs in this project.

Security headers are defined in `vercel.json`; run typecheck and build checks before production releases.

The native Expo Android/iOS app remains at the repository root and shares the same backend.
