import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 10000);

app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'united-delhi-api', time: new Date().toISOString() });
});

app.get('/api/status', (_req, res) => {
  const hasKey = Boolean(process.env.DTC_API_KEY);
  res.json({
    realtime: hasKey ? 'configured' : 'unavailable',
    reason: hasKey ? undefined : 'DTC realtime API key is not configured on the server'
  });
});

app.get('/api/realtime/vehicles', async (_req, res) => {
  const key = process.env.DTC_API_KEY;
  if (!key) {
    return res.status(503).json({ status: 'UNAVAILABLE', vehicles: [], reason: 'DTC_API_KEY is not configured' });
  }

  try {
    const url = `https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=${encodeURIComponent(key)}`;
    const upstream = await fetch(url, { headers: { accept: 'application/x-protobuf' } });
    if (!upstream.ok) {
      return res.status(502).json({ status: 'UNAVAILABLE', vehicles: [], reason: `OTD returned HTTP ${upstream.status}` });
    }
    // Decoder is intentionally isolated behind this endpoint. Use the official GTFS-Realtime protobuf schema when wiring production vehicle parsing.
    return res.json({
      status: 'UNAVAILABLE',
      vehicles: [],
      reason: 'Realtime feed retrieved, but a production protobuf decoder must be connected before vehicle data is exposed.'
    });
  } catch (error) {
    return res.status(502).json({ status: 'UNAVAILABLE', vehicles: [], reason: error instanceof Error ? error.message : 'Upstream request failed' });
  }
});

app.get('/api/search', (_req, res) => {
  res.json({ status: 'UNAVAILABLE', results: [], reason: 'Static GTFS dataset has not been loaded yet.' });
});

app.listen(port, () => {
  console.log(`United Delhi API listening on :${port}`);
});
