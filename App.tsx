import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import * as Location from 'expo-location';

export default function App() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Find nearby DTC buses');
  const [loading, setLoading] = useState(false);

  const locate = async () => {
    setLoading(true);
    setStatus('Requesting location permission…');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setStatus('Location permission is required for nearby stops.');
      setLoading(false);
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocation(current);
    setStatus(`Location ready: ${current.coords.latitude.toFixed(4)}, ${current.coords.longitude.toFixed(4)}`);
    setLoading(false);
  };

  useEffect(() => { locate(); }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.brand}>United Delhi</Text>
        <Text style={styles.subtitle}>Your Delhi DTC travel companion</Text>
        <View style={styles.searchBox}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search route or bus stop" placeholderTextColor="#8A94A6" style={styles.input} />
        </View>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapTitle}>Live bus map</Text>
          <Text style={styles.mapText}>Map and verified realtime bus positions will appear here.</Text>
          <View style={styles.pill}><Text style={styles.pillText}>Delhi • DTC</Text></View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nearby stops</Text>
          <Text style={styles.cardText}>{status}</Text>
          {loading ? <ActivityIndicator color="#35C48B" /> : <Pressable style={styles.button} onPress={locate}><Text style={styles.buttonText}>{location ? 'Refresh location' : 'Use my location'}</Text></Pressable>}
        </View>
        <Text style={styles.footer}>Built for Delhi commuters • V1</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  container: { flex: 1, padding: 20, gap: 14 },
  brand: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', marginTop: 20 },
  subtitle: { color: '#A8B2C5', fontSize: 15 },
  searchBox: { backgroundColor: '#172235', borderRadius: 14, paddingHorizontal: 14 },
  input: { color: '#FFFFFF', height: 52, fontSize: 15 },
  mapPlaceholder: { height: 300, borderRadius: 22, backgroundColor: '#182C3B', alignItems: 'center', justifyContent: 'center', padding: 28 },
  mapTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginBottom: 10 },
  mapText: { color: '#A8C0C9', textAlign: 'center', lineHeight: 21 },
  pill: { marginTop: 18, backgroundColor: '#245342', borderRadius: 30, paddingHorizontal: 16, paddingVertical: 8 },
  pillText: { color: '#9AF2C7', fontWeight: '700' },
  card: { backgroundColor: '#172235', borderRadius: 18, padding: 18, gap: 10 },
  cardTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  cardText: { color: '#A8B2C5', lineHeight: 20 },
  button: { backgroundColor: '#35C48B', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  buttonText: { color: '#071B13', fontWeight: '800' },
  footer: { color: '#64748B', textAlign: 'center', marginTop: 'auto', paddingBottom: 10 },
});
