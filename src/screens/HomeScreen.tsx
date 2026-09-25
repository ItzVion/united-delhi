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
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';
import { confirmLocationUse } from '../lib/locationConsent';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
type MapBounds = { south: number; west: number; north: number; east: number };
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
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [recenterNonce, setRecenterNonce] = useState(0);

  const requestLocation = useCallback(async () => {
    if (!(await confirmLocationUse())) {
      setLocationStatus('Location is off. Showing Delhi.');
      return;
    }
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      const permission = existing.status === 'granted'
        ? existing
        : await Promise.race([
            Location.requestForegroundPermissionsAsync(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('permission-timeout')), 10000)
            )
          ]);
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

  const handleUseMyLocation = useCallback(async () => {
    setRecenterNonce(value => value + 1);
    await requestLocation();
  }, [requestLocation]);

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
    if (location) {
      loadNearbyStops(location.coords.latitude, location.coords.longitude);
    } else if (locationStatus !== 'Finding your location…') {
      setLoadingNearby(false);
    }
  }, [location, locationStatus, loadNearbyStops]);

  useEffect(() => {
    loadVehicles();
    const interval = setInterval(loadVehicles, 30000);
    return () => clearInterval(interval);
  }, [loadVehicles]);

  useEffect(() => {
    if (!mapReady) return;
    const centerLat = mapBounds
      ? (mapBounds.south + mapBounds.north) / 2
      : (location?.coords.latitude ?? DELHI_REGION.latitude);
    const centerLon = mapBounds
      ? (mapBounds.west + mapBounds.east) / 2
      : (location?.coords.longitude ?? DELHI_REGION.longitude);

    const visibleVehicles = mapBounds
      ? vehicles.filter(v =>
          v.latitude >= mapBounds.south &&
          v.latitude <= mapBounds.north &&
          v.longitude >= mapBounds.west &&
          v.longitude <= mapBounds.east
        )
      : vehicles;

    const payload = {
      center: { lat: centerLat, lon: centerLon },
      stops: nearbyStops.map(s => ({ id: s.stop_id, name: s.name, lat: s.latitude, lon: s.longitude })),
      buses: [...visibleVehicles]
        .sort((a, b) => {
          const distance = (v: Vehicle) => {
            const dLat = v.latitude - centerLat;
            const dLon = (v.longitude - centerLon) * Math.cos(centerLat * Math.PI / 180);
            return dLat * dLat + dLon * dLon;
          };
          return distance(a) - distance(b);
        })
        .slice(0, 250)
        .map(v => { const route = displayRouteName(v.routeShortName) || 'BUS'; const color = resolveRouteColor(route, v.routeColor, v.routeTextColor); return { id: v.id, route, color: color.background, textColor: color.text, lat: v.latitude, lon: v.longitude }; }),
      location: location ? { lat: location.coords.latitude, lon: location.coords.longitude } : null
    };
    mapRef.current?.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
  }, [mapReady, mapBounds, location, nearbyStops, vehicles]);

  useEffect(() => {
    if (!mapReady || !location || recenterNonce === 0) return;
    mapRef.current?.injectJavaScript(`window.centerMap(${location.coords.latitude},${location.coords.longitude}); true;`);
  }, [mapReady, location, recenterNonce]);

  const freshnessLabel = vehiclesFreshness === 'ok'
    ? `${vehicles.length} live buses`
    : vehiclesFreshness === 'loading'
      ? 'Loading live buses'
      : 'Live buses unavailable';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <UnitedDelhiMark size={40} />
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>UNITED DELHI</Text>
            <Text style={styles.tagline}>Delhi, made simpler</Text>
          </View>
        </View>
        <StatusPill label={freshnessLabel} tone={vehiclesFreshness === 'ok' ? 'ok' : vehiclesFreshness === 'unavailable' ? 'danger' : 'muted'} />
      </View>

      <Pressable style={styles.searchBar} onPress={() => navigation.navigate('Search')}>
        <Text style={styles.searchIcon}>⌕</Text>
        <Text style={styles.searchPlaceholder}>Search routes, stops or places</Text>
      </Pressable>

      <View style={styles.helperRow}>
        <Text style={styles.helperText}>Live buses near you</Text>
        <Pressable onPress={handleUseMyLocation}><Text style={styles.locationLink}>Use my location</Text></Pressable>
      </View>

      <View style={styles.mapWrap}>
        <WebView
          ref={mapRef}
          style={styles.map}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          userAgent="UnitedDelhi/1.0 (+https://github.com/ItzVion/united-delhi)"
          source={{ html: buildMapHtml() }}
          onLoadEnd={() => setMapReady(true)}
          onMessage={(event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data);
              if (message.type === 'stop') {
                const stop = nearbyStops.find(s => s.stop_id === message.stopId);
                if (stop) navigation.navigate('StopDetails', { stopId: stop.stop_id, stopName: stop.name });
              } else if (message.type === 'bounds' && message.bounds) {
                const b = message.bounds;
                if (
                  Number.isFinite(b.south) &&
                  Number.isFinite(b.west) &&
                  Number.isFinite(b.north) &&
                  Number.isFinite(b.east)
                ) {
                  setMapBounds(b);
                }
              }
            } catch {}
          }}
        />
        <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text></View>
        <View style={styles.mapBadge}><Text style={styles.mapBadgeText}>{vehicles.length > 0 ? `${Math.min(vehicles.length, 250)} buses on map` : 'No live buses yet'}</Text></View>
        {locationStatus ? (
          <Pressable style={styles.locationNotice} onPress={handleUseMyLocation}>
            <Text style={styles.locationNoticeText}>{locationStatus}</Text>
            <Text style={styles.locationRetry}>Retry</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.actionTile} onPress={() => navigation.navigate('Search')}>
          <Text style={styles.actionTileIcon}>⌕</Text>
          <Text style={styles.actionTileTitle}>Search</Text>
          <Text style={styles.actionTileSub}>Routes & stops</Text>
        </Pressable>
        <Pressable style={styles.actionTile} onPress={() => navigation.navigate('Planner')}>
          <Text style={[styles.actionTileIcon, { color: colors.secondary }]}>↗</Text>
          <Text style={styles.actionTileTitle}>Plan trip</Text>
          <Text style={styles.actionTileSub}>Find a bus</Text>
        </Pressable>
        <Pressable
          style={[styles.actionTile, (!location || loadingNearby) && styles.actionButtonDisabled]}
          onPress={() => location && loadNearbyStops(location.coords.latitude, location.coords.longitude)}
          disabled={!location || loadingNearby}
        >
          <Text style={[styles.actionTileIcon, { color: colors.success }]}>●</Text>
          <Text style={styles.actionTileTitle}>Nearby</Text>
          <Text style={styles.actionTileSub}>Stops around you</Text>
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
        ListFooterComponent={<Pressable style={styles.legalLink} onPress={() => navigation.navigate('Legal')}><Text style={styles.legalLinkText}>Legal & privacy</Text></Pressable>}
      />
    </SafeAreaView>
  );
}

