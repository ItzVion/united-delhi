import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
const DELHI_REGION: Region = { latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.15, longitudeDelta: 0.15 };

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<WebView | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationStatus, setLocationStatus] = useState('Finding your location…');
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesFreshness, setVehiclesFreshness] = useState<'loading' | 'ok' | 'unavailable'>('loading');
  const [loadingNearby, setLoadingNearby] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const requestLocation = useCallback(async () => {
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      const permission = existing.status === 'granted'
        ? existing
        : await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationStatus('Location is off. Showing Delhi.');
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 2000 });
      if (lastKnown) {
        setLocation(lastKnown);
        setLocationStatus('');
      }

      try {
        const current = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);
        setLocation(current);
        setLocationStatus('');
      } catch {
        if (!lastKnown) setLocationStatus('Could not get GPS. Showing Delhi.');
      }
    } catch {
      setLocationStatus('Location unavailable. Showing Delhi.');
    }
  }, []);

  const loadNearbyStops = useCallback(async (lat: number, lon: number) => {
    setLoadingNearby(true);
    try {
      const result = await api.nearbyStops(lat, lon, 8);
      setNearbyStops(result.status === 'OK' ? result.stops : []);
    } catch {
      setNearbyStops([]);
    } finally {
      setLoadingNearby(false);
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    try {
      const result = await api.vehicles();
      if (result.status === 'OK') {
        setVehicles(result.vehicles);
        setVehiclesFreshness('ok');
      } else {
        setVehiclesFreshness('unavailable');
      }
    } catch {
      setVehiclesFreshness('unavailable');
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if (location) loadNearbyStops(location.coords.latitude, location.coords.longitude);
  }, [location, loadNearbyStops]);

  useEffect(() => {
    loadVehicles();
    const interval = setInterval(loadVehicles, 30000);
    return () => clearInterval(interval);
  }, [loadVehicles]);

  useEffect(() => {
    if (!mapReady) return;
    const payload = {
      center: {
        lat: location?.coords.latitude ?? DELHI_REGION.latitude,
        lon: location?.coords.longitude ?? DELHI_REGION.longitude
      },
      stops: nearbyStops.map(s => ({ id: s.stop_id, name: s.name, lat: s.latitude, lon: s.longitude })),
      buses: [...vehicles]
        .sort((a, b) => {
          const centerLat = location?.coords.latitude ?? DELHI_REGION.latitude;
          const centerLon = location?.coords.longitude ?? DELHI_REGION.longitude;
          const distance = (v: Vehicle) => {
            const dLat = v.latitude - centerLat;
            const dLon = (v.longitude - centerLon) * Math.cos(centerLat * Math.PI / 180);
            return dLat * dLat + dLon * dLon;
          };
          return distance(a) - distance(b);
        })
        .slice(0, 250)
        .map(v => ({ id: v.id, route: v.routeShortName || v.routeId, lat: v.latitude, lon: v.longitude })),
      location: location ? { lat: location.coords.latitude, lon: location.coords.longitude } : null
    };
    mapRef.current?.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
  }, [mapReady, location, nearbyStops, vehicles]);

  const freshnessLabel = vehiclesFreshness === 'ok'
    ? `${vehicles.length} live buses`
    : vehiclesFreshness === 'loading'
      ? 'Loading live buses'
      : 'Live buses unavailable';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>UNITED DELHI</Text>
          <Text style={styles.tagline}>Move better around Delhi</Text>
        </View>
        <StatusPill label={freshnessLabel} tone={vehiclesFreshness === 'ok' ? 'ok' : vehiclesFreshness === 'unavailable' ? 'danger' : 'muted'} />
      </View>

      <Pressable style={styles.searchBar} onPress={() => navigation.navigate('Search')}>
        <Text style={styles.searchIcon}>⌕</Text>
        <Text style={styles.searchPlaceholder}>Search routes, stops or places</Text>
      </Pressable>

      <View style={styles.helperRow}>
        <Text style={styles.helperText}>Live buses near you</Text>
        <Pressable onPress={requestLocation}><Text style={styles.locationLink}>Use my location</Text></Pressable>
      </View>

      <View style={styles.mapWrap}>
        <WebView
          ref={mapRef}
          style={styles.map}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          source={{ html: buildMapHtml() }}
          onLoadEnd={() => setMapReady(true)}
          onMessage={(event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data);
              if (message.type === 'stop') {
                const stop = nearbyStops.find(s => s.stop_id === message.stopId);
                if (stop) navigation.navigate('StopDetails', { stopId: stop.stop_id, stopName: stop.name });
              }
            } catch {}
          }}
        />
        <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap</Text></View>
        <View style={styles.mapBadge}><Text style={styles.mapBadgeText}>{vehicles.length > 0 ? `${Math.min(vehicles.length, 250)} buses on map` : 'No live buses yet'}</Text></View>
        {locationStatus ? (
          <Pressable style={styles.locationNotice} onPress={requestLocation}>
            <Text style={styles.locationNoticeText}>{locationStatus}</Text>
            <Text style={styles.locationRetry}>Retry</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={() => navigation.navigate('Search')}>
          <Text style={styles.actionIcon}>⌕</Text>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Find a route</Text>
            <Text style={styles.actionSub}>Search buses and stops</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, (!location || loadingNearby) && styles.actionButtonDisabled]}
          onPress={() => location && loadNearbyStops(location.coords.latitude, location.coords.longitude)}
          disabled={!location || loadingNearby}
        >
          <Text style={[styles.actionIcon, { color: colors.success }]}>●</Text>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Nearby stops</Text>
            <Text style={styles.actionSub}>Stops around you</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Nearby stops</Text>
        {loadingNearby ? <ActivityIndicator color={colors.accent} size="small" /> : null}
      </View>
      <FlatList
        data={nearbyStops}
        keyExtractor={item => item.stop_id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!loadingNearby ? <Text style={styles.emptyText}>No nearby stops found.</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.stopCard} onPress={() => navigation.navigate('StopDetails', { stopId: item.stop_id, stopName: item.name })}>
            <View style={styles.stopPin}><Text style={styles.stopPinText}>●</Text></View>
            <View style={styles.stopInfo}>
              <Text style={styles.stopName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.stopDistance}>{item.distance_m !== undefined ? `${Math.round(item.distance_m)} m away` : 'Nearby'}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function buildMapHtml() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>html,body,#map{margin:0;width:100%;height:100%;background:#eef2f6} .leaflet-control-zoom{border:0!important;box-shadow:0 2px 10px rgba(20,32,51,.14)!important}.leaflet-control-zoom a{border:0!important;color:#142033!important}.stop-label{font:700 11px system-ui,sans-serif;color:#142033;background:#fff;border:1px solid #e1e7ef;border-radius:10px;padding:4px 7px;box-shadow:0 2px 7px rgba(20,32,51,.12)}.bus-label{font:800 11px system-ui,sans-serif;color:#fff;background:#1769e0;border-radius:8px;padding:3px 6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(20,32,51,.18)}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>
