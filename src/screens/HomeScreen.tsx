import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';

const DELHI_REGION: Region = { latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.15, longitudeDelta: 0.15 };
type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<WebView | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationStatus, setLocationStatus] = useState('Requesting location…');
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesFreshness, setVehiclesFreshness] = useState<{state:'loading'|'ok'|'stale'|'unavailable';reason?:string}>({state:'loading'});
  const [loadingNearby, setLoadingNearby] = useState(true);
  const [locationReady, setLocationReady] = useState(false);

  const requestLocation = useCallback(async () => {
    setLocationStatus('Checking location permission…');
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let permission = existing;

      if (permission.status !== 'granted') {
        setLocationStatus('Allow location permission on your phone…');
        permission = await Promise.race([
          Location.requestForegroundPermissionsAsync(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Location permission request timed out')), 8000))
        ]);
      }

      if (permission.status !== 'granted') {
        setLocationStatus('Location permission is off. Tap Retry and allow it.');
        return;
      }

      setLocationStatus('Getting your location…');

      // Use a recent cached location immediately so the app does not sit on
      // the location screen while Android acquires a fresh GPS fix.
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
        requiredAccuracy: 2000
      });

      if (lastKnown) {
        setLocation(lastKnown);
        setLocationReady(true);
        setLocationStatus('');
        
      }

      try {
        const current = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Location request timed out')), 10000))
        ]);

        setLocation(current);
        setLocationReady(true);
        setLocationStatus('');
        
      } catch (error) {
        if (lastKnown) {
          setLocationStatus('');
          return;
        }
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setLocationStatus(
        message.includes('permission') || message.includes('timed out')
          ? 'Location unavailable. Tap Retry, or enable Location permission in Android Settings.'
          : 'Could not get your location. Showing all of Delhi instead.'
      );
    }
  }, []);

  const loadNearbyStops = useCallback(async (lat:number,lon:number) => {
    setLoadingNearby(true);
    try { const result=await api.nearbyStops(lat,lon,12); setNearbyStops(result.status==='OK'?result.stops:[]); }
    catch { setNearbyStops([]); } finally { setLoadingNearby(false); }
  }, []);

  const loadVehicles = useCallback(async () => {
    try { const result=await api.vehicles(); if(result.status==='OK'){setVehicles(result.vehicles);setVehiclesFreshness({state:'ok'});} else setVehiclesFreshness({state:'unavailable',reason:result.reason}); }
    catch(error){setVehiclesFreshness({state:'unavailable',reason:(error as Error).message});}
  }, []);

  useEffect(()=>{
    loadNearbyStops(DELHI_REGION.latitude, DELHI_REGION.longitude);
    requestLocation();
  },[requestLocation,loadNearbyStops]);
  useEffect(()=>{if(location) loadNearbyStops(location.coords.latitude,location.coords.longitude);},[location,loadNearbyStops]);
  useEffect(()=>{loadVehicles();const interval=setInterval(loadVehicles,20000);return()=>clearInterval(interval);},[loadVehicles]);

  const freshnessTone=vehiclesFreshness.state==='ok'?'ok':vehiclesFreshness.state==='loading'?'muted':'danger';
  const freshnessLabel=vehiclesFreshness.state==='ok'?`${vehicles.length} live buses`:vehiclesFreshness.state==='loading'?'Loading live buses…':'Live buses unavailable';

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.brand}>United Delhi</Text><StatusPill label={freshnessLabel} tone={freshnessTone}/></View>
    <Pressable style={styles.searchBar} onPress={()=>navigation.navigate('Search')}><Text style={styles.searchPlaceholder}>Search a bus or stop</Text></Pressable>
    <View style={styles.mapWrap}>
      <WebView
        ref={mapRef}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        source={{ html: buildMapHtml(DELHI_REGION, location, nearbyStops, vehicles) }}
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
      <View pointerEvents="none" style={styles.mapAttribution}>
        <Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text>
      </View>
      {locationStatus ? <View style={styles.mapOverlay}><Text style={styles.mapOverlayText}>{locationStatus}</Text><Pressable style={styles.retryButton} onPress={requestLocation}><Text style={styles.retryButtonText}>Retry</Text></Pressable></View> : null}
    </View>
    <View style={styles.listHeader}><Text style={styles.listTitle}>Nearby stops</Text>{loadingNearby?<ActivityIndicator color={colors.accent}/>:null}</View>
    <FlatList data={nearbyStops} keyExtractor={item=>item.stop_id} contentContainerStyle={styles.list} ListEmptyComponent={!loadingNearby?<Text style={styles.emptyText}>No nearby stops found yet.</Text>:null}
      renderItem={({item})=><Pressable style={styles.stopCard} onPress={()=>navigation.navigate('StopDetails',{stopId:item.stop_id,stopName:item.name})}><Text style={styles.stopName}>{item.name}</Text>{item.distance_m!==undefined?<Text style={styles.stopDistance}>{Math.round(item.distance_m)} m away</Text>:null}</Pressable>}/>
  </SafeAreaView>;
}
function buildMapHtml(region: Region, location: Location.LocationObject | null, stops: Stop[], buses: Vehicle[]) {
  const centerLat = location?.coords.latitude ?? region.latitude;
  const centerLon = location?.coords.longitude ?? region.longitude;
  const stopData = JSON.stringify(stops.map(s => ({ id:s.stop_id, name:s.name, lat:s.latitude, lon:s.longitude }))).replace(/</g, '\\u003c');
  const busData = JSON.stringify(buses.map(v => ({ id:v.id, route:v.routeId, lat:v.latitude, lon:v.longitude, observed:v.observedAt }))).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{margin:0;width:100%;height:100%;background:#e8eef2} .stop{font-size:20px} .bus{font-size:18px}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
  const map=L.map('map',{zoomControl:true}).setView([${centerLat},${centerLon}],14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  const stops=${stopData}; const buses=${busData};
  stops.forEach(s=>L.marker([s.lat,s.lon]).addTo(map).bindPopup('<b>'+escapeHtml(s.name)+'</b><br><button onclick="openStop(\\''+s.id+'\\')">View stop</button>'));
  buses.forEach(v=>L.marker([v.lat,v.lon],{icon:L.divIcon({className:'bus',html:'🚌',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(map).bindPopup((v.route?'Route '+escapeHtml(v.route):'DTC bus')));
  ${location ? `L.circleMarker([${centerLat},${centerLon}],{radius:8}).addTo(map).bindPopup('Your location');` : ''}
  function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}
  function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  </script></body></html>`;
}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingTop:12},
 brand:{color:colors.text,fontSize:28,fontWeight:'800'},searchBar:{marginHorizontal:20,marginTop:14,height:48,borderRadius:14,backgroundColor:colors.surface,justifyContent:'center',paddingHorizontal:16},
 searchPlaceholder:{color:colors.textMuted,fontSize:15},mapWrap:{marginTop:14,marginHorizontal:20,height:260,borderRadius:22,overflow:'hidden'},map:{flex:1},
 mapAttribution:{position:"absolute",right:8,bottom:6,backgroundColor:"rgba(255,255,255,0.85)",paddingHorizontal:6,paddingVertical:2,borderRadius:4},mapAttributionText:{color:"#333",fontSize:9},mapOverlay:{position:'absolute',left:12,right:12,bottom:12,backgroundColor:'rgba(11,18,32,0.9)',borderRadius:14,padding:12,gap:8},
 mapOverlayText:{color:colors.text,fontSize:13,lineHeight:18},retryButton:{alignSelf:'flex-start',backgroundColor:colors.accent,borderRadius:10,paddingHorizontal:12,paddingVertical:6},
 retryButtonText:{color:colors.accentDark,fontWeight:'700',fontSize:12},listHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginHorizontal:20,marginTop:18,marginBottom:8},
 listTitle:{color:colors.text,fontSize:17,fontWeight:'700'},list:{paddingHorizontal:20,paddingBottom:24,gap:10},emptyText:{color:colors.textMuted,fontSize:14},
 stopCard:{backgroundColor:colors.surface,borderRadius:14,padding:14,marginBottom:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 stopName:{color:colors.text,fontSize:15,fontWeight:'600',flexShrink:1},stopDistance:{color:colors.textMuted,fontSize:13}
});