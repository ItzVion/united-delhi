import { timingSafeEqual } from 'node:crypto';

const OTD_URL = 'https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb';

function authorized(request) {
  const configured = String(process.env.RELAY_SECRET || '');
  if (!configured) return false;

  const header = String(request.headers.authorization || '');
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ status: 'ERROR', reason: 'Method not allowed' });
  }

  if (!authorized(request)) {
    return response.status(401).json({ status: 'ERROR', reason: 'Unauthorized' });
  }

  const apiKey = String(process.env.DTC_API_KEY || '').trim();
  if (!apiKey) {
    return response.status(500).json({ status: 'ERROR', reason: 'DTC_API_KEY is not configured' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(OTD_URL + '?key=' + encodeURIComponent(apiKey), {
      headers: { accept: 'application/x-protobuf' },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return response.status(502).json({
        status: 'ERROR',
        reason: 'OTD returned HTTP ' + upstream.status,
      });
    }

    const length = Number(upstream.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > 10 * 1024 * 1024) {
      return response.status(502).json({
        status: 'ERROR',
        reason: 'OTD realtime feed is unexpectedly large',
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return response.status(502).json({
        status: 'ERROR',
        reason: 'OTD realtime feed exceeded the 10 MB safety limit',
      });
    }

    response.setHeader('Content-Type', 'application/x-protobuf');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Length', String(buffer.byteLength));
    return response.status(200).send(buffer);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return response.status(504).json({
        status: 'ERROR',
        reason: 'OTD realtime feed timed out after 15 seconds',
      });
    }

    return response.status(502).json({
      status: 'ERROR',
      reason: 'Realtime upstream request failed',
    });
  } finally {
    clearTimeout(timer);
  }
}
