import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Route as ApiRoute, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'RouteDetails'>;
type RouteDetailsRoute = RouteProp<RootStackParamList, 'RouteDetails'>;

export default function RouteDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteDetailsRoute>();
  const { routeId, label } = params;
  const mapRef = useRef<WebView | null>(null);
  const [route, setRoute] = useState<ApiRoute | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
    setLoading(true);
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!mapReady) return;
    const payload = {
      stops: stops.map(s => ({ id: s.stop_id, name: s.name, lat: s.latitude, lon: s.longitude })),
      buses: vehicles.map(v => ({ id: v.id, route: v.routeShortName || v.routeId, lat: v.latitude, lon: v.longitude }))
    };
    mapRef.current?.injectJavaScript(`window.updateRouteMap(${JSON.stringify(payload)}); true;`);
  }, [mapReady, stops, vehicles]);

  const routeName = route?.short_name || label || routeId;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
        <View style={styles.topTitle}><Text style={styles.eyebrow}>BUS ROUTE</Text><Text style={styles.title}>{routeName}</Text><Text style={styles.subtitle} numberOfLines={1}>{route?.long_name || 'Delhi Transit Network'}</Text></View>
        <StatusPill label={error ? 'Unavailable' : `${vehicles.length} live`} tone={error ? 'danger' : vehicles.length ? 'ok' : 'muted'} />
      </View>

      <View style={styles.tabs}>
        <View style={[styles.tab, styles.tabActive]}><Text style={styles.tabActiveText}>Overview</Text></View>
        <View style={styles.tab}><Text style={styles.tabText}>Stops {stops.length ? `· ${stops.length}` : ''}</Text></View>
        <View style={styles.tab}><Text style={styles.tabText}>Live buses</Text></View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.mapWrap}>
        <WebView
          ref={mapRef}
          style={styles.map}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          source={{ html: buildRouteMapHtml() }}
          onLoadEnd={() => setMapReady(true)}
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
        <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap</Text></View>
      </View>

      <View style={styles.summary}>
        <View><Text style={styles.summaryValue}>{stops.length}</Text><Text style={styles.summaryLabel}>stops</Text></View>
        <View><Text style={styles.summaryValue}>{vehicles.length}</Text><Text style={styles.summaryLabel}>live buses</Text></View>
        <View><Text style={styles.summaryValue}>{route?.long_name ? 'DTC' : '—'}</Text><Text style={styles.summaryLabel}>service</Text></View>
      </View>

      <FlatList
        data={stops}
        keyExtractor={item => item.stop_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Stops in order</Text>
            <Text style={styles.listHint}>Tap a stop for live arrivals</Text>
          </View>
        }
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No stops found for this route.</Text> : <ActivityIndicator color={colors.accent} />}
        renderItem={({ item, index }) => (
          <Pressable style={styles.stopRow} onPress={() => navigation.navigate('StopDetails', { stopId: item.stop_id, stopName: item.name })}>
            <View style={styles.timeline}><View style={[styles.dot, index === 0 || index === stops.length - 1 ? styles.dotStrong : null]} />{index < stops.length - 1 ? <View style={styles.line} /> : null}</View>
            <View style={styles.stopInfo}><Text style={styles.stopIndex}>{index + 1}</Text><Text style={styles.stopName} numberOfLines={2}>{item.name}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function buildRouteMapHtml() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{margin:0;width:100%;height:100%;background:#eef2f6}.stop-label{font:800 10px system-ui,sans-serif;color:#142033;background:#fff;border:1px solid #e1e7ef;border-radius:9px;padding:3px 6px;box-shadow:0 2px 7px rgba(20,32,51,.12)}.bus-label{font:800 10px system-ui,sans-serif;color:#fff;background:#1769e0;border-radius:7px;padding:3px 5px;border:2px solid #fff}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
const map=L.map('map',{preferCanvas:true,zoomControl:true,attributionControl:false}).setView([28.6139,77.209],12.5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);
const lineLayer=L.layerGroup().addTo(map),stopLayer=L.layerGroup().addTo(map),busLayer=L.layerGroup().addTo(map);let fitted=false;
window.updateRouteMap=function(data){
 lineLayer.clearLayers();stopLayer.clearLayers();busLayer.clearLayers();
 const line=data.stops.map(s=>[s.lat,s.lon]);
 if(line.length>1)L.polyline(line,{color:'#1769e0',weight:5,opacity:.9,lineCap:'round'}).addTo(lineLayer);
 const stopIcon=L.divIcon({className:'',html:'<div class="stop-label">●</div>',iconSize:[22,22],iconAnchor:[11,11]});
 data.stops.forEach(s=>L.marker([s.lat,s.lon],{icon:stopIcon}).addTo(stopLayer).bindPopup('<b>'+escapeHtml(s.name)+'</b><br><button onclick="openStop(\\''+s.id+'\\')">View stop</button>'));
 data.buses.forEach(v=>L.marker([v.lat,v.lon],{icon:L.divIcon({className:'',html:'<div class="bus-label">'+escapeHtml(v.route||'BUS')+'</div>',iconSize:[50,22],iconAnchor:[25,11]})}).addTo(busLayer).bindPopup(escapeHtml(v.route||'Live bus')));
 if(line.length>1&&!fitted){map.fitBounds(line,{padding:[20,20]});fitted=true;}
};
function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
</script></body></html>`;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},topBar:{paddingHorizontal:18,paddingTop:10,paddingBottom:7,flexDirection:'row',alignItems:'center'},backButton:{width:42,height:42,alignItems:'center',justifyContent:'center'},back:{fontSize:36,lineHeight:38,color:colors.text},topTitle:{flex:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},title:{fontSize:22,fontWeight:'900',color:colors.text,marginTop:1},subtitle:{fontSize:11,color:colors.textMuted,marginTop:3},
  tabs:{marginHorizontal:18,marginBottom:8,padding:4,borderRadius:13,backgroundColor:colors.surfaceAlt,flexDirection:'row'},tab:{flex:1,paddingVertical:8,alignItems:'center',borderRadius:10},tabActive:{backgroundColor:colors.surface},tabText:{fontSize:11,fontWeight:'700',color:colors.textMuted},tabActiveText:{fontSize:11,fontWeight:'900',color:colors.accent},
  error:{color:colors.danger,fontSize:12,marginHorizontal:18,marginBottom:8},mapWrap:{marginHorizontal:16,height:245,borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:colors.border},map:{flex:1},mapAttribution:{position:'absolute',right:8,bottom:7,backgroundColor:'rgba(255,255,255,.9)',paddingHorizontal:6,paddingVertical:2,borderRadius:4},mapAttributionText:{fontSize:8,color:'#4a5568'},
  summary:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-around',alignItems:'center'},summaryValue:{fontSize:18,fontWeight:'900',color:colors.text,textAlign:'center'},summaryLabel:{fontSize:10,color:colors.textMuted,textAlign:'center',marginTop:2},
  list:{paddingHorizontal:18,paddingTop:12,paddingBottom:30},listHeader:{paddingBottom:8},listTitle:{fontSize:17,fontWeight:'900',color:colors.text},listHint:{fontSize:11,color:colors.textMuted,marginTop:2},empty:{color:colors.textMuted,paddingVertical:20},
  stopRow:{minHeight:58,flexDirection:'row',alignItems:'stretch'},timeline:{width:28,alignItems:'center'},dot:{width:10,height:10,borderRadius:5,backgroundColor:colors.surface,borderWidth:2,borderColor:colors.accent,marginTop:16},dotStrong:{width:13,height:13,borderRadius:7,backgroundColor:colors.accent},line:{width:2,flex:1,backgroundColor:colors.border,marginTop:2},stopInfo:{flex:1,paddingVertical:11,paddingLeft:3},stopIndex:{fontSize:9,color:colors.textMuted,fontWeight:'700'},stopName:{fontSize:14,color:colors.text,fontWeight:'800',marginTop:1},chevron:{fontSize:24,color:colors.textMuted,alignSelf:'center'}
});