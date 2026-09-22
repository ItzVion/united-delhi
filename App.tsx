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
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('Location permission is required for nearby stops.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(current);
      setStatus('Location ready');
    } catch {
      setStatus('Could not get your location');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { locate(); }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.brand}>United Delhi</Text>
        <Text style={styles.subtitle}>DTC buses, stops and routes — in one place.</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a bus or stop"
          placeholderTextColor="#7D8799"
          style={styles.input}
        />
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapTitle}>Live buses</Text>
          <Text style={styles.mapText}>The live Delhi map will appear here when DTC realtime data is connected.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nearby</Text>
          <Text style={styles.cardText}>{status}</Text>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Pressable style={styles.button} onPress={locate}>
              <Text style={styles.buttonText}>{location ? 'Refresh location' : 'Use my location'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  container: { flex: 1, padding: 20, gap: 14 },
  brand: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', marginTop: 18 },
  subtitle: { color: '#A8B2C5', fontSize: 15 },
  input: { height: 52, borderRadius: 14, paddingHorizontal: 16, backgroundColor: '#172235', color: '#FFFFFF', fontSize: 15 },
  mapPlaceholder: { height: 300, borderRadius: 22, backgroundColor: '#182C3B', alignItems: 'center', justifyContent: 'center', padding: 28 },
  mapTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  mapText: { color: '#A8C0C9', textAlign: 'center', lineHeight: 21, marginTop: 10 },
  card: { backgroundColor: '#172235', borderRadius: 18, padding: 18, gap: 10 },
  cardTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  cardText: { color: '#A8B2C5', lineHeight: 20 },
  button: { backgroundColor: '#35C48B', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  buttonText: { color: '#071B13', fontWeight: '800' },
});