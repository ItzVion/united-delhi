const numeric = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
export const plannerPayloadRows = payload =>
  Array.isArray(payload) ? payload :
  Array.isArray(payload?.data) ? payload.data :
  Array.isArray(payload?.stops) ? payload.stops :
  Array.isArray(payload?.results) ? payload.results : [];
export function plannerText(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(plannerText).filter(Boolean).join(' / ');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return String(value.name || value.stop_name || value.location_name || value.label || value.stopName || value.value || value.stop_id || value.id || '');
}
const stopIdOf = stop => {
  const id = stop?.stop_id ?? stop?.id ?? stop?.stopId ?? stop?.stop_code ?? stop?.stopCode;
  return id === null || id === undefined || String(id).trim() === '' ? null : String(id).trim();
};
const stopNameOf = stop => plannerText(stop?.stop_name || stop?.name || stop?.label || stop?.stopName || stop);
const routeStopsOf = segment => Array.isArray(segment?.stops) ? segment.stops : Array.isArray(segment?.stop_list) ? segment.stop_list : Array.isArray(segment?.stopList) ? segment.stopList : [];
export function normaliseTransportPlannerStop(stop, mode) {
  const id = stopIdOf(stop), name = stopNameOf(stop).trim();
  if (!id || !name) return null;
  const geometry = stop?.geometry;
  let latitude = numeric(stop?.latitude ?? stop?.lat ?? stop?.stop_lat ?? geometry?.latitude);
  let longitude = numeric(stop?.longitude ?? stop?.lon ?? stop?.lng ?? stop?.stop_lon ?? geometry?.longitude);
  if ((latitude === null || longitude === null) && Array.isArray(geometry?.coordinates) && geometry.coordinates.length >= 2) {
    longitude = numeric(geometry.coordinates[0]); latitude = numeric(geometry.coordinates[1]);
  } else if ((latitude === null || longitude === null) && Array.isArray(geometry) && geometry.length >= 2) {
    latitude = numeric(geometry[0]); longitude = numeric(geometry[1]);
  }
  return {stop_id:id,id,name,label:name,latitude,longitude,stop_code:stop?.stop_code ?? stop?.stopCode ?? null,mode,source_name:stop?.source_name ?? null};
}
export const plannerModeOf = value => {
  const mode = String(value ?? '').toLowerCase();
  if (mode.includes('walk')) return 'walk';
  if (mode.includes('metro') || mode.includes('rail') || mode === 'train') return 'metro';
  if (mode.includes('bus') || mode.includes('dtc') || mode.includes('electric')) return 'bus';
  return null;
};
export function plannerTimeMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  const raw = String(value ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) { const parsed = Number(raw); return parsed > 0 ? Math.round(parsed) : null; }
  const match = raw.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (match) { const minutes = Number(match[1])*60 + Number(match[2]) + Number(match[3]||0)/60; return minutes > 0 ? Math.ceil(minutes) : null; }
  return null;
}
const firstText = values => { for (const value of values) { const text=plannerText(value).trim(); if(text)return text; } return ''; };
const firstValue = values => values.find(value => value !== null && value !== undefined && String(value).trim() !== '') ?? null;
const safeColour = value => { const raw=String(value??'').trim(); if(!/^#?[0-9a-f]{6}$/i.test(raw))return null; return raw.startsWith('#')?raw:'#'+raw; };
export function normaliseTransportPlannerTrip(row, context, index) {
  // Provider v2 returns data[].directions.routes[], not data[].routes[].
  const rawSegments = Array.isArray(row?.legs) ? row.legs : Array.isArray(row?.directions?.routes) ? row.directions.routes : Array.isArray(row?.routes) ? row.routes : [];
  if (!rawSegments.length) return null;
  const topStops=Array.isArray(row?.stops)?row.stops:[];
  const firstSegmentStops=routeStopsOf(rawSegments[0]), lastSegmentStops=routeStopsOf(rawSegments[rawSegments.length-1]);
  const firstStop=firstText([topStops[0],firstSegmentStops[0],row?.origin?.name,context.fromName])||'Origin';
  const lastStop=firstText([topStops[topStops.length-1],lastSegmentStops[lastSegmentStops.length-1],row?.destination?.name,context.toName])||'Destination';
  const globalMode=plannerModeOf(row?.mode)||(context.fromType==='metro'&&context.toType==='metro'?'metro':'bus');
  const legs=rawSegments.map((segment,segmentIndex)=>{
    const entry=segment&&typeof segment==='object'?segment:{routeName:String(segment??'')};
    const stops=routeStopsOf(entry),firstSegmentStop=stops[0],lastSegmentStop=stops[stops.length-1];
    const mode=plannerModeOf(entry.mode||entry.type||entry.edge_type||entry.stop_type||entry.vehicle_type)||globalMode;
    const fromStop=firstValue([entry.fromStop,entry.from_stop,entry.parent_info?.name,entry.parent_info,entry.from,entry.source,firstSegmentStop]);
    const toStop=firstValue([entry.toStop,entry.to_stop,entry.child_info?.name,entry.child_info,entry.to,entry.destination,lastSegmentStop]);
    const routeLabels=Array.isArray(entry.routes)?entry.routes.filter(Boolean).join(' / '):entry.routes;
    const routeId=firstValue([entry.route_id,entry.routeId,entry.id,entry.route,Array.isArray(entry.routes)?entry.routes[0]:routeLabels]);
    const routeName=firstText([entry.short_name,entry.route_name,entry.routeName,entry.line_name,entry.long_name,entry.longName,routeLabels,entry.route,routeId,entry.name])||(mode==='metro'?'Metro':mode==='walk'?'Walk':'Bus');
    const walkingMinutes=mode==='walk'?plannerTimeMinutes(entry.walkingMinutes??entry.trip_time??entry.durationMinutes??entry.travel_time):null;
    const walkMeters=mode==='walk'?numeric(entry.walkMeters??entry.walk_meters??entry.distance):null;
    return {mode:mode||'bus',routeId:routeId===null?null:String(routeId),routeName,
      routeLongName:firstText([entry.long_name,entry.longName])||null,
      routeColor:safeColour(entry.route_color||entry.routeColor||entry.color),
      routeTextColor:safeColour(entry.route_text_color||entry.routeTextColor),
      fromStop:firstText([fromStop])||(segmentIndex===0?firstStop:'Transfer'),
      toStop:firstText([toStop])||(segmentIndex===rawSegments.length-1?lastStop:'Transfer'),
      fromStopId:firstValue([entry.fromStopId,entry.from_stop_id,stopIdOf(firstSegmentStop)])||null,
      toStopId:firstValue([entry.toStopId,entry.to_stop_id,stopIdOf(lastSegmentStop)])||null,
      walkingMinutes,walkMeters};
  }).filter(leg=>leg.routeName||leg.fromStop||leg.toStop);
  if(!legs.length)return null;
  if(!legs[0].fromStop||legs[0].fromStop==='Transfer')legs[0].fromStop=context.fromName||firstStop;
  if(!legs[legs.length-1].toStop||legs[legs.length-1].toStop==='Transfer')legs[legs.length-1].toStop=context.toName||lastStop;
  if(!legs[0].fromStopId)legs[0].fromStopId=context.fromStopId||null;
  if(!legs[legs.length-1].toStopId)legs[legs.length-1].toStopId=context.toStopId||null;
  const modes=new Set(legs.map(leg=>leg.mode));
  const journeyMode=modes.has('bus')&&modes.has('metro')?'mixed':modes.has('metro')?'metro':'bus';
  const durationMinutes=plannerTimeMinutes(row?.trip_time??row?.durationMinutes??row?.duration??row?.travel_time);
  const walkingMinutes=legs.filter(leg=>leg.mode==='walk').reduce((sum,leg)=>sum+(leg.walkingMinutes||1),0);
  const sourceType=String(row?.type??row?.journey_type??'').toLowerCase();
  const transitLegs=legs.filter(leg=>leg.mode==='bus'||leg.mode==='metro').length;
  const type=sourceType.includes('direct')?'direct':sourceType.includes('transfer')?'transfer':journeyMode==='metro'?'metro':transitLegs>1?'transfer':'direct';
  return {type,journeyMode,durationMinutes:durationMinutes||Math.max(10,legs.length*12),durationIsEstimate:!durationMinutes,walkingMinutes:walkingMinutes||null,legs,transferStop:plannerText(row?.transfer_stop||row?.transferStop)||null,fare:row?.total_fare??row?.fare??null,description:plannerText(row?.route_description||row?.description)||null,provider:'transport-stack',providerIndex:index};
}
