export type RootStackParamList = {
  Home: undefined;
  Search: undefined;
  StopDetails: { stopId: string; stopName?: string };
  RouteDetails: { routeId: string; label?: string };
};