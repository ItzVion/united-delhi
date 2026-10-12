import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

export interface Stop { stop_id:string; name:string; latitude:number; longitude:number; distance_m?:number; distanceMeters?:number; }
export interface Route { route_id:string; short_name:string|null; long_name:string|null; route_color?:string|null; route_text_color?:string|null; stop_sequence?:number; publicRouteName?:string|null; fromStop?:string|null; toStop?:string|null; }
export interface LiveryVerification { status:'verified'; colorName?:string|null; source?:string|null; evidenceUrl?:string|null; verifiedAt?:string|null; }
export interface Vehicle { id:string; routeId:string|null; routeShortName:string|null; routeColor?:string|null; routeTextColor?:string|null; tripId:string|null; stopId:string|null; vehicleLabel?:string|null; licensePlate?:string|null; operator?:string|null; serviceType?:'dtc'|'electric'|'unknown'; serviceColor?:string|null; fleetColorSource?:'upstream-api'|'verified-livery-record'|'estimated-fleet-type'|'estimated-route-profile'|'not-provided-by-realtime-feed'; liveryVerification?:LiveryVerification; busType?:string|null; fromStop?:string|null; toStop?:string|null; latitude:number; longitude:number; bearing:number|null; observedAt:string; }
export interface MetroRoute { route_id:string; agency_id?:string|null; short_name:string|null; long_name:string|null; route_type?:number; route_color?:string|null; route_text_color?:string|null; }
export interface MetroStop { stop_id:string; name:string; latitude:number; longitude:number; stop_sequence?:number; }
export interface MetroDirection { directionId:string|number; fromStop?:string|null; toStop?:string|null; stops:MetroStop[]; }
export interface MetroFeedMeta { imported_at?:string|null; route_count?:number; stop_count?:number; route_stop_count?:number; }
export interface MetroResponse { status:string; routes:MetroRoute[]; stops:MetroStop[]; meta?:MetroFeedMeta|null; reason?:string; }
export interface MetroRouteResponse { status:string; route:MetroRoute; directions:MetroDirection[]; stops:MetroStop[]; reason?:string; }
export interface SearchResult { type:'stop'|'route'; id:string; label:string; fromStop?:string|null; toStop?:string|null; routeColor?:string|null; routeTextColor?:string|null; stopContext?:string|null; routeCount?:number; }
export interface TripPlanOption { type:'direct'|'transfer'|'one-transfer'; durationMinutes:number; walkingMinutes:number|null; legs:Array<{routeId:string;routeName:string;routeColor?:string|null;routeTextColor?:string|null;fromStop:string;toStop:string;fromStopId:string;toStopId:string}>; transferStop?:string|null; }
export interface TripPlanStop { stop_id:string; name:string; latitude:number; longitude:number; }
export interface TripPlanResponse { status:string; origin:TripPlanStop|null; destination:TripPlanStop|null; options:TripPlanOption[]; reason?:string; }
export interface Arrival { vehicleId:string; routeId:string|null; routeShortName?:string|null; routeColor?:string|null; routeTextColor?:string|null; serviceType?:'dtc'|'electric'|'unknown'; serviceColor?:string|null; fleetColorSource?:'upstream-api'|'verified-livery-record'|'estimated-fleet-type'|'estimated-route-profile'|'not-provided-by-realtime-feed'; busType?:string|null; distanceMeters:number; observedAgeSeconds:number; fromStop?:string|null; toStop?:string|null; }
export interface VehicleResponse { status:string; count:number; vehicles:Vehicle[]; reason?:string; fetchedAt?:string; stale?:boolean; source?:string; cacheAgeSeconds?:number|null; }
class ApiError extends Error { status:number; constructor(message:string,status:number){super(message);this.status=status;} }
const LIVE_CACHE_KEY='ud-live-vehicles-v9';
const readVehicleCache=async():Promise<VehicleResponse|null>=>{try{const raw=await AsyncStorage.getItem(LIVE_CACHE_KEY);if(!raw)return null;const parsed=JSON.parse(raw);return Array.isArray(parsed?.vehicles)&&parsed.vehicles.length?parsed:null;}catch{return null}};
const writeVehicleCache=async(value:VehicleResponse)=>{try{await AsyncStorage.setItem(LIVE_CACHE_KEY,JSON.stringify({...value,storedAt:new Date().toISOString()}));}catch{}};
const SERVICE_WAKING_MESSAGE='The live service is waking up or reconnecting. It can take up to a minute after inactivity; the app will retry automatically.';
function wakeErrorForStatus(status:number,validJson:boolean):string{
 if([502,503,504].includes(status)||!validJson)return SERVICE_WAKING_MESSAGE;
 if(status===429)return 'The live service is receiving too many requests. Please wait a moment and try again.';
 return 'The live service could not complete this request. Please try again shortly.';
}
async function request<T>(path:string,timeoutMs=10000,init:RequestInit={},retries=2):Promise<T>{
 let lastError:Error|null=null;
 for(let attempt=0;attempt<=retries;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetch(API_BASE_URL+path,{...init,signal:controller.signal,headers:{accept:'application/json',...(init.headers||{})}});
   const text=await response.text();let body:any=null,validJson=false;
   try{body=text?JSON.parse(text):{};validJson=Boolean(body&&typeof body==='object'&&!Array.isArray(body));}catch{}
   if(!response.ok){
    if(!validJson||[502,503,504].includes(response.status))throw new ApiError(wakeErrorForStatus(response.status,validJson),response.status);
    const reason=typeof body.reason==='string'&&!/^\s*</.test(body.reason)?body.reason:null;
    throw new ApiError(reason||wakeErrorForStatus(response.status,true),response.status);
   }
   if(!validJson)throw new ApiError(SERVICE_WAKING_MESSAGE,response.status);
   return body as T;
  }catch(error){
   if(error instanceof ApiError){lastError=error;if(error.status>=400&&error.status<500&&error.status!==429)throw error;}
   else lastError=new ApiError(SERVICE_WAKING_MESSAGE,0);
   if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,Math.min(1500,350*2**attempt)));
  }finally{clearTimeout(timer);}
 }
 throw lastError||new ApiError(SERVICE_WAKING_MESSAGE,0);
}
export const api={
 status:()=>request<{realtime:string;database:string;realtimeCache?:string;lastRealtimeFetch?:string|null}>('/api/status'),
 vehicles:async():Promise<VehicleResponse>=>{
  try{
   const result=await request<VehicleResponse>('/api/realtime/vehicles',65000,{},0);
   if(Array.isArray(result.vehicles)&&result.vehicles.length)await writeVehicleCache(result);
   return result;
  }catch{
   const cached=await readVehicleCache();
   if(cached)return {...cached,status:'STALE',stale:true,source:'client-cache',reason:'Showing the last known bus positions while the live service reconnects.'};
   return {status:'UNAVAILABLE',count:0,vehicles:[],stale:true,source:'client-empty',reason:SERVICE_WAKING_MESSAGE};
  }
 },
 nearbyStops:(lat:number,lon:number,limit=10)=>{const safeLat=Math.round(lat*10000)/10000;const safeLon=Math.round(lon*10000)/10000;const safeLimit=Math.min(Math.max(Math.trunc(limit),1),50);return request<{status:string;stops:Stop[];reason?:string}>('/api/stops/nearby',10000,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lat:safeLat,lon:safeLon,limit:safeLimit})});},
 search:(q:string)=>request<{status:string;results:SearchResult[]}>(`/api/search?q=${encodeURIComponent(q)}`),
 stop:(id:string)=>request<{status:string;stop:Stop;routes:Route[]}>(`/api/stops/${encodeURIComponent(id)}`),
 route:(id:string)=>request<{status:string;route:Route;stops:Stop[];vehicles:Vehicle[]}>(`/api/routes/${encodeURIComponent(id)}`),
 arrivals:(stopId:string)=>request<{status:string;arrivals:Arrival[];reason?:string}>(`/api/stops/${encodeURIComponent(stopId)}/arrivals`),
 metro:()=>request<MetroResponse>('/api/metro',12000),
 metroRoute:(routeId:string)=>request<MetroRouteResponse>(`/api/metro/routes/${encodeURIComponent(routeId)}`,12000),
 plan:(from:string,to:string,fromStopId?:string,toStopId?:string)=>{const params=new URLSearchParams({from,to});if(fromStopId)params.set('fromStopId',fromStopId);if(toStopId)params.set('toStopId',toStopId);return request<TripPlanResponse>('/api/plan?'+params.toString(),15000);}
};
export { ApiError, readVehicleCache };