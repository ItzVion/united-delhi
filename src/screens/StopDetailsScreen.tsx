import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Arrival, Route as ApiRoute, Stop } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import { computeSmartLeave, SmartLeaveResult } from '../lib/smartLeave';
import { formatDuration, haversineMeters, walkingSeconds } from '../lib/geo';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';

type Nav = NativeStackNavigationProp<RootStackParamList, 'StopDetails'>;
type StopRoute = RouteProp<RootStackParamList, 'StopDetails'>;

export default function StopDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<StopRoute>();
  const { stopId, stopName } = params;
  const [stop, setStop] = useState<Stop | null>(null);
  const [routes, setRoutes] = useState<ApiRoute[]>([]);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [arrivalsReason, setArrivalsReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [smartLeave, setSmartLeave] = useState<SmartLeaveResult | null>(null);
  const [smartLeaveError, setSmartLeaveError] = useState<string | null>(null);
  const [computingSmartLeave, setComputingSmartLeave] = useState(false);

  const load = useCallback(async () => {
    const [stopSettled, arrivalsSettled] = await Promise.allSettled([
      api.stop(stopId),
      api.arrivals(stopId)
    ]);

    if (stopSettled.status === 'fulfilled') {
      const stopResult = stopSettled.value;
      if (stopResult.status === 'OK') {
        setStop(stopResult.stop);
        setRoutes(stopResult.routes);
      } else {
        setStop(null);
        setRoutes([]);
      }
    } else {
      setStop(null);
      setRoutes([]);
    }

    if (arrivalsSettled.status === 'fulfilled') {
      const arrivalsResult = arrivalsSettled.value;
      if (arrivalsResult.status === 'OK') {
        setArrivals(arrivalsResult.arrivals);
        setArrivalsReason(null);
      } else {
        setArrivals([]);
        setArrivalsReason(arrivalsResult.reason || 'Live arrival data is unavailable.');
      }
    } else {
      setArrivals([]);
      setArrivalsReason((arrivalsSettled.reason as Error)?.message || 'Live arrival data is unavailable.');
    }

    if (stopSettled.status === 'rejected' && arrivalsSettled.status === 'rejected') {
      setArrivalsReason('Stop and live arrival data are temporarily unavailable.');
    }

    setLoading(false);
  }, [stopId]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const runSmartLeave = useCallback(async () => {
    if (!stop) return;
    setComputingSmartLeave(true);
    setSmartLeaveError(null);
    try {
      const permission = await Promise.race([
        Location.requestForegroundPermissionsAsync(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('permission-timeout')), 10000)
        )
      ]);
      if (permission.status !== 'granted') {
        setSmartLeaveError('Location permission is needed to estimate your walk.');
        return;
      }
      const current = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);
      const distance = haversineMeters(current.coords.latitude, current.coords.longitude, stop.latitude, stop.longitude);
      setSmartLeave(computeSmartLeave(arrivals, walkingSeconds(distance)));
    } catch {
      setSmartLeaveError('Could not get your location for Smart Leave.');
    } finally {
      setComputingSmartLeave(false);
    }
  }, [stop, arrivals]);

  const title = stop?.name || stopName || 'Bus stop';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
          <View style={styles.topTitle}><Text style={styles.eyebrow}>BUS STOP</Text><Text style={styles.title} numberOfLines={2}>{title}</Text></View>
        </View>

        <View style={styles.hero}>
          <View style={styles.pin}><Text style={styles.pinText}>●</Text></View>
          <View style={styles.heroText}><Text style={styles.heroTitle}>{title}</Text><Text style={styles.heroSub}>{stop ? 'DTC stop' : 'Loading stop details…'}</Text></View>
          {arrivalsReason ? <StatusPill label="Live unavailable" tone="danger" /> : <StatusPill label="Live" tone="ok" />}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Buses at this stop</Text><Text style={styles.refreshText}>Updates every 30s</Text></View>
          {loading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 18 }} /> : null}
          {arrivalsReason ? <Text style={styles.muted}>{arrivalsReason}</Text> : null}
          {!loading && !arrivalsReason && arrivals.length === 0 ? <Text style={styles.muted}>No live buses are reporting on these routes right now.</Text> : null}
          {arrivals.map((a, index) => (
            <View key={a.vehicleId} style={styles.arrival}>
              <View style={[styles.busIcon, { backgroundColor: index % 2 ? colors.accentSoft : colors.warningSoft }]}><Text style={{ color: index % 2 ? colors.accent : colors.warning, fontWeight: '900' }}>BUS</Text></View>
              <View style={styles.arrivalMain}>
                <Text style={styles.route}>{displayRouteName(a.routeShortName) || a.routeId || 'Unknown route'}</Text>
                <Text style={styles.arrivalMeta}>{a.source === 'live-data-estimate' ? 'Live estimate' : 'Live position'} · {a.observedAgeSeconds}s old</Text>
              </View>
              <View style={styles.etaBox}>
                <Text style={styles.eta}>{a.etaSeconds !== null ? formatDuration(a.etaSeconds) : `${Math.round(a.distanceMeters)} m`}</Text>
                <Text style={styles.confidence}>{a.confidence} confidence</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Routes at this stop</Text><Text style={styles.count}>{routes.length}</Text></View>
          <View style={styles.routeList}>
            {routes.map(r => (
              <Pressable key={r.route_id} style={styles.routeCard} onPress={() => navigation.navigate('RouteDetails', { routeId: r.route_id, label: displayRouteName(r.short_name) || r.route_id })}>
                <View style={styles.routeNumber}><Text style={styles.routeNumberText}>{displayRouteName(r.short_name) || r.route_id}</Text></View>
                <View style={styles.routeText}><Text style={styles.routeName}>{r.long_name || 'DTC route'}</Text><Text style={styles.routeHint}>View route details</Text></View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
          {!loading && routes.length === 0 ? <Text style={styles.muted}>No routes found for this stop.</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Smart Leave</Text>
          <Text style={styles.muted}>Estimate when to leave based on your walking time, the nearest live bus and a safety buffer.</Text>
          <Pressable style={styles.smartButton} onPress={runSmartLeave} disabled={computingSmartLeave}>
            {computingSmartLeave ? <ActivityIndicator color="#fff" /> : <Text style={styles.smartButtonText}>When should I leave?</Text>}
          </Pressable>
          {smartLeaveError ? <Text style={styles.error}>{smartLeaveError}</Text> : null}
          {smartLeave ? (
            <View style={styles.smartResult}>
              <Text style={styles.smartHeadline}>
                {smartLeave.status === 'insufficient-data' ? 'Not enough live data' : smartLeave.status === 'leave-now' ? 'Leave now' : `Leave in ${formatDuration(smartLeave.leaveInSeconds || 0)}`}
              </Text>
              <Text style={styles.muted}>{smartLeave.explanation}</Text>
              <Text style={styles.detail}>Walk ~{formatDuration(smartLeave.walkingSeconds)} · buffer {formatDuration(smartLeave.safetyBufferSeconds)}{smartLeave.arrivalEtaSeconds !== null ? ` · bus ~${formatDuration(smartLeave.arrivalEtaSeconds)}` : ''}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},content:{padding:18,paddingBottom:40},
  topBar:{flexDirection:'row',alignItems:'center',marginBottom:14},backButton:{width:42,height:42,alignItems:'center',justifyContent:'center'},back:{fontSize:36,lineHeight:38,color:colors.text},topTitle:{flex:1,marginLeft:4},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},title:{fontSize:20,fontWeight:'900',color:colors.text,marginTop:2},
  hero:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:16,flexDirection:'row',alignItems:'center'},pin:{width:48,height:48,borderRadius:24,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},pinText:{fontSize:17,color:colors.accent},heroText:{flex:1,marginLeft:12},heroTitle:{fontSize:16,fontWeight:'900',color:colors.text},heroSub:{fontSize:12,color:colors.textMuted,marginTop:3},
  section:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:15,marginTop:12},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},sectionTitle:{fontSize:17,fontWeight:'900',color:colors.text},refreshText:{fontSize:10,color:colors.textMuted},count:{minWidth:28,textAlign:'center',paddingVertical:4,paddingHorizontal:8,borderRadius:999,backgroundColor:colors.accentSoft,color:colors.accent,fontWeight:'900'},
  muted:{fontSize:13,lineHeight:19,color:colors.textMuted},arrival:{borderTopWidth:1,borderTopColor:colors.border,paddingVertical:11,flexDirection:'row',alignItems:'center'},busIcon:{width:44,height:44,borderRadius:13,alignItems:'center',justifyContent:'center'},arrivalMain:{flex:1,marginLeft:10},route:{fontSize:16,fontWeight:'900',color:colors.text},arrivalMeta:{fontSize:10,color:colors.textMuted,marginTop:3},etaBox:{alignItems:'flex-end'},eta:{fontSize:15,fontWeight:'900',color:colors.accent},confidence:{fontSize:9,color:colors.textMuted,marginTop:2},
  routeList:{gap:8},routeCard:{borderWidth:1,borderColor:colors.border,borderRadius:13,padding:10,flexDirection:'row',alignItems:'center'},routeNumber:{minWidth:54,height:38,borderRadius:10,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:7},routeNumberText:{color:'#fff',fontWeight:'900',fontSize:13},routeText:{flex:1,marginLeft:10},routeName:{fontSize:12,fontWeight:'800',color:colors.text},routeHint:{fontSize:10,color:colors.textMuted,marginTop:3},chevron:{fontSize:25,color:colors.textMuted},
  smartButton:{marginTop:12,borderRadius:13,backgroundColor:colors.accent,paddingVertical:13,alignItems:'center'},smartButtonText:{color:'#fff',fontWeight:'900'},error:{color:colors.danger,fontSize:12,marginTop:8},smartResult:{marginTop:12,padding:12,borderRadius:13,backgroundColor:colors.accentSoft},smartHeadline:{fontSize:20,fontWeight:'900',color:colors.text},detail:{fontSize:11,color:colors.textMuted,marginTop:7}
});