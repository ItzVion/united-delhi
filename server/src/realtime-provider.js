export const DEFAULT_TRANSPORT_STACK_REALTIME_URL='https://dts-backend.transportstack.in/api/dataset/otd/get-file?agency=delhi-buses&category=realtime_gtfs&filename=VehiclePositions.pb';

/**
 * United Delhi uses Transport Stack only for live bus positions.
 * The credential is read from the backend environment and sent in x-api-key.
 */
export function createRealtimeRequest({
  transportStackApiKey='',
  transportStackUrl=DEFAULT_TRANSPORT_STACK_REALTIME_URL
}={}){
  const key=String(transportStackApiKey??'').trim();
  if(!key)throw new Error('TRANSPORT_STACK_API_KEY is not configured');
  const url=new URL(String(transportStackUrl||DEFAULT_TRANSPORT_STACK_REALTIME_URL));
  if(url.protocol!=='https:'||url.hostname!=='dts-backend.transportstack.in'){
    throw new Error('Transport Stack realtime URL must use the approved HTTPS host');
  }
  return {
    provider:'Transport Stack',
    source:'transport-stack-live',
    url,
    headers:{'x-api-key':key,accept:'*/*','user-agent':'United-Delhi/2.1'},
    redirect:'error'
  };
}
