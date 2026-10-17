export const DEFAULT_OTD_REALTIME_URL='https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb';
export const DEFAULT_TRANSPORT_STACK_REALTIME_URL='https://dts-backend.transportstack.in/api/dataset/otd/get-file?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb';

// OTD is preferred whenever its key is configured. Never pass its query-string key
// as a header, and reject redirects so the private key cannot be forwarded elsewhere.
export function createRealtimeRequest({
  otdApiKey='',
  otdUrl=DEFAULT_OTD_REALTIME_URL,
  transportStackApiKey='',
  transportStackUrl=DEFAULT_TRANSPORT_STACK_REALTIME_URL
}={}){
  const otdKey=String(otdApiKey??'').trim();
  if(otdKey){
    const url=new URL(String(otdUrl||DEFAULT_OTD_REALTIME_URL));
    url.searchParams.set('key',otdKey);
    return{
      provider:'OTD',
      source:'otd-live',
      url,
      headers:{accept:'*/*','user-agent':'United-Delhi/2.0'},
      redirect:'error'
    };
  }
  const legacyKey=String(transportStackApiKey??'').trim();
  if(!legacyKey)throw new Error('OTD_API_KEY is not configured (preferred); TRANSPORT_STACK_API_KEY fallback is also absent');
  return{
    provider:'Transport Stack',
    source:'transport-stack-live',
    url:new URL(String(transportStackUrl||DEFAULT_TRANSPORT_STACK_REALTIME_URL)),
    headers:{'x-api-key':legacyKey,accept:'*/*','user-agent':'United-Delhi/2.0'},
    redirect:'follow'
  };
}
