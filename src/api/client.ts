import { API_BASE_URL } from '../config';

export interface Stop { stop_id:string; name:string; latitude:number; longitude:number; distance_m?:number; }
export interface Route { route_id:string; short_name:string|null; long_name:string|null; route_color?:string|null; route_text_color?:string|null; stop_sequence?:number; }
export interface Vehicle { id:string; routeId:string|null; routeShortName:string|null; routeColor?:string|null; routeTextColor?:string|null; tripId:string|null; stopId:string|null; latitude:number; longitude:number; bearing:number|null; speedMps:number|null; observedAt:string; }
export interface SearchResult { type:'stop'|'route'; id:string; label:string; fromStop?:string|null; toStop?:string|null; routeColor?:string|null; routeTextColor?:string|null; }
export interface TripPlanOption { type:'direct'|'one-transfer'; durationMinutes:number; walkingMinutes:number; legs:Array<{routeId:string;routeName:string;routeColor?:string|null;routeTextColor?:string|null;fromStop:string;toStop:string;fromStopId:string;toStopId:string}>; transferStop?:string|null; }
export interface TripPlanStop { stop_id:string; name:string; latitude:number; longitude:number; }
export interface TripPlanResponse { status:string; origin:TripPlanStop|null; destination:TripPlanStop|null; options:TripPlanOption[]; reason?:string; }
export interface Arrival { vehicleId:string; routeId:string|null; routeShortName?:string|null; routeColor?:string|null; routeTextColor?:string|null; distanceMeters:number; etaSeconds:number|null; source:'live-data-estimate'|'live-position-no-speed'; observedAgeSeconds:number; confidence:'low'|'medium'; }
class ApiError extends Error { status:number; constructor(message:string,status:number){super(message);this.status=status;} }
async function request<T>(path:string,timeoutMs=10000,init:RequestInit={}):Promise<T>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(API_BASE_URL+path,{...init,signal:controller.signal,headers:{accept:'application/json',...(init.headers||{})}});const body=await response.json();if(!response.ok)throw new ApiError(body?.reason||`Request failed with ${response.status}`,response.status);return body as T;}catch(error){if(error instanceof ApiError)throw error;if((error as Error)?.name==='AbortError')throw new ApiError('Request timed out',0);throw new ApiError('Network error',0);}finally{clearTimeout(timer);}}
export const api={
 status:()=>request<{realtime:string;database:string;realtimeCache?:string;lastRealtimeFetch?:string|null}>('/api/status'),
 vehicles:()=>request<{status:string;count:number;vehicles:Vehicle[];reason?:string;fetchedAt?:string;stale?:boolean}>('/api/realtime/vehicles',30000),
 nearbyStops:(lat:number,lon:number,limit=10)=>{const safeLat=Math.round(lat*10000)/10000;const safeLon=Math.round(lon*10000)/10000;const safeLimit=Math.min(Math.max(Math.trunc(limit),1),50);return request<{status:string;stops:Stop[];reason?:string}>('/api/stops/nearby',10000,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lat:safeLat,lon:safeLon,limit:safeLimit})});},
 search:(q:string)=>request<{status:string;results:SearchResult[]}>(`/api/search?q=${encodeURIComponent(q)}`),
 stop:(id:string)=>request<{status:string;stop:Stop;routes:Route[]}>(`/api/stops/${encodeURIComponent(id)}`),
 route:(id:string)=>request<{status:string;route:Route;stops:Stop[];vehicles:Vehicle[]}>(`/api/routes/${encodeURIComponent(id)}`),
 arrivals:(stopId:string)=>request<{status:string;arrivals:Arrival[];reason?:string}>(`/api/stops/${encodeURIComponent(stopId)}/arrivals`),
 plan:(from:string,to:string)=>request<TripPlanResponse>(`/api/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
};
export { ApiError };
