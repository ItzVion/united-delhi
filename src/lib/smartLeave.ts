export type ArrivalSource = 'live-data-estimate' | 'live-position-no-speed';
export interface Arrival { vehicleId: string; routeId: string | null; distanceMeters: number; etaSeconds: number | null; source: ArrivalSource; observedAgeSeconds: number; confidence: 'low' | 'medium'; }
export interface SmartLeaveResult {
  status: 'leave-now' | 'leave-in' | 'insufficient-data';
  leaveInSeconds: number | null; arrivalEtaSeconds: number | null; walkingSeconds: number; safetyBufferSeconds: number;
  source: ArrivalSource | 'none'; confidence: 'low' | 'medium' | 'none'; usedVehicleId: string | null; explanation: string;
}
const DEFAULT_SAFETY_BUFFER_SECONDS = 180;
export function computeSmartLeave(arrivals: Arrival[], walkToStopSeconds: number, safetyBufferSeconds = DEFAULT_SAFETY_BUFFER_SECONDS): SmartLeaveResult {
  const usable = arrivals.filter(a => a.etaSeconds !== null && a.source === 'live-data-estimate').sort((a,b) => (a.etaSeconds as number)-(b.etaSeconds as number));
  if (usable.length === 0) return {
    status:'insufficient-data', leaveInSeconds:null, arrivalEtaSeconds:null, walkingSeconds:walkToStopSeconds, safetyBufferSeconds,
    source:'none', confidence:'none', usedVehicleId:null,
    explanation: arrivals.length > 0 ? 'Buses are visible nearby but their live speed is not reliable enough to estimate an arrival time.' : 'No live buses are currently reporting toward this stop on its routes.'
  };
  const chosen = usable[0], etaSeconds = chosen.etaSeconds as number, leaveInSeconds = etaSeconds - walkToStopSeconds - safetyBufferSeconds;
  return {
    status: leaveInSeconds <= 0 ? 'leave-now' : 'leave-in', leaveInSeconds: Math.max(0, leaveInSeconds), arrivalEtaSeconds:etaSeconds,
    walkingSeconds:walkToStopSeconds, safetyBufferSeconds, source:chosen.source, confidence:chosen.confidence, usedVehicleId:chosen.vehicleId,
    explanation: leaveInSeconds <= 0 ? 'Based on the nearest live bus, you should leave now to make it with your safety buffer.' : 'Based on the nearest live bus position and speed, plus your walk time and safety buffer.'
  };
}