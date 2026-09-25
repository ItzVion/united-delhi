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

type Nav=NativeStackNavigationProp<RootStackParamList,'Nearby'>;

export default function NearbyScreen(){
  const navigation=useNavigation<Nav>();
  const [location,setLocation]=useState<Location.LocationObject|null>(null);
  const [stops,setStops]=useState<Stop[]>([]);
  const [buses,setBuses]=useState<Vehicle[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      if(!(await confirmLocationUse()))throw new Error('Location use was cancelled.');
      let permission=await Location.getForegroundPermissionsAsync();
      if(permission.status!=='granted')permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('Location permission is off. Enable it to use Nearby.');
      const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});setLocation(current);
      const [sr,vr]=await Promise.all([api.nearbyStops(current.coords.latitude,current.coords.longitude,12),api.vehicles()]);
      setStops(sr.status==='OK'?sr.stops:[]);
      setBuses(vr.status==='OK'?vr.vehicles.filter(v=>haversineMeters(current.coords.latitude,current.coords.longitude,v.latitude,v.longitude)<=3000).sort((a,b)=>haversineMeters(current.coords.latitude,current.coords.longitude,a.latitude,a.longitude)-haversineMeters(current.coords.latitude,current.coords.longitude,b.latitude,b.longitude)).slice(0,12):[]);
    }catch(e){setError((e as Error).message||'Nearby is unavailable.');setStops([]);setBuses([]);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();},[load]);

  return <ScrollView style={styles.safe} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable onPress={()=>navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View style={styles.headCopy}><Text style={styles.eyebrow}>AROUND YOU</Text><Text style={styles.title}>Nearby</Text><Text style={styles.subtitle}>{location?'Live transit around your location':'Find stops and buses nearby'}</Text></View><Pressable style={styles.refresh} onPress={()=>void load()}><Text style={styles.refreshText}>Refresh</Text></Pressable></View>

    {error?<View style={styles.error}><Text style={styles.errorTitle}>Nearby unavailable</Text><Text style={styles.errorText}>{error}</Text></View>:null}
    {loading?<View style={styles.loading}><ActivityIndicator color={colors.accent}/><Text style={styles.loadingText}>Finding transit around you…</Text></View>:null}

    {!loading?<><View style={styles.hero}><View style={styles.heroIcon}><Text style={styles.heroIconText}>●</Text></View><View style={styles.heroCopy}><Text style={styles.heroTitle}>{stops.length} nearby stops</Text><Text style={styles.heroSub}>{buses.length?buses.length+' live buses within 3 km':'No live buses within 3 km right now'}</Text></View></View>
      <SectionTitle title="Bus stops" count={stops.length}/>
      <View style={styles.card}>{stops.map(stop=><Pressable key={stop.stop_id} style={styles.stopRow} onPress={()=>navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name})}><View style={styles.stopDot}/><View style={styles.main}><Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text><Text style={styles.meta}>{stop.distance_m!=null?Math.round(stop.distance_m)+' m away':'Nearby stop'}</Text></View><Text style={styles.arrow}>›</Text></Pressable>)}{!stops.length?<Text style={styles.muted}>No stops were found nearby.</Text>:null}</View>

      <SectionTitle title="Live buses" count={buses.length}/>
      <View style={styles.card}>{buses.map(bus=>{const name=displayRouteName(bus.routeShortName);if(!name||!bus.routeId)return null;const rc=resolveRouteColor(name,bus.routeColor,bus.routeTextColor);const distance=location?Math.round(haversineMeters(location.coords.latitude,location.coords.longitude,bus.latitude,bus.longitude)):null;const ageMs=Date.now()-Date.parse(bus.observedAt);const age=Number.isFinite(ageMs)?Math.max(0,Math.round(ageMs/1000)):null;return <Pressable key={bus.id} style={styles.busRow} onPress={()=>navigation.navigate('RouteDetails',{routeId:bus.routeId!,label:name})}><View style={[styles.routeBadge,{backgroundColor:rc.background}]}><Text style={[styles.routeText,{color:rc.text}]}>{name}</Text></View><View style={styles.main}><Text style={styles.busDistance}>{bus.toStop?'To '+bus.toStop:(distance!=null?distance+' m away':'Nearby live bus')}</Text><Text style={styles.meta}>{distance!=null?distance+' m away · ':''}{age===null?'Live position':age<60?'Updated just now':'Updated '+Math.floor(age/60)+' min ago'}</Text></View><Text style={styles.arrow}>›</Text></Pressable>})}{!buses.length?<Text style={styles.muted}>No live buses detected within 3 km right now.</Text>:null}</View>
    </>:null}
  </ScrollView>;
}
function SectionTitle({title,count}:{title:string;count:number}){return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.count}>{count}</Text></View>;}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},content:{padding:16,paddingBottom:30},header:{flexDirection:'row',alignItems:'center',marginBottom:10},back:{width:40,height:40,alignItems:'center',justifyContent:'center'},backText:{fontSize:36,color:colors.text},headCopy:{flex:1},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:colors.textMuted},title:{fontSize:23,fontWeight:'900',color:colors.text,marginTop:1},subtitle:{fontSize:10,color:colors.textMuted,marginTop:2},refresh:{paddingHorizontal:10,paddingVertical:8,borderWidth:1,borderColor:colors.border,borderRadius:10,backgroundColor:colors.surface},refreshText:{fontSize:10,fontWeight:'900',color:colors.accent},
 error:{padding:12,borderRadius:13,backgroundColor:colors.dangerSoft,marginBottom:9},errorTitle:{fontSize:12,fontWeight:'900',color:colors.danger},errorText:{fontSize:11,color:colors.textMuted,marginTop:2},loading:{paddingVertical:45,alignItems:'center'},loadingText:{fontSize:11,color:colors.textMuted,marginTop:8},
 hero:{padding:14,borderRadius:17,backgroundColor:colors.accent,borderWidth:1,borderColor:colors.accent,flexDirection:'row',alignItems:'center',marginBottom:15},heroIcon:{width:40,height:40,borderRadius:13,backgroundColor:'rgba(255,255,255,.15)',alignItems:'center',justifyContent:'center'},heroIconText:{color:'#fff',fontSize:12},heroCopy:{marginLeft:10},heroTitle:{fontSize:15,fontWeight:'900',color:'#fff'},heroSub:{fontSize:10,color:'#DDF1ED',marginTop:2},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:7,marginTop:2},sectionTitle:{fontSize:15,fontWeight:'900',color:colors.text},count:{minWidth:27,textAlign:'center',paddingVertical:4,paddingHorizontal:8,borderRadius:999,backgroundColor:colors.accentSoft,color:colors.accent,fontWeight:'900',fontSize:10},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,paddingHorizontal:12,marginBottom:15},
 stopRow:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderBottomWidth:1,borderBottomColor:colors.border},stopDot:{width:10,height:10,borderRadius:5,borderWidth:2,borderColor:colors.accent,backgroundColor:colors.surface},main:{flex:1,marginLeft:10},stopName:{fontSize:12,fontWeight:'800',color:colors.text},busDistance:{fontSize:11,fontWeight:'800',color:colors.text},meta:{fontSize:9,color:colors.textMuted,marginTop:2},arrow:{fontSize:23,color:colors.textMuted},busRow:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderBottomWidth:1,borderBottomColor:colors.border},routeBadge:{minWidth:55,height:31,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:7},routeText:{fontSize:10,fontWeight:'900'},muted:{fontSize:11,lineHeight:17,color:colors.textMuted,paddingVertical:13}
});
