import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

export function readGtfsCsv(dir, filename) {
  if (!fs.existsSync(path.join(dir, filename))) throw new Error(`Missing GTFS file: ${filename}`);
  const filePath = path.join(dir, filename);
  return parse(fs.readFileSync(filePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true
  });
}

export function parseStops(rows) {
  return rows
    .map(row => ({
      stopId: String(row.stop_id ?? '').trim(),
      name: String(row.stop_name ?? '').trim(),
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon)
    }))
    .filter(row =>
      row.stopId &&
      row.name &&
      Number.isFinite(row.lat) &&
      Number.isFinite(row.lon) &&
      row.lat >= -90 && row.lat <= 90 &&
      row.lon >= -180 && row.lon <= 180
    );
}

export function parseRoutes(rows) {
  return rows
    .map(row => ({
      routeId: String(row.route_id ?? '').trim(),
      shortName: String(row.route_short_name ?? '').trim() || null,
      longName: String(row.route_long_name ?? '').trim() || null
    }))
    .filter(row => row.routeId);
}

export function buildRouteStops(trips, stopTimes) {
  const tripToRoute = new Map();

  for (const trip of trips) {
    const tripId = String(trip.trip_id ?? '').trim();
    const routeId = String(trip.route_id ?? '').trim();
    if (tripId && routeId) tripToRoute.set(tripId, routeId);
  }

  const rows = [];
  for (const stopTime of stopTimes) {
    const tripId = String(stopTime.trip_id ?? '').trim();
    const stopId = String(stopTime.stop_id ?? '').trim();
    const routeId = tripToRoute.get(tripId);
    const sequence = Number(stopTime.stop_sequence);

    if (
      routeId &&
      stopId &&
      Number.isFinite(sequence)
    ) {
      rows.push({
        routeId,
        stopId,
        stopSequence: sequence
      });
    }
  }

  return rows;
}
