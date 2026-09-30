export const API='https://united-delhi.wasmer.app';

async function request<T>(path:string,init:RequestInit={}):Promise<T>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),10000);
  try{
    const r=await fetch(API+path,{...init,signal:controller.signal,headers:{Accept:'application/json',...(init.headers??{})}});
    const text=await r.text();
    let d:any={};
    try{d=text?JSON.parse(text):{};}catch{d={reason:text.slice(0,160)};}
    if(!r.ok)throw new Error(d.reason||`Request failed with undefined`);
    return d as T;
  }catch(error){
    if((error as Error)?.name==='AbortError')throw new Error('Request timed out');
    throw error instanceof Error?error:new Error('Network error');
  }finally{window.clearTimeout(timer);}
}

export type Vehicle={
  id:string;
  routeId:string|null;
  routeShortName:string|null;
  routeColor?:string|null;
  routeTextColor?:string|null;
  fromStop?:string|null;
  toStop?:string|null;
  serviceType?:'dtc'|'cluster'|'electric'|'unknown';
  serviceColor?:string|null;
  latitude:number;
  longitude:number;
  observedAt?:string;
};

export const api={
  vehicles:()=>request<{status:string;count:number;vehicles:Vehicle[];reason?:string;fetchedAt?:string;stale?:boolean}>('/api/realtime/vehicles'),
  search:(q:string)=>request<{status:string;results:any[]}>(`/api/search?q=${encodeURIComponent(q)}`),
  route:(id:string)=>request<any>(`/api/routes/${encodeURIComponent(id)}`),
  stop:(id:string)=>Promise.all([
    request<any>(`/api/stops/${encodeURIComponent(id)}`),
    request<any>(`/api/stops/${encodeURIComponent(id)}/arrivals`)
  ]),
  nearby:(lat:number,lon:number)=>request<any>('/api/stops/nearby',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lon,limit:30})}),
  plan:(from:string,to:string)=>request<any>(`/api/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
};