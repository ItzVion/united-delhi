import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import type { MetroRoute, MetroRouteResponse, MetroResponse } from '../api/client';
import { colors } from '../theme';

const lineColor=(value?:string|null)=>{
  const raw=String(value||'').trim();
  if(/^#[0-9a-f]{6}$/i.test(raw))return raw;
  if(/^[0-9a-f]{6}$/i.test(raw))return '#'+raw;
  return colors.accent;
};

export default function MetroScreen(){
  const [catalogue,setCatalogue]=useState<MetroResponse|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [selectedRoute,setSelectedRoute]=useState<MetroRoute|null>(null);
  const [routeData,setRouteData]=useState<MetroRouteResponse|null>(null);
  const [routeLoading,setRouteLoading]=useState(false);
  const [routeError,setRouteError]=useState('');
  const [activeDirection,setActiveDirection]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const response=await api.metro();
      if(response.status!=='OK'||!Array.isArray(response.routes))throw new Error(response.reason||'Metro network data is unavailable.');
      setCatalogue(response);
    }catch(e){setError((e as Error).message||'Metro network data is unavailable.')}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const openRoute=useCallback(async(route:MetroRoute)=>{
    setSelectedRoute(route);setRouteData(null);setRouteLoading(true);setRouteError('');setActiveDirection('');
    try{
      const response=await api.metroRoute(route.route_id);
      if(response.status!=='OK')throw new Error(response.reason||'Stations for this line are unavailable.');
      setRouteData(response);
    }catch(e){setRouteError((e as Error).message||'Stations for this line are unavailable.')}
    finally{setRouteLoading(false)}
  },[]);
  const routes=useMemo(()=>{
    const all=catalogue?.routes||[],term=query.trim().toLowerCase();
    return term?all.filter(r=>[r.short_name,r.long_name,r.route_id].some(v=>String(v||'').toLowerCase().includes(term))):all;
  },[catalogue,query]);
  const directions=routeData?.directions||[];
  const selectedDirection=directions.find((d,i)=>String(d.directionId??i)===activeDirection)||directions[0]||null;
  const stations=selectedDirection?.stops||routeData?.stops||[];

  return <SafeAreaView style={styles.safe}>
    <View style={styles.headerRow}>
      {selectedRoute?<Pressable onPress={()=>{setSelectedRoute(null);setRouteData(null);setRouteError('')}} style={styles.back}><Text style={styles.backText}>‹  Lines</Text></Pressable>:<View style={styles.backSpacer}/>}
      <View style={styles.headCopy}><Text style={styles.eyebrow}>DELHI TRANSIT</Text><Text style={styles.title}>{selectedRoute?(selectedRoute.short_name||'Metro line'):'Delhi Metro'}</Text></View>
      <Pressable style={styles.refresh} onPress={()=>selectedRoute?void openRoute(selectedRoute):void load()}><Text style={styles.refreshText}>↻</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {selectedRoute?<>
        <View style={styles.routeHeading}>
          <View style={[styles.badge,{backgroundColor:lineColor(selectedRoute.route_color)}]}><Text style={styles.badgeText}>{selectedRoute.short_name||'METRO'}</Text></View>
          <View style={styles.routeCopy}><Text style={styles.routeTitle}>{selectedRoute.long_name||selectedRoute.short_name||'Metro line'}</Text><Text style={styles.meta}>Station sequence from static network data</Text></View>
        </View>
        {routeLoading?<View style={styles.center}><ActivityIndicator color={colors.accent}/><Text style={styles.helper}>Loading stations…</Text></View>:null}
        {routeError?<View style={styles.notice}><Text style={styles.errorTitle}>Could not load stations</Text><Text style={styles.helper}>{routeError}</Text><Pressable style={styles.button} onPress={()=>void openRoute(selectedRoute)}><Text style={styles.buttonText}>Retry</Text></Pressable></View>:null}
        {!routeLoading&&!routeError&&routeData?<>
          {directions.length>1?<View style={styles.directions}>{directions.map((d,i)=>{const key=String(d.directionId??i),on=String(selectedDirection?.directionId??0)===key;return <Pressable key={key} style={[styles.direction,on?styles.directionActive:null]} onPress={()=>setActiveDirection(key)}><Text style={styles.directionLabel}>Direction {i+1}</Text><Text style={styles.directionText}>{d.fromStop||d.stops[0]?.name||'Start'} → {d.toStop||d.stops[d.stops.length-1]?.name||'End'}</Text></Pressable>})}</View>:null}
          <Text style={styles.sectionTitle}>{stations.length} stations</Text>
          {stations.length?stations.map((station,i)=><View key={station.stop_id+'-'+i} style={styles.stationRow}><View style={[styles.stationDot,{backgroundColor:lineColor(selectedRoute.route_color)}]}/><View style={styles.stationCopy}><Text style={styles.stationName}>{station.name}</Text><Text style={styles.stationCode}>{station.stop_id}</Text></View></View>):<View style={styles.notice}><Text style={styles.helper}>No station sequence is available for this line yet.</Text></View>}
        </>:null}
        <Text style={styles.footer}>Metro information is static network data. Live train positions are not available in this screen.</Text>
      </>:<>
        <Text style={styles.subtitle}>Explore lines and stations across the metro network.</Text>
        {catalogue?.meta?.imported_at?<Text style={styles.updated}>Network data imported {new Date(catalogue.meta.imported_at).toLocaleDateString()}</Text>:null}
        <View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search lines or stations" placeholderTextColor={colors.textMuted} style={styles.searchInput}/>{query?<Pressable onPress={()=>setQuery('')}><Text style={styles.clear}>×</Text></Pressable>:null}</View>
        {loading?<View style={styles.center}><ActivityIndicator color={colors.accent}/><Text style={styles.helper}>Loading metro network…</Text></View>:error?<View style={styles.notice}><Text style={styles.errorTitle}>Metro data unavailable</Text><Text style={styles.helper}>{error}</Text><Pressable style={styles.button} onPress={()=>void load()}><Text style={styles.buttonText}>Try again</Text></Pressable></View>:<>
          <View style={styles.countRow}><Text style={styles.sectionTitle}>Metro lines</Text><Text style={styles.count}>{routes.length}</Text></View>
          {routes.length?routes.map(route=><Pressable key={route.route_id} style={styles.routeRow} onPress={()=>void openRoute(route)}><View style={[styles.lineStripe,{backgroundColor:lineColor(route.route_color)}]}/><View style={styles.routeCopy}><Text style={styles.routeTitle}>{route.short_name||route.long_name||route.route_id}</Text><Text style={styles.routeSub} numberOfLines={2}>{route.long_name||route.short_name||route.route_id}</Text><Text style={styles.meta}>{route.route_id}</Text></View><Text style={styles.chevron}>›</Text></Pressable>):<View style={styles.notice}><Text style={styles.errorTitle}>No matching lines</Text><Text style={styles.helper}>Try a line name or route code.</Text></View>}
          <Text style={styles.footer}>{catalogue?.stops?.length||0} stations in the static dataset. Live train tracking is not provided.</Text>
        </>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 headerRow:{minHeight:72,flexDirection:'row',alignItems:'center',paddingHorizontal:16,backgroundColor:colors.accentDark},
 back:{minWidth:62,paddingVertical:10},backSpacer:{width:62},backText:{fontSize:12,fontWeight:'800',color:colors.secondary},
 headCopy:{flex:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:colors.secondary},title:{fontSize:22,fontWeight:'900',color:'#FFFFFF',marginTop:3},
 refresh:{width:36,height:36,alignItems:'center',justifyContent:'center',backgroundColor:'#FFFFFF18'},refreshText:{fontSize:21,fontWeight:'800',color:'#FFFFFF'},
 content:{padding:16,paddingBottom:32},subtitle:{fontSize:13,lineHeight:19,color:colors.textMuted,marginBottom:6},updated:{fontSize:10,color:colors.textMuted,marginTop:2,marginBottom:12},
 search:{height:46,flexDirection:'row',alignItems:'center',paddingHorizontal:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,marginTop:12,marginBottom:14},searchIcon:{fontSize:22,color:colors.accent,marginRight:8},searchInput:{flex:1,color:colors.text,fontSize:14,paddingVertical:0},clear:{fontSize:21,color:colors.textMuted,paddingHorizontal:4},
 countRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:4,marginBottom:8},sectionTitle:{fontSize:12,fontWeight:'900',letterSpacing:.5,color:colors.textMuted,textTransform:'uppercase'},count:{fontSize:12,fontWeight:'900',color:colors.accent,backgroundColor:colors.surfaceAlt,paddingHorizontal:9,paddingVertical:4},
 routeRow:{minHeight:74,flexDirection:'row',alignItems:'center',padding:12,marginBottom:8,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},lineStripe:{width:5,alignSelf:'stretch',marginRight:12},routeCopy:{flex:1},routeTitle:{fontSize:14,fontWeight:'900',color:colors.text},routeSub:{fontSize:11,lineHeight:15,color:colors.textMuted,marginTop:3},meta:{fontSize:9,color:colors.textMuted,marginTop:3},chevron:{fontSize:24,color:colors.textMuted,marginLeft:10},
 routeHeading:{flexDirection:'row',alignItems:'center',padding:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,marginBottom:12},badge:{minWidth:52,alignItems:'center',justifyContent:'center',paddingHorizontal:9,paddingVertical:9},badgeText:{fontSize:10,fontWeight:'900',color:'#FFFFFF'},directions:{gap:8,marginBottom:14},direction:{padding:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},directionActive:{borderColor:colors.accent,backgroundColor:colors.surfaceAlt},directionLabel:{fontSize:9,color:colors.textMuted,textTransform:'uppercase',fontWeight:'900'},directionText:{fontSize:12,fontWeight:'800',color:colors.text,marginTop:4},
 stationRow:{minHeight:56,flexDirection:'row',alignItems:'center',paddingVertical:9,paddingHorizontal:12,borderBottomWidth:1,borderColor:colors.border},stationDot:{width:10,height:10,borderRadius:5,marginRight:12},stationCopy:{flex:1},stationName:{fontSize:12,fontWeight:'800',color:colors.text},stationCode:{fontSize:9,color:colors.textMuted,marginTop:2},
 center:{alignItems:'center',padding:28},helper:{fontSize:12,lineHeight:18,color:colors.textMuted,marginTop:5},notice:{padding:16,marginTop:12,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},errorTitle:{fontSize:14,fontWeight:'900',color:colors.text},button:{alignSelf:'flex-start',paddingHorizontal:16,paddingVertical:9,marginTop:10,backgroundColor:colors.accentDark},buttonText:{fontSize:11,fontWeight:'900',color:'#FFFFFF'},footer:{fontSize:10,lineHeight:16,color:colors.textMuted,marginTop:20}
});
