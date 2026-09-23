import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Route as ApiRoute, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'RouteDetails'>;
type RouteDetailsRoute = RouteProp<RootStackParamList, 'RouteDetails'>;

type MapPoint = { id: string; name: string; lat: number; lon: number };
type BusPoint = { id: string; route: string | null; lat: number; lon: number };

function buildRouteMapHtml(stops: Stop[], vehicles: Vehicle[]) {
  const stopData: MapPoint[] = stops.map(s => ({ id: s.stop_id, name: s.name, lat: s.latitude, lon: s.longitude }));
  const busData: BusPoint[] = vehicles.map(v => ({ id: v.id, route: v.routeId, lat: v.latitude, lon: v.longitude }));
  const fallback = stopData[0] || { lat: 28.6139, lon: 77.209 };
  const encodedStops = JSON.stringify(stopData).replace(/</g, '\\u003c');
  const encodedBuses = JSON.stringify(busData).replace(/</g, '\\u003c');

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{margin:0;width:100%;height:100%;background:#e8eef2}.bus{font-size:18px}.leaflet-popup-content{font-family:system-ui,sans-serif}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
  const stops=${encodedStops}; const buses=${encodedBuses};
  const map=L.map('map',{zoomControl:true}).setView([${fallback.lat},${fallback.lon}],14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  const line=stops.map(s=>[s.lat,s.lon]);
  if(line.length>1){L.polyline(line,{color:'${colors.accent}',weight:4}).addTo(map);}
  stops.forEach(s=>L.circleMarker([s.lat,s.lon],{radius:6,color:'${colors.warning}',fillColor:'${colors.warning}',fillOpacity:1}).addTo(map).bindPopup('<b>'+escapeHtml(s.name)+'</b><br><button onclick="openStop(\\''+s.id+'\\')">View stop</button>'));
  buses.forEach(v=>L.marker([v.lat,v.lon],{icon:L.divIcon({className:'bus',html:'🚌',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(map).bindPopup((v.route?'Route '+escapeHtml(v.route):'Live bus')));
  if(line.length>1){map.fitBounds(line,{padding:[20,20]});}
  function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}
  function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  </script></body></html>`;
}

export default function RouteDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteDetailsRoute>();
  const { routeId, label } = params;
  const webViewRef = useRef<WebView | null>(null);
  const [route, setRoute] = useState<ApiRoute | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.route(routeId);
      if (result.status === 'OK') {
        setRoute(result.route);
        setStops(result.stops);
        setVehicles(result.vehicles);
        setError(null);
      } else {
        setError('Route details are unavailable.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const mapHtml = useMemo(() => buildRouteMapHtml(stops, vehicles), [stops, vehicles]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>Back</Text></Pressable>
        <Text style={styles.title}>{route?.short_name || label || routeId}</Text>
        {route?.long_name ? <Text style={styles.subtitle}>{route.long_name}</Text> : null}
        <StatusPill label={error ? 'Unavailable' : `${vehicles.length} live vehicles`} tone={error ? 'danger' : vehicles.length > 0 ? 'ok' : 'muted'} />
      </View>
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {stops.length > 0 ? (
        <View style={styles.mapWrap}>
          <WebView
            ref={webViewRef}
            style={styles.map}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            source={{ html: mapHtml }}
            onMessage={(event) => {
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.type === 'stop') {
                  const stop = stops.find(s => s.stop_id === message.stopId);
                  if (stop) navigation.navigate('StopDetails', { stopId: stop.stop_id, stopName: stop.name });
                }
              } catch {}
            }}
          />
          <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text></View>
        </View>
      ) : null}
      <FlatList
        data={stops}
        keyExtractor={item => item.stop_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.listTitle}>Stops in order</Text>}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No stops found for this route.</Text> : null}
        renderItem={({ item, index }) => (
          <Pressable style={styles.stopRow} onPress={() => navigation.navigate('StopDetails', { stopId: item.stop_id, stopName: item.name })}>
            <Text style={styles.stopIndex}>{index + 1}</Text>
            <Text style={styles.stopName}>{item.name}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},header:{paddingHorizontal:20,paddingTop:12,gap:6},back:{color:colors.accent,fontSize:15,fontWeight:'600'},title:{color:colors.text,fontSize:26,fontWeight:'800'},subtitle:{color:colors.textMuted,fontSize:14},errorText:{color:colors.danger,marginHorizontal:20,marginTop:8,fontSize:13},mapWrap:{marginTop:14,marginHorizontal:20,height:220,borderRadius:18,overflow:'hidden'},map:{flex:1},mapAttribution:{position:'absolute',right:8,bottom:6,backgroundColor:'rgba(255,255,255,0.85)',paddingHorizontal:6,paddingVertical:2,borderRadius:4},mapAttributionText:{color:'#333',fontSize:9},list:{paddingHorizontal:20,paddingTop:16,paddingBottom:24},listTitle:{color:colors.text,fontSize:16,fontWeight:'700',marginBottom:8},emptyText:{color:colors.textMuted,fontSize:14,marginBottom:10},stopRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:colors.surface,borderRadius:12,padding:12,marginBottom:8},stopIndex:{color:colors.accent,fontWeight:'800',width:22},stopName:{color:colors.text,fontSize:14,flexShrink:1}
});
