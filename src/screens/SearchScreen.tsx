import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, SearchResult } from '../api/client';
import { colors } from '../theme';
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';
import type { RootStackParamList } from '../navigation/types';

type Nav=NativeStackNavigationProp<RootStackParamList,'Search'>;

export default function SearchScreen(){
  const navigation=useNavigation<Nav>();
  const [query,setQuery]=useState('');const [results,setResults]=useState<SearchResult[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    const value=query.trim();
    if(value.length<2){setResults([]);setLoading(false);setError(null);return;}
    let cancelled=false;setLoading(true);setError(null);
    const timer=setTimeout(async()=>{try{const result=await api.search(value);if(!cancelled)setResults(result.status==='OK'?result.results:[]);}catch(e){if(!cancelled){setResults([]);setError((e as Error).message||'Search is temporarily unavailable.');}}finally{if(!cancelled)setLoading(false);},220);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[query]);

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Pressable onPress={()=>navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View><Text style={styles.eyebrow}>FIND YOUR BUS</Text><Text style={styles.title}>Search</Text></View></View>
    <View style={styles.searchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Route number, stop or place" placeholderTextColor={colors.textMuted} style={styles.input} autoCorrect={false} returnKeyType="search"/>{loading?<ActivityIndicator size="small" color={colors.accent}/>:null}{query?<Pressable onPress={()=>setQuery('')}><Text style={styles.clear}>×</Text></Pressable>:null}</View>
    {query.trim().length<2?<View style={styles.suggestions}><Text style={styles.suggestTitle}>Search Delhi transit</Text><Text style={styles.suggestText}>Try a route number or a stop name.</Text><View style={styles.chips}>{['801','801STL','772','Dwarka','Palam'].map(x=><Pressable key={x} style={styles.chip} onPress={()=>setQuery(x)}><Text style={styles.chipText}>{x}</Text></Pressable>)}</View></View>:null}
    {error?<View style={styles.error}><Text style={styles.errorTitle}>Search unavailable</Text><Text style={styles.errorText}>{error}</Text></View>:null}
    <FlatList
      keyboardShouldPersistTaps="handled" data={results} keyExtractor={item=>`${item.type}-${item.id}`} contentContainerStyle={styles.list}
      ListHeaderComponent={results.length?<Text style={styles.resultsTitle}>{results.length} results</Text>:null}
      ListEmptyComponent={!loading&&!error&&query.trim().length>=2?<View style={styles.empty}><Text style={styles.emptyTitle}>Nothing found</Text><Text style={styles.emptyText}>Try another route number, stop name or destination.</Text></View>:null}
      renderItem={({item})=><Pressable style={styles.card} onPress={()=>item.type==='stop'?navigation.navigate('StopDetails',{stopId:item.id,stopName:item.label}):navigation.navigate('RouteDetails',{routeId:item.id,label:item.label})}>
        {item.type==='route'?<RouteResult item={item}/>:<StopResult item={item}/>}
      </Pressable>}
    />
  </SafeAreaView>;
}

function RouteResult({item}:{item:SearchResult}){
  const name=displayRouteName(item.label)||item.label;const c=resolveRouteColor(name,item.routeColor,item.routeTextColor);
  return <View style={styles.routeResult}>
    <View style={styles.routeTop}><View style={[styles.routeBadge,{backgroundColor:c.background}]}><Text style={[styles.routeBadgeText,{color:c.text}]}>{name}</Text></View><View style={styles.routeType}><Text style={styles.routeTypeTitle}>Bus route</Text><Text style={styles.routeTypeSub}>Direction</Text></View><Text style={styles.arrow}>›</Text></View>
    {(item.fromStop||item.toStop)?<View style={styles.direction}><View style={styles.directionRail}><View style={styles.directionDot}/><View style={styles.directionLine}/><View style={[styles.directionDot,{backgroundColor:colors.secondary,borderColor:colors.secondary}]}/></View><View style={styles.directionCopy}><Text style={styles.directionFrom} numberOfLines={1}>{item.fromStop||'Starting stop'}</Text><Text style={styles.directionTo} numberOfLines={1}>{item.toStop||'Ending stop'}</Text></View></View>:null}
  </View>;
}
function StopResult({item}:{item:SearchResult}){return <View style={styles.stopResult}><View style={styles.stopIcon}><Text style={styles.stopIconText}>●</Text></View><View style={styles.stopCopy}><Text style={styles.stopName} numberOfLines={1}>{item.label}</Text><Text style={styles.stopType}>Bus stop</Text></View><Text style={styles.arrow}>›</Text></View>;}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},header:{paddingHorizontal:16,paddingTop:7,paddingBottom:10,flexDirection:'row',alignItems:'center'},back:{width:40,height:40,alignItems:'center',justifyContent:'center'},backText:{fontSize:36,color:colors.text},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:colors.textMuted},title:{fontSize:22,fontWeight:'900',color:colors.text,marginTop:2},
 searchBox:{marginHorizontal:16,height:50,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',paddingHorizontal:13},searchIcon:{fontSize:23,color:colors.text,marginRight:8},input:{flex:1,color:colors.text,fontSize:14},clear:{fontSize:25,color:colors.textMuted,paddingHorizontal:4},
 suggestions:{margin:16,padding:15,borderRadius:17,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},suggestTitle:{fontSize:15,fontWeight:'900',color:colors.text},suggestText:{fontSize:11,color:colors.textMuted,marginTop:3},chips:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:12},chip:{paddingHorizontal:11,paddingVertical:7,borderRadius:999,backgroundColor:colors.accentSoft},chipText:{fontSize:10,fontWeight:'900',color:colors.accent},
 error:{marginHorizontal:16,marginTop:2,padding:11,borderRadius:13,backgroundColor:colors.dangerSoft},errorTitle:{fontSize:12,fontWeight:'900',color:colors.danger},errorText:{fontSize:11,color:colors.textMuted,marginTop:2},
 list:{paddingHorizontal:16,paddingTop:10,paddingBottom:30},resultsTitle:{fontSize:11,fontWeight:'900',color:colors.textMuted,marginBottom:7},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,marginBottom:8,overflow:'hidden'},routeResult:{padding:13},routeTop:{flexDirection:'row',alignItems:'center'},routeBadge:{minWidth:58,height:36,paddingHorizontal:9,borderRadius:10,alignItems:'center',justifyContent:'center'},routeBadgeText:{fontSize:15,fontWeight:'900'},routeType:{flex:1,marginLeft:10},routeTypeTitle:{fontSize:12,fontWeight:'900',color:colors.text},routeTypeSub:{fontSize:9,color:colors.textMuted,marginTop:2},arrow:{fontSize:23,color:colors.textMuted},direction:{flexDirection:'row',marginTop:11,paddingTop:10,borderTopWidth:1,borderTopColor:colors.border},directionRail:{width:15,alignItems:'center',paddingTop:2},directionDot:{width:7,height:7,borderRadius:4,borderWidth:2,borderColor:colors.accent,backgroundColor:colors.surface},directionLine:{height:15,width:2,backgroundColor:colors.border,marginVertical:2},directionCopy:{flex:1,marginLeft:8},directionFrom:{fontSize:11,fontWeight:'800',color:colors.text},directionTo:{fontSize:11,fontWeight:'800',color:colors.text,marginTop:5},
 stopResult:{padding:12,flexDirection:'row',alignItems:'center'},stopIcon:{width:36,height:36,borderRadius:11,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},stopIconText:{fontSize:10,color:colors.accent},stopCopy:{flex:1,marginLeft:10},stopName:{fontSize:13,fontWeight:'800',color:colors.text},stopType:{fontSize:9,color:colors.textMuted,marginTop:2},
 empty:{alignItems:'center',padding:35},emptyTitle:{fontSize:15,fontWeight:'900',color:colors.text},emptyText:{fontSize:11,color:colors.textMuted,textAlign:'center',marginTop:4,lineHeight:17}
});
