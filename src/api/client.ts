import { API_BASE_URL } from '../config';

export interface Stop {
  stop_id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_m?: number;
}

export interface Route {
  route_id: string;
  short_name: string | null;
  long_name: string | null;
  stop_sequence?: number;
}

export interface Vehicle {
  id: string;
  routeId: string | null;
  tripId: string | null;
  stopId: string | null;
  latitude: number;
  longitude: number;
  bearing: number | null;
  speedMps: number | null;
  observedAt: string;
}

export interface SearchResult {
  type: 'stop' | 'route';
  id: string;
  label: string;
}

export interface Arrival {
  vehicleId: string;
  routeId: string | null;
  distanceMeters: number;
  etaSeconds: number | null;
  source: 'live-data-estimate' | 'live-position-no-speed';
  observedAgeSeconds: number;
  confidence: 'low' | 'medium';
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new ApiError(body?.reason || `Request failed with ${response.status}`, response.status);
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new ApiError('Request timed out', 0);
    throw new ApiError('Network error', 0);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  status: () => request<{ realtime: string; database: string }>('/api/status'),
  vehicles: () => request<{ status: string; count: number; vehicles: Vehicle[]; reason?: string }>('/api/realtime/vehicles', 30000),
  nearbyStops: (lat: number, lon: number, limit = 10) => request<{ status: string; stops: Stop[]; reason?: string }>(`/api/stops/nearby?lat=${lat}&lon=${lon}&limit=${limit}`),
  search: (q: string) => request<{ status: string; results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  stop: (id: string) => request<{ status: string; stop: Stop; routes: Route[] }>(`/api/stops/${encodeURIComponent(id)}`),
  route: (id: string) => request<{ status: string; route: Route; stops: Stop[]; vehicles: Vehicle[] }>(`/api/routes/${encodeURIComponent(id)}`),
  arrivals: (stopId: string) => request<{ status: string; arrivals: Arrival[]; reason?: string }>(`/api/stops/${encodeURIComponent(stopId)}/arrivals`)
};

export { ApiError };