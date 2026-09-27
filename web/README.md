# United Delhi web client

This directory contains the browser/desktop version of United Delhi.

## Run locally

From the repository root:

```bash
python -m http.server 8080 -d web
```

Then open:

```
http://localhost:8080
```

A normal HTTPS/static host can serve this directory without a Node backend. The web client calls the hosted United Delhi API at:

```
https://united-delhi.de.deplexo.com
```

## Deploy on Vercel

Create a Vercel project from this repository and set:

- Root Directory: `web`
- Framework Preset: Other
- Build Command: empty
- Output Directory: `.`

No secrets are required in the web project.

## Features

- 18+ access gate
- Live DTC vehicle map
- Route search
- Stop search
- Exact route variant details
- Ordered route stops and route polyline
- Live vehicles on a route
- Stop live arrivals
- Nearby stops using browser location
- Direct/one-change trip planner
- Legal/privacy links
- Responsive desktop and mobile browser layout

The iOS/Android app remains in the repository root and shares the same backend API.
