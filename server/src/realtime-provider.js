export const DEFAULT_OTD_REALTIME_URL='https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb';

/**
 * Delhi OTD publishes GTFS-Realtime VehiclePositions as protobuf.
 * Authorised access uses the OTD private key in the documented "key" query parameter.
 * Keep this helper backend-only; never expose the resulting URL to a client or log it.
 */
export function createRealtimeRequest({otdApiKey=''}={}){
  const key=String(otdApiKey??'').trim();
  if(!key)throw new Error('OTD_API_KEY is not configured');
  const url=new URL(DEFAULT_OTD_REALTIME_URL);
  if(url.protocol!=='https:'||url.hostname!=='otd.delhi.gov.in'||url.pathname!=='/api/realtime/VehiclePositions.pb'){
    throw new Error('Delhi OTD realtime endpoint is not the approved HTTPS endpoint');
  }
  url.searchParams.set('key',key);
  return {
    provider:'Delhi OTD',
    source:'otd-live',
    url,
    headers:{accept:'application/x-protobuf, application/octet-stream','user-agent':'United-Delhi/2.2'},
    redirect:'error'
  };
}
