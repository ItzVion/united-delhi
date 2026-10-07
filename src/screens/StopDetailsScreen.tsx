import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Arrival, Route as ApiRoute, Stop } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
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
  const [loading, setLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [stopSettled, arrivalsSettled] = await Promise.allSettled([api.stop(stopId), api.arrivals(stopId)]);

    if (stopSettled.status === 'fulfilled' && stopSettled.value.status === 'OK') {
      setStop(stopSettled.value.stop);
      setRoutes(stopSettled.value.routes);
    } else {
      setStop(null);
      setRoutes([]);
    }

    if (arrivalsSettled.status === 'fulfilled' && arrivalsSettled.value.status === 'OK') {
      setArrivals(arrivalsSettled.value.arrivals);
      setLiveError(null);
    } else {
      setArrivals([]);
      setLiveError('Live bus positions are temporarily unavailable.');
    }
    setLoading(false);
  }, [stopId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiRoute[]>();
    for (const route of routes) {
      const name = displayRouteName(route.short_name || route.route_id);
      if (!name) continue;
      const list = map.get(name) || [];
      list.push(route);
      map.set(name, list);
    }
    return [...map.entries()];
  }, [routes]);

  const liveRoutes = useMemo(() => {
    const set = new Set<string>();
    for (const arrival of arrivals) {
      const name = displayRouteName(arrival.routeShortName || arrival.routeId);
      if (name) set.add(name.toUpperCase());
    }
    return set;
  }, [arrivals]);

  const title = stop?.name || stopName || 'Bus stop';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <View style={styles.topTitle}>
            <Text style={styles.eyebrow}>BUS STOP</Text>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.pin}><Text style={styles.pinText}>●</Text></View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroSub}>{grouped.length} bus routes serve this stop</Text>
          </View>
          <StatusPill label={liveError ? 'Live unavailable' : 'Live'} tone={liveError ? 'danger' : 'ok'} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Buses at this stop</Text>
            <Text style={styles.refreshText}>Updates every 30s</Text>
          </View>

          {loading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
          {!loading && !grouped.length ? <Text style={styles.muted}>No bus routes are listed for this stop.</Text> : null}

          {grouped.map(([name, items]) => {
            const first = items[0];
            const rawLong = String(first.long_name || '').replace(/(?:UP|DOWN|DWN)$/i, '').trim();
            const detail = rawLong && rawLong.toUpperCase() !== name.toUpperCase()
              ? rawLong
              : name === '801'
                ? 'Inderlok Metro - IGI Airport'
                : name === 'AIR-5'
                  ? 'Azadpur Terminal - IGI Airport Terminal 2'
                  : null;
            const liveArrival = arrivals.find(a => displayRouteName(a.routeShortName || a.routeId)?.toUpperCase() === name.toUpperCase());
            const live = liveRoutes.has(name.toUpperCase());
            const routeColor = liveArrival?.serviceColor ? { background: liveArrival.serviceColor, text: liveArrival.serviceType === 'electric' ? '#17313B' : '#FFFFFF' } : { background: '#E57D43', text: '#FFFFFF' };
            return (
              <Pressable
                key={name}
                style={styles.routeRow}
                onPress={() => navigation.navigate('RouteDetails', { routeId: first.route_id, label: name })}
              >
                <View style={[styles.routeNumber, { backgroundColor: live ? '#E57D43' : routeColor.background }]}>
                  <Text style={[styles.routeNumberText, { color: live ? '#FFFFFF' : routeColor.text }]}>{name}</Text>
                </View>
                <View style={styles.routeCopy}>
                  <Text style={styles.routeName} numberOfLines={1}>{detail || 'Bus route ' + name}</Text>
                  <Text style={styles.routeMeta}>
                    {items.length > 1 ? items.length + ' directions' : 'Route'}{live ? ' · Live bus nearby' : ''}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>
          This list shows the scheduled bus routes for this stop. A “Live bus nearby” label only appears when a current vehicle position matches the route.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 40 },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: 36, lineHeight: 38, color: colors.text },
  topTitle: { flex: 1, marginLeft: 4 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: colors.accent },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, marginTop: 2 },
  hero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 16, flexDirection: 'row', alignItems: 'center' },
  pin: { width: 48, height: 48, borderRadius: 0, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontSize: 17, color: colors.accent },
  heroText: { flex: 1, marginLeft: 12 },
  heroTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  heroSub: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 15, marginTop: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  refreshText: { fontSize: 10, color: colors.textMuted },
  loading: { marginVertical: 18 },
  muted: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  routeRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 11, flexDirection: 'row', alignItems: 'center' },
  routeNumber: { minWidth: 58, height: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 0 },
  routeNumberText: { fontWeight: '900', fontSize: 13 },
  routeCopy: { flex: 1, marginLeft: 10 },
  routeName: { fontSize: 13, fontWeight: '900', color: colors.text },
  routeMeta: { fontSize: 10, color: colors.textMuted, marginTop: 3 },
  chevron: { fontSize: 25, color: colors.textMuted },
  note: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: 12 }
});
