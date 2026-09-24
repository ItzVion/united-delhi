export type RootStackParamList = {
  Home: undefined;
  Search: undefined;
  Planner: undefined;
  StopDetails: { stopId: string; stopName?: string };
  RouteDetails: { routeId: string; label?: string };
};