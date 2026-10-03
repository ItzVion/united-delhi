# United Delhi Web

React + Vite + TypeScript browser client for United Delhi.

## Vercel
- Root Directory: `web`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

The client uses only the public Wasmer API endpoint. No DTC API key, Neon credential, or server secret belongs in this project.

Security headers are defined in `vercel.json`; dependencies should stay current and CI should run npm audit before production releases.

The native Expo Android/iOS app remains at the repository root and shares the same backend.