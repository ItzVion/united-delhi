import {roundCoordinate} from './lib';

export const API=String(import.meta.env.VITE_API_BASE_URL || '/api').trim().replace(/\/+$/,'');
const LIVE_CACHE_KEY='ud-live-vehicles-v9';
export const SERVICE_WAKING_MESSAGE='The live service is waking up or reconnecting. It can take up to a minute after inactivity; we will retry automatically.';
type LiveryVerification={status:'verified';colorName?:string|null;source?:string|null;evidenceUrl?:string|null;verifiedAt?:string|null};
export type Vehicle={
  id:string;routeId:string|null;routeShortName:string|null;routeColor?:string|null;routeTextColor?:string|null;
  routeLongName?:string|null;fromStop?:string|null;toStop?:string|null;serviceType?:'dtc'|'electric'|'unknown';
  busType?:string|null;serviceColor?:string|null;fleetColorSource?:'upstream-api'|'verified-livery-record'|'estimated-fleet-type'|'estimated-route-profile'|'not-provided-by-realtime-feed';
  liveryVerification?:LiveryVerification;vehicleLabel?:string|null;licensePlate?:string|null;latitude:number;longitude:number;
  observedAt?:string;tripHeadsign?:string|null;directionId?:number|null
};
type VehicleResponse={status:string;count:number;vehicles:Vehicle[];reason?:string;fetchedAt?:string;stale?:boolean;source?:string;cacheAgeSeconds?:number|null};
const readVehicleCache=():VehicleResponse|null=>{try{const raw=window.localStorage.getItem(LIVE_CACHE_KEY);if(!raw)return null;const d=JSON.parse(raw);return Array.isArray(d?.vehicles)&&d.vehicles.length?d:null}catch{return null}};
const writeVehicleCache=(d:VehicleResponse)=>{try{window.localStorage.setItem(LIVE_CACHE_KEY,JSON.stringify({...d,storedAt:new Date().toISOString()}))}catch{}};
class ApiError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}
function wakeErrorForStatus(status:number,validJson:boolean):string{
  if([502,503,504].includes(status)||!validJson)return SERVICE_WAKING_MESSAGE;
  if(status===429)return 'The live service is receiving too many requests. Please wait a moment and try again.';
  return 'The live service could not complete this request. Please try again shortly.';
}
async function request<T>(path:string,init:RequestInit={},timeoutMs=10000,retries=2):Promise<T>{
  let lastError:Error|null=null;
  for(let attempt=0;attempt<=retries;attempt++){
    const controller=new AbortController();
    const externalSignal=init.signal;
    const abortFromCaller=()=>controller.abort();
    if(externalSignal?.aborted)controller.abort();
    else externalSignal?.addEventListener('abort',abortFromCaller,{once:true});
    const timer=window.setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(API+path,{...init,signal:controller.signal,headers:{Accept:'application/json','Cache-Control':'no-cache',...(init.headers??{})},cache:'no-store'});
      const text=await response.text();
      let data:any=null,validJson=false;
      try{data=text?JSON.parse(text):{};validJson=Boolean(data&&typeof data==='object'&&!Array.isArray(data));}catch{}
      if(!response.ok){
        if(!validJson||[502,503,504].includes(response.status))throw new ApiError(wakeErrorForStatus(response.status,validJson),response.status);
        const reason=typeof data.reason==='string'&&!/^\s*</.test(data.reason)?data.reason:null;
        throw new ApiError(reason||wakeErrorForStatus(response.status,true),response.status);
      }
      if(!validJson)throw new ApiError(SERVICE_WAKING_MESSAGE,response.status);
      return data as T;
    }catch(error){
      if(error instanceof ApiError){
        lastError=error;
        if(error.status>=400&&error.status<500&&error.status!==429)throw error;
      }else if((error as Error)?.name==='AbortError'){
        lastError=new ApiError(SERVICE_WAKING_MESSAGE,0);
      }else{
        lastError=new ApiError(SERVICE_WAKING_MESSAGE,0);
      }
      if(attempt<retries)await new Promise(resolve=>window.setTimeout(resolve,Math.min(1500,350*2**attempt)));
    }finally{window.clearTimeout(timer);externalSignal?.removeEventListener('abort',abortFromCaller);}
  }
  throw lastError||new ApiError(SERVICE_WAKING_MESSAGE,0);
}
export const api={
  vehicles:async():Promise<VehicleResponse>=>{
    try{
      const data=await request<VehicleResponse>('/realtime/vehicles',{},65000,0);
      if(Array.isArray(data.vehicles)&&data.vehicles.length)writeVehicleCache(data);
      return data;
    }catch{
      const cached=readVehicleCache();
      if(cached)return{...cached,status:'STALE',stale:true,source:'client-cache',reason:'Showing the last known bus positions while the live service reconnects.'};
      return{status:'UNAVAILABLE',count:0,vehicles:[],stale:true,source:'client-empty',reason:SERVICE_WAKING_MESSAGE};
    }
  },
  search:(q:string,options:Pick<RequestInit,'signal'>={})=>request<{status:string;results:any[]}>(`/search?q=${encodeURIComponent(q)}`,{signal:options.signal},12000,0),
  route:(id:string)=>request<any>(`/routes/${encodeURIComponent(id)}`,{},8000,1),
  stop:async(id:string)=>{const stopResult=await request<any>(`/stops/${encodeURIComponent(id)}`);let arrivals:any={status:'UNAVAILABLE',arrivals:[],reason:'Live arrival data is unavailable.'};try{arrivals=await request<any>(`/stops/${encodeURIComponent(id)}/arrivals`,{},8000,1)}catch{}return [stopResult,arrivals] as const},
  metro:()=>request<any>('/metro',{},12000,1),
  metroRoute:(id:string)=>request<any>('/metro/routes/'+encodeURIComponent(id),{},10000,1),
  nearby:(lat:number,lon:number)=>request<any>('/stops/nearby',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:roundCoordinate(lat,4),lon:roundCoordinate(lon,4),limit:30})},8000,1),
  plan:(from:string,to:string,fromStopId?:string,toStopId?:string)=>{const params=new URLSearchParams({from,to});if(fromStopId)params.set('fromStopId',fromStopId);if(toStopId)params.set('toStopId',toStopId);return request<any>('/plan?'+params.toString(),{},15000,1)},
  planMultimodal:(fromType:'bus'|'metro',toType:'bus'|'metro',fromStopId:string,toStopId:string)=>{const params=new URLSearchParams({fromType,toType,fromStopId,toStopId});return request<any>('/plan/multimodal?'+params.toString(),{},20000,0)}
};
