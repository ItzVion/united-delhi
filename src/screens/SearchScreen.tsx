import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, SearchResult } from '../api/client';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Search'>;

export default function SearchScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.search(value);
        if (!cancelled) setResults(result.status === 'OK' ? result.results : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
        <View style={styles.titleWrap}><Text style={styles.title}>Search</Text><Text style={styles.subtitle}>Routes and stops across Delhi</Text></View>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search route number or stop"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
        {query ? <Pressable onPress={() => setQuery('')}><Text style={styles.clear}>×</Text></Pressable> : null}
      </View>

      {query.trim().length < 2 ? (
        <View style={styles.hintCard}>
          <Text style={styles.hintTitle}>Try a route or stop</Text>
          <Text style={styles.hintText}>Examples: 721, 801, Dwarka, Palam, Airport</Text>
          <View style={styles.exampleRow}>
            {['721', '801', 'Dwarka', 'Palam'].map(item => (
              <Pressable key={item} style={styles.example} onPress={() => setQuery(item)}><Text style={styles.exampleText}>{item}</Text></Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <FlatList
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={item => `${item.type}-${item.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={results.length > 0 ? <Text style={styles.resultsTitle}>{results.length} matches</Text> : null}
        ListEmptyComponent={!loading && query.trim().length >= 2 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No matches</Text><Text style={styles.emptyText}>Try a route number, stop name, or part of a destination.</Text></View> : null}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => item.type === 'stop'
              ? navigation.navigate('StopDetails', { stopId: item.id, stopName: item.label })
              : navigation.navigate('RouteDetails', { routeId: item.id, label: item.label })}
          >
            <View style={[styles.typeIcon, item.type === 'route' ? styles.routeIcon : styles.stopIcon]}>
              <Text style={styles.typeIconText}>{item.type === 'route' ? 'BUS' : '•'}</Text>
            </View>
            <View style={styles.resultText}>
              <Text style={styles.label} numberOfLines={2}>{item.label}</Text>
              <Text style={styles.typeLabel}>{item.type === 'route' ? 'Bus route' : 'Bus stop'}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  topBar:{paddingHorizontal:18,paddingTop:10,paddingBottom:10,flexDirection:'row',alignItems:'center'},
  backButton:{width:40,height:40,alignItems:'center',justifyContent:'center'},back:{fontSize:36,lineHeight:38,color:colors.text},
  titleWrap:{marginLeft:2},title:{fontSize:23,fontWeight:'900',color:colors.text},subtitle:{fontSize:12,color:colors.textMuted,marginTop:2},
  searchBox:{marginHorizontal:18,height:54,borderRadius:17,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',paddingHorizontal:14},
  searchIcon:{fontSize:27,color:colors.text,marginRight:8,marginTop:-3},input:{flex:1,color:colors.text,fontSize:15},clear:{fontSize:26,color:colors.textMuted,paddingHorizontal:4},
  hintCard:{margin:18,padding:16,borderRadius:16,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},hintTitle:{fontSize:16,fontWeight:'800',color:colors.text},hintText:{fontSize:13,color:colors.textMuted,marginTop:4},exampleRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},example:{paddingHorizontal:12,paddingVertical:7,borderRadius:999,backgroundColor:colors.accentSoft},exampleText:{fontSize:12,fontWeight:'800',color:colors.accent},
  list:{paddingHorizontal:18,paddingTop:12,paddingBottom:30},empty:{paddingVertical:28,paddingHorizontal:8,alignItems:'center'},emptyTitle:{fontSize:16,fontWeight:'900',color:colors.text,textAlign:'center'},emptyText:{fontSize:13,lineHeight:19,color:colors.textMuted,textAlign:'center',marginTop:5},resultsTitle:{fontSize:13,fontWeight:'800',color:colors.textMuted,marginBottom:8},row:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:15,padding:13,marginBottom:8,flexDirection:'row',alignItems:'center'},typeIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},routeIcon:{backgroundColor:colors.accent},stopIcon:{backgroundColor:colors.successSoft},typeIconText:{fontSize:10,fontWeight:'900',color:'#fff'},resultText:{flex:1,marginLeft:11},label:{fontSize:14,fontWeight:'800',color:colors.text},typeLabel:{fontSize:11,color:colors.textMuted,marginTop:3},chevron:{fontSize:26,color:colors.textMuted}
});