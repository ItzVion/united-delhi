import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, Region } from 'react-native-maps';
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
  const mapRef = useRef<MapView | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationStatus, setLocationStatus] = useState('Requesting location…');
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesFreshness, setVehiclesFreshness] = useState<{state:'loading'|'ok'|'stale'|'unavailable';reason?:string}>({state:'loading'});
  const [loadingNearby, setLoadingNearby] = useState(false);

  const requestLocation = useCallback(async () => {
    setLocationStatus('Requesting location permission…');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { setLocationStatus('Location permission denied. Enable it to see nearby stops.'); return; }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(current); setLocationStatus('');
      mapRef.current?.animateToRegion({ latitude:current.coords.latitude, longitude:current.coords.longitude, latitudeDelta:0.03, longitudeDelta:0.03 }, 400);
    } catch { setLocationStatus('Could not get your location. Showing all of Delhi instead.'); }
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

  useEffect(()=>{requestLocation();},[requestLocation]);
  useEffect(()=>{if(location) loadNearbyStops(location.coords.latitude,location.coords.longitude);},[location,loadNearbyStops]);
  useEffect(()=>{loadVehicles();const interval=setInterval(loadVehicles,20000);return()=>clearInterval(interval);},[loadVehicles]);

  const freshnessTone=vehiclesFreshness.state==='ok'?'ok':vehiclesFreshness.state==='loading'?'muted':'danger';
  const freshnessLabel=vehiclesFreshness.state==='ok'?`${vehicles.length} live buses`:vehiclesFreshness.state==='loading'?'Loading live buses…':'Live buses unavailable';

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.brand}>United Delhi</Text><StatusPill label={freshnessLabel} tone={freshnessTone}/></View>
    <Pressable style={styles.searchBar} onPress={()=>navigation.navigate('Search')}><Text style={styles.searchPlaceholder}>Search a bus or stop</Text></Pressable>
    <View style={styles.mapWrap}>
      <MapView ref={mapRef} style={styles.map} initialRegion={DELHI_REGION} showsUserLocation showsMyLocationButton={false}>
        {vehicles.map(v=><Marker key={v.id} coordinate={{latitude:v.latitude,longitude:v.longitude}} title={v.routeId?`Route ${v.routeId}`:'DTC bus'} description={`Updated ${new Date(v.observedAt).toLocaleTimeString()}`} pinColor={colors.accent}/>)}
        {nearbyStops.map(s=><Marker key={s.stop_id} coordinate={{latitude:s.latitude,longitude:s.longitude}} title={s.name} pinColor={colors.warning} onPress={()=>navigation.navigate('StopDetails',{stopId:s.stop_id,stopName:s.name})}/>)}
      </MapView>
      {locationStatus?<View style={styles.mapOverlay}><Text style={styles.mapOverlayText}>{locationStatus}</Text><Pressable style={styles.retryButton} onPress={requestLocation}><Text style={styles.retryButtonText}>Retry</Text></Pressable></View>:null}
    </View>
    <View style={styles.listHeader}><Text style={styles.listTitle}>Nearby stops</Text>{loadingNearby?<ActivityIndicator color={colors.accent}/>:null}</View>
    <FlatList data={nearbyStops} keyExtractor={item=>item.stop_id} contentContainerStyle={styles.list} ListEmptyComponent={!loadingNearby?<Text style={styles.emptyText}>No nearby stops found yet.</Text>:null}
      renderItem={({item})=><Pressable style={styles.stopCard} onPress={()=>navigation.navigate('StopDetails',{stopId:item.stop_id,stopName:item.name})}><Text style={styles.stopName}>{item.name}</Text>{item.distance_m!==undefined?<Text style={styles.stopDistance}>{Math.round(item.distance_m)} m away</Text>:null}</Pressable>}/>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingTop:12},
 brand:{color:colors.text,fontSize:28,fontWeight:'800'},searchBar:{marginHorizontal:20,marginTop:14,height:48,borderRadius:14,backgroundColor:colors.surface,justifyContent:'center',paddingHorizontal:16},
 searchPlaceholder:{color:colors.textMuted,fontSize:15},mapWrap:{marginTop:14,marginHorizontal:20,height:260,borderRadius:22,overflow:'hidden'},map:{flex:1},
 mapOverlay:{position:'absolute',left:12,right:12,bottom:12,backgroundColor:'rgba(11,18,32,0.9)',borderRadius:14,padding:12,gap:8},
 mapOverlayText:{color:colors.text,fontSize:13,lineHeight:18},retryButton:{alignSelf:'flex-start',backgroundColor:colors.accent,borderRadius:10,paddingHorizontal:12,paddingVertical:6},
 retryButtonText:{color:colors.accentDark,fontWeight:'700',fontSize:12},listHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginHorizontal:20,marginTop:18,marginBottom:8},
 listTitle:{color:colors.text,fontSize:17,fontWeight:'700'},list:{paddingHorizontal:20,paddingBottom:24,gap:10},emptyText:{color:colors.textMuted,fontSize:14},
 stopCard:{backgroundColor:colors.surface,borderRadius:14,padding:14,marginBottom:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 stopName:{color:colors.text,fontSize:15,fontWeight:'600',flexShrink:1},stopDistance:{color:colors.textMuted,fontSize:13}
});