const map=L.map('map',{preferCanvas:true,zoomControl:true,attributionControl:false,zoomSnap:.5}).setView([28.6139,77.209],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);
const stopLayer=L.layerGroup().addTo(map); const busLayer=L.layerGroup().addTo(map); let userLayer=L.layerGroup().addTo(map); let hasCentered=false;
window.updateMap=function(data){
  stopLayer.clearLayers(); busLayer.clearLayers(); userLayer.clearLayers();
  const stopIcon=L.divIcon({className:'',html:'<div class="stop-label">● Stop</div>',iconSize:[55,24],iconAnchor:[8,12]});
  data.stops.forEach(s=>{
    const popup=document.createElement('div');
    const title=document.createElement('b');
    title.textContent=s.name;
    const button=document.createElement('button');
    button.type='button';
    button.textContent='View stop';
    button.style.marginTop='6px';
    button.addEventListener('click',()=>openStop(s.id));
    popup.append(title,document.createElement('br'),button);
    L.marker([s.lat,s.lon],{icon:stopIcon}).addTo(stopLayer).bindPopup(popup);
  });
  data.buses.forEach(v=>L.marker([v.lat,v.lon],{icon:L.divIcon({className:'',html:'<div class="bus-label">'+escapeHtml(v.route||'BUS')+'</div>',iconSize:[52,24],iconAnchor:[26,12]})}).addTo(busLayer).bindPopup(escapeHtml(v.route||'Live bus')));
  if(data.location){L.circleMarker([data.location.lat,data.location.lon],{radius:8,color:'#1769e0',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(userLayer); if(!hasCentered){map.setView([data.location.lat,data.location.lon],14);hasCentered=true;}}
};
function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
</script></body></html>`;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  header:{paddingHorizontal:20,paddingTop:10,paddingBottom:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  brand:{fontSize:23,fontWeight:'900',letterSpacing:1,color:colors.text},tagline:{fontSize:12,color:colors.textMuted,marginTop:2},
  searchBar:{marginHorizontal:20,marginTop:12,height:52,borderRadius:17,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',paddingHorizontal:15},
  searchIcon:{fontSize:27,color:colors.text,marginRight:8,marginTop:-3},searchPlaceholder:{fontSize:15,color:colors.textMuted},
  helperRow:{paddingHorizontal:20,paddingTop:10,paddingBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},helperText:{fontSize:13,color:colors.textMuted,fontWeight:'600'},locationLink:{fontSize:13,color:colors.accent,fontWeight:'800'},
  mapWrap:{marginHorizontal:16,height:315,borderRadius:20,overflow:'hidden',backgroundColor:'#eef2f6',borderWidth:1,borderColor:colors.border},map:{flex:1},
  mapAttribution:{position:'absolute',right:8,bottom:7,backgroundColor:'rgba(255,255,255,.9)',paddingHorizontal:6,paddingVertical:2,borderRadius:4},mapAttributionText:{fontSize:8,color:'#4a5568'},mapBadge:{position:'absolute',left:10,top:10,backgroundColor:'rgba(255,255,255,.95)',paddingHorizontal:9,paddingVertical:6,borderRadius:10},mapBadgeText:{fontSize:11,fontWeight:'700',color:colors.text},locationNotice:{position:'absolute',left:12,right:12,bottom:12,backgroundColor:'#fff',borderRadius:12,padding:10,borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-between'},locationNoticeText:{color:colors.textMuted,fontSize:12},locationRetry:{color:colors.accent,fontWeight:'800',fontSize:12},
  sectionHeader:{paddingHorizontal:20,paddingTop:16,paddingBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionTitle:{fontSize:19,fontWeight:'800',color:colors.text},
  actionRow:{paddingHorizontal:20,paddingTop:4,gap:8},actionButtonDisabled:{opacity:0.55},actionButton:{minHeight:64,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,paddingHorizontal:13,flexDirection:'row',alignItems:'center'},actionIcon:{fontSize:20,color:colors.accent,fontWeight:'900',width:30,textAlign:'center'},actionCopy:{flex:1,marginLeft:7},actionTitle:{fontSize:14,fontWeight:'800',color:colors.text},actionSub:{fontSize:11,color:colors.textMuted,marginTop:2},actionArrow:{fontSize:25,color:colors.textMuted},
  list:{paddingHorizontal:20,paddingBottom:30},stopCard:{backgroundColor:colors.surface,borderRadius:15,borderWidth:1,borderColor:colors.border,padding:12,marginBottom:8,flexDirection:'row',alignItems:'center'},stopPin:{width:34,height:34,borderRadius:17,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},stopPinText:{color:colors.accent,fontSize:13},stopInfo:{flex:1,marginLeft:10},stopName:{fontSize:14,fontWeight:'800',color:colors.text},stopDistance:{fontSize:12,color:colors.textMuted,marginTop:2},chevron:{fontSize:26,color:colors.textMuted,marginLeft:8},emptyText:{color:colors.textMuted,fontSize:13,paddingBottom:20}
});