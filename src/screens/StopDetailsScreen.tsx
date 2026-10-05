import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Arrival, Route as ApiRoute, Stop } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';

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
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

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
          {arrivals.map(a => {
            const name=displayRouteName(a.routeShortName) || 'Live bus';
            if(!a.routeId)return null;
            const rc=a.serviceColor?{background:a.serviceColor,text:a.serviceType==='electric'?'#17313B':'#FFFFFF'}:resolveRouteColor(name,null,null);
            return <Pressable key={a.vehicleId} style={styles.arrival} onPress={() => {if(a.routeShortName)navigation.navigate('RouteDetails', { routeId:a.routeId!, label:name });}} disabled={!a.routeShortName}>
              <View style={[styles.busIcon,{backgroundColor:rc.background}]}><Text style={{color:rc.text,fontWeight:'900',fontSize:11}}>{name}</Text></View>
              <View style={styles.arrivalMain}>
                <Text style={styles.route}>{name}</Text>
                <Text style={styles.arrivalMeta}>To {a.toStop || 'Destination'} · {a.observedAgeSeconds < 60 ? 'Updated just now' : 'Updated '+Math.floor(a.observedAgeSeconds/60)+' min ago'}</Text>
              </View>
              <View style={styles.etaBox}>
                <Text style={styles.eta}>{Math.round(a.distanceMeters)+' m'}</Text>
                <Text style={styles.confidence}>Live position</Text>
              </View>
            </Pressable>;
          })}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Routes at this stop</Text><Text style={styles.count}>{routes.length}</Text></View>
          <View style={styles.routeList}>
            {routes.map(r => {
              const name=displayRouteName(r.short_name);
              if(!name)return null;
              const rc=resolveRouteColor(name,r.route_color,r.route_text_color);
              return <Pressable key={r.route_id} style={styles.routeCard} onPress={() => navigation.navigate('RouteDetails', { routeId:r.route_id, label:name })}>
                <View style={[styles.routeNumber,{backgroundColor:rc.background}]}><Text style={[styles.routeNumberText,{color:rc.text}]}>{name}</Text></View>
                <View style={styles.routeText}>
                  <Text style={styles.routeName} numberOfLines={1}>{r.fromStop || 'Starting stop'}</Text>
                  <Text style={styles.routeDirection} numberOfLines={1}>to {r.toStop || 'Ending stop'}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>;
            })}
          </View>
          {!loading && routes.length === 0 ? <Text style={styles.muted}>No routes found for this stop.</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},content:{padding:18,paddingBottom:40},
  topBar:{flexDirection:'row',alignItems:'center',marginBottom:14},backButton:{width:42,height:42,alignItems:'center',justifyContent:'center'},back:{fontSize:36,lineHeight:38,color:colors.text},topTitle:{flex:1,marginLeft:4},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},title:{fontSize:20,fontWeight:'900',color:colors.text,marginTop:2},
  hero:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:14,padding:16,flexDirection:'row',alignItems:'center'},pin:{width:48,height:48,borderRadius:14,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},pinText:{fontSize:17,color:colors.accent},heroText:{flex:1,marginLeft:12},heroTitle:{fontSize:16,fontWeight:'900',color:colors.text},heroSub:{fontSize:12,color:colors.textMuted,marginTop:3},
  section:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,marginTop:12},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},sectionTitle:{fontSize:17,fontWeight:'900',color:colors.text},refreshText:{fontSize:10,color:colors.textMuted},count:{minWidth:28,textAlign:'center',paddingVertical:4,paddingHorizontal:8,borderRadius:14,backgroundColor:colors.accentSoft,color:colors.accent,fontWeight:'900'},
  muted:{fontSize:13,lineHeight:19,color:colors.textMuted},arrival:{borderTopWidth:1,borderTopColor:colors.border,paddingVertical:11,flexDirection:'row',alignItems:'center'},busIcon:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'},arrivalMain:{flex:1,marginLeft:10},route:{fontSize:16,fontWeight:'900',color:colors.text},arrivalMeta:{fontSize:10,color:colors.textMuted,marginTop:3},etaBox:{alignItems:'flex-end'},eta:{fontSize:15,fontWeight:'900',color:colors.accent},confidence:{fontSize:9,color:colors.textMuted,marginTop:2},
  routeList:{gap:8},routeCard:{borderWidth:1,borderColor:colors.border,borderRadius:14,padding:10,flexDirection:'row',alignItems:'center'},routeNumber:{minWidth:54,height:38,borderRadius:14,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:7},routeNumberText:{color:'#fff',fontWeight:'900',fontSize:13},routeText:{flex:1,marginLeft:10},routeName:{fontSize:12,fontWeight:'800',color:colors.text},routeDirection:{fontSize:10,color:colors.textMuted,marginTop:3},chevron:{fontSize:25,color:colors.textMuted},
});
