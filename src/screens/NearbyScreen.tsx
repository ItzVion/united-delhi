import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';
import { haversineMeters } from '../lib/geo';
import { confirmLocationUse } from '../lib/locationConsent';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Nearby'>;

export default function NearbyScreen() {
  const navigation = useNavigation<Nav>();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [buses, setBuses] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!(await confirmLocationUse())) throw new Error('Location use was cancelled.');
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission is off. Enable it to use Nearby.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(current);
      const [stopResult, vehicleResult] = await Promise.all([
        api.nearbyStops(current.coords.latitude, current.coords.longitude, 15),
        api.vehicles()
      ]);
      setStops(stopResult.status === 'OK' ? stopResult.stops : []);
      setBuses(vehicleResult.status === 'OK'
        ? vehicleResult.vehicles
            .filter(v => haversineMeters(current.coords.latitude, current.coords.longitude, v.latitude, v.longitude) <= 3000)
            .sort((a,b) => haversineMeters(current.coords.latitude,current.coords.longitude,a.latitude,a.longitude) - haversineMeters(current.coords.latitude,current.coords.longitude,b.latitude,b.longitude))
            .slice(0, 20)
        : []);
    } catch (e) {
      setError((e as Error).message || 'Nearby is unavailable.');
      setStops([]); setBuses([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headText}>
          <Text style={styles.eyebrow}>AROUND YOU</Text>
          <Text style={styles.title}>Nearby</Text>
          <Text style={styles.subtitle}>{location ? 'Live transit around your location' : 'Finding your location'}</Text>
        </View>
        <Pressable style={styles.refresh} onPress={() => void load()}><Text style={styles.refreshText}>Refresh</Text></Pressable>
      </View>

      {error ? <View style={styles.error}><Text style={styles.errorTitle}>Nearby unavailable</Text><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent}/><Text style={styles.loadingText}>Finding nearby transit…</Text></View> : null}

      {!loading && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Stops within reach</Text><Text style={styles.count}>{stops.length}</Text></View>
            {stops.map(stop => (
              <Pressable key={stop.stop_id} style={styles.stopRow} onPress={() => navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name})}>
                <View style={styles.stopDot}/>
                <View style={styles.main}><Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text><Text style={styles.meta}>{stop.distance_m != null ? `${Math.round(stop.distance_m)} m away` : 'Nearby stop'}</Text></View>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
            ))}
            {stops.length === 0 ? <Text style={styles.muted}>No stops were found nearby.</Text> : null}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Live buses nearby</Text><Text style={styles.count}>{buses.length}</Text></View>
            {buses.map(bus => {
              const name = displayRouteName(bus.routeShortName) || 'BUS';
              const rc = resolveRouteColor(name, bus.routeColor, bus.routeTextColor);
              const distance = location ? Math.round(haversineMeters(location.coords.latitude, location.coords.longitude, bus.latitude, bus.longitude)) : null;
              return (
                <Pressable key={bus.id} style={styles.busRow} onPress={() => bus.routeId && navigation.navigate('RouteDetails',{routeId:bus.routeId,label:name})}>
                  <View style={[styles.routeBadge,{backgroundColor:rc.background}]}><Text style={[styles.routeText,{color:rc.text}]}>{name}</Text></View>
                  <View style={styles.main}><Text style={styles.busDistance}>{distance != null ? `${distance} m away` : 'Nearby live bus'}</Text><Text style={styles.meta}>{bus.speedMps != null ? `${(bus.speedMps*3.6).toFixed(0)} km/h` : 'Speed unavailable'}</Text></View>
                  <Text style={styles.arrow}>›</Text>
                </Pressable>
              );
            })}
            {buses.length === 0 ? <Text style={styles.muted}>No live buses detected within 3 km right now.</Text> : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:36},
  header:{flexDirection:'row',alignItems:'center',marginBottom:12},
  back:{width:42,height:42,alignItems:'center',justifyContent:'center'},backText:{fontSize:36,color:colors.text},
  headText:{flex:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},title:{fontSize:25,fontWeight:'900',color:colors.text},subtitle:{fontSize:12,color:colors.textMuted,marginTop:2},
  refresh:{paddingHorizontal:10,paddingVertical:8,borderWidth:1,borderColor:colors.border,borderRadius:10,backgroundColor:colors.surface},refreshText:{fontSize:11,fontWeight:'800',color:colors.accent},
  error:{padding:12,borderWidth:1,borderColor:colors.danger,borderRadius:14,backgroundColor:colors.dangerSoft,marginBottom:10},errorTitle:{fontSize:13,fontWeight:'900',color:colors.danger},errorText:{fontSize:12,lineHeight:17,color:colors.textMuted,marginTop:2},
  loading:{paddingVertical:35,alignItems:'center'},loadingText:{fontSize:12,color:colors.textMuted,marginTop:8},
  section:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:14,marginBottom:12},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:5},sectionTitle:{fontSize:17,fontWeight:'900',color:colors.text},count:{minWidth:28,textAlign:'center',paddingVertical:4,paddingHorizontal:8,borderRadius:999,backgroundColor:colors.accentSoft,color:colors.accent,fontWeight:'900'},
  stopRow:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:colors.border},stopDot:{width:11,height:11,borderRadius:6,borderWidth:2,borderColor:colors.accent,backgroundColor:colors.surface},
  main:{flex:1,marginLeft:10},stopName:{fontSize:14,fontWeight:'800',color:colors.text},busDistance:{fontSize:13,fontWeight:'800',color:colors.text},meta:{fontSize:11,color:colors.textMuted,marginTop:2},
  arrow:{fontSize:24,color:colors.textMuted},busRow:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:colors.border},
  routeBadge:{minWidth:54,height:34,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:8},routeText:{fontSize:13,fontWeight:'900'},muted:{fontSize:12,lineHeight:18,color:colors.textMuted,paddingVertical:12}
});