function buildMapHtml() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>html,body,#map{margin:0;width:100%;height:100%;background:#eef2f6} .leaflet-control-zoom{border:0!important;box-shadow:0 2px 10px rgba(20,32,51,.14)!important}.leaflet-control-zoom a{border:0!important;color:#142033!important}.stop-label{width:12px;height:12px;border-radius:50%;background:#0b746b;border:2px solid #fff;box-shadow:0 2px 5px rgba(23,49,47,.25)}.bus-label{font:800 10px system-ui,sans-serif;color:#fff;background:#0b746b;border-radius:7px;padding:3px 6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(23,49,47,.22)}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>
const map=L.map('map',{preferCanvas:true,zoomControl:true,attributionControl:false,zoomSnap:.5}).setView([28.6139,77.209],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);
const stopLayer=L.layerGroup().addTo(map); const busLayer=L.layerGroup().addTo(map); let userLayer=L.layerGroup().addTo(map); let hasCentered=false;
function reportBounds(){ const b=map.getBounds(); window.ReactNativeWebView.postMessage(JSON.stringify({type:'bounds',bounds:{south:b.getSouth(),west:b.getWest(),north:b.getNorth(),east:b.getEast()}})); }
map.on('moveend',reportBounds);
setTimeout(reportBounds,0);
window.centerMap=function(lat,lon){ map.setView([lat,lon],14); };
window.updateMap=function(data){
  stopLayer.clearLayers(); busLayer.clearLayers(); userLayer.clearLayers();
  const stopIcon=L.divIcon({className:'',html:'<div class="stop-label"></div>',iconSize:[16,16],iconAnchor:[8,8]});
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
  data.buses.forEach(v=>{ const bg=escapeCssColor(v.color||'#0b746b'); const fg=escapeCssColor(v.textColor||'#fff'); L.marker([v.lat,v.lon],{icon:L.divIcon({className:'',html:'<div class="bus-label" style="background:'+bg+';color:'+fg+'">'+escapeHtml(v.route||'BUS')+'</div>',iconSize:[52,24],iconAnchor:[26,12]})}).addTo(busLayer).bindPopup(escapeHtml(v.route||'Live bus')); });
  if(data.location){L.circleMarker([data.location.lat,data.location.lon],{radius:6,color:'#ffffff',weight:2,fillColor:'#0b746b',fillOpacity:1}).addTo(userLayer); if(!hasCentered){map.setView([data.location.lat,data.location.lon],14);hasCentered=true; reportBounds();}}
};
function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));} function escapeCssColor(x){return /^#[0-9a-f]{6}$/i.test(String(x))?String(x):'#0b746b';}
</script></body></html>`;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  header:{paddingHorizontal:20,paddingTop:10,paddingBottom:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  brandRow:{flexDirection:'row',alignItems:'center'},brandCopy:{marginLeft:10},
  brand:{fontSize:23,fontWeight:'900',letterSpacing:1,color:colors.text},tagline:{fontSize:12,color:colors.textMuted,marginTop:2},
  searchBar:{marginHorizontal:20,marginTop:12,height:52,borderRadius:17,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',paddingHorizontal:15},
  searchIcon:{fontSize:27,color:colors.text,marginRight:8,marginTop:-3},searchPlaceholder:{fontSize:15,color:colors.textMuted},
  helperRow:{paddingHorizontal:20,paddingTop:10,paddingBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},helperText:{fontSize:13,color:colors.textMuted,fontWeight:'600'},locationLink:{fontSize:13,color:colors.accent,fontWeight:'800'},
  mapWrap:{marginHorizontal:16,height:315,borderRadius:20,overflow:'hidden',backgroundColor:'#eef2f6',borderWidth:1,borderColor:colors.border},map:{flex:1},
  mapAttribution:{position:'absolute',right:8,bottom:7,backgroundColor:'rgba(255,255,255,.9)',paddingHorizontal:6,paddingVertical:2,borderRadius:4},mapAttributionText:{fontSize:8,color:'#4a5568'},mapBadge:{position:'absolute',left:10,top:10,backgroundColor:'rgba(255,255,255,.95)',paddingHorizontal:9,paddingVertical:6,borderRadius:10},mapBadgeText:{fontSize:11,fontWeight:'700',color:colors.text},locationNotice:{position:'absolute',left:12,right:12,bottom:12,backgroundColor:'#fff',borderRadius:12,padding:10,borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-between'},locationNoticeText:{color:colors.textMuted,fontSize:12},locationRetry:{color:colors.accent,fontWeight:'800',fontSize:12},
  sectionHeader:{paddingHorizontal:20,paddingTop:16,paddingBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionTitle:{fontSize:19,fontWeight:'800',color:colors.text},
  actionRow:{paddingHorizontal:18,paddingTop:6,gap:8,flexDirection:'row'},actionButtonDisabled:{opacity:0.55},actionTile:{flex:1,minHeight:76,borderRadius:17,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,paddingHorizontal:9,paddingVertical:10},actionTileIcon:{fontSize:21,color:colors.accent,fontWeight:'900'},actionTileTitle:{fontSize:12,fontWeight:'900',color:colors.text,marginTop:5},actionTileSub:{fontSize:9,color:colors.textMuted,marginTop:2},
  list:{paddingHorizontal:20,paddingBottom:30},legalLink:{paddingVertical:18,alignItems:'center'},legalLinkText:{fontSize:12,fontWeight:'800',color:colors.accent},stopCard:{backgroundColor:colors.surface,borderRadius:15,borderWidth:1,borderColor:colors.border,padding:12,marginBottom:8,flexDirection:'row',alignItems:'center'},stopPin:{width:34,height:34,borderRadius:17,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},stopPinText:{color:colors.accent,fontSize:13},stopInfo:{flex:1,marginLeft:10},stopName:{fontSize:14,fontWeight:'800',color:colors.text},stopDistance:{fontSize:12,color:colors.textMuted,marginTop:2},chevron:{fontSize:26,color:colors.textMuted,marginLeft:8},emptyText:{color:colors.textMuted,fontSize:13,paddingBottom:20}
});