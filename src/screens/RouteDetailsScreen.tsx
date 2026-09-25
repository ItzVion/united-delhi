import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Route as ApiRoute, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';

type Nav=NativeStackNavigationProp<RootStackParamList,'RouteDetails'>;
type RouteDetailsRoute=RouteProp<RootStackParamList,'RouteDetails'>;

export default function RouteDetailsScreen(){
  const navigation=useNavigation<Nav>();
  const {params}=useRoute<RouteDetailsRoute>();
  const {routeId,label}=params;
  const mapRef=useRef<WebView|null>(null);
  const [route,setRoute]=useState<ApiRoute|null>(null);
  const [stops,setStops]=useState<Stop[]>([]);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [loading,setLoading]=useState(true);
  const [mapReady,setMapReady]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    try{
      const result=await api.route(routeId);
      if(result.status==='OK'){setRoute(result.route);setStops(result.stops);setVehicles(result.vehicles);setError(null);}
      else setError('Route details are unavailable.');
    }catch(e){setError((e as Error).message||'Route details are unavailable.');}
    finally{setLoading(false);}
  },[routeId]);

  useEffect(()=>{setLoading(true);void load();const id=setInterval(()=>void load(),15000);return()=>clearInterval(id);},[load]);

  useEffect(()=>{
    if(!mapReady)return;
    const payload={
      stops:stops.map(s=>({id:s.stop_id,name:s.name,lat:s.latitude,lon:s.longitude})),
      buses:vehicles.map(v=>{const name=displayRouteName(v.routeShortName)||'BUS';const c=resolveRouteColor(name,v.routeColor,v.routeTextColor);return{id:v.id,route:name,color:c.background,textColor:c.text,lat:v.latitude,lon:v.longitude};})
    };
    mapRef.current?.injectJavaScript(`window.updateRouteMap(${JSON.stringify(payload)});true;`);
  },[mapReady,stops,vehicles]);

  const routeName=displayRouteName(route?.short_name)||displayRouteName(label)||'Bus route';
  const from=stops[0]?.name||'Starting stop';
  const to=stops[stops.length-1]?.name||'Ending stop';
  const c=resolveRouteColor(routeName,route?.route_color,route?.route_text_color);

  return <SafeAreaView style={styles.safe}>
    <View style={styles.topBar}>
      <Pressable onPress={()=>navigation.goBack()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
      <View style={styles.topCopy}><Text style={styles.eyebrow}>BUS ROUTE</Text><Text style={styles.title}>{routeName}</Text></View>
      <StatusPill label={error?'Unavailable':vehicles.length?(`${vehicles.length} live`):'No live buses'} tone={error?'danger':vehicles.length?'ok':'muted'}/>
    </View>

    {error?<View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>:null}

    <View style={styles.hero}>
      <View style={[styles.routeBadge,{backgroundColor:c.background}]}><Text style={[styles.routeBadgeText,{color:c.text}]}>{routeName}</Text></View>
      <View style={styles.heroCopy}>
        <Text style={styles.direction}>{from}</Text>
        <View style={styles.directionLine}><View style={styles.dot}/><View style={styles.line}/><View style={[styles.dot,{backgroundColor:colors.secondary,borderColor:colors.secondary}]}/></View>
        <Text style={styles.direction}>{to}</Text>
      </View>
    </View>

    <View style={styles.mapWrap}>
      <WebView ref={mapRef} style={styles.map} originWhitelist={['*']} javaScriptEnabled domStorageEnabled cacheEnabled userAgent="UnitedDelhi/1.0 (+https://github.com/ItzVion/united-delhi)" source={{html:buildRouteMapHtml()}} onLoadEnd={()=>setMapReady(true)}
        onMessage={event=>{try{const m=JSON.parse(event.nativeEvent.data);if(m.type==='stop'){const stop=stops.find(s=>s.stop_id===m.stopId);if(stop)navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name});}}catch{}}}/>
      <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text></View>
      <View pointerEvents="none" style={styles.mapPill}><View style={styles.liveDot}/><Text style={styles.mapPillText}>{vehicles.length?(`${vehicles.length} live on route`):'No live position on route'}</Text></View>
    </View>

    <View style={styles.summary}>
      <Metric value={String(stops.length)} label="stops"/>
      <Metric value={String(vehicles.length)} label="live buses"/>
      <Metric value={route?.long_name?'DTC':'—'} label="service"/>
    </View>

    {vehicles.length>0?<View style={styles.liveCard}>
      <View style={styles.liveHeader}><View><Text style={styles.liveTitle}>Live buses</Text><Text style={styles.liveSub}>Fresh positions matched to this route</Text></View><Text style={styles.liveCount}>{vehicles.length}</Text></View>
      {vehicles.slice(0,4).map(v=><View key={v.id} style={styles.busRow}><View style={[styles.miniBadge,{backgroundColor:c.background}]}><Text style={[styles.miniBadgeText,{color:c.text}]}>{routeName}</Text></View><View style={styles.busCopy}><Text style={styles.busId}>Live vehicle</Text><Text style={styles.busMeta}>{v.speedMps!=null?(`${(v.speedMps*3.6).toFixed(0)} km/h`):'Speed unavailable'} · observed just now</Text></View></View>)}
    </View>:null}

    <FlatList data={stops} keyExtractor={item=>item.stop_id} contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.listHeader}><Text style={styles.listTitle}>Stops in order</Text><Text style={styles.listHint}>Tap a stop for live arrivals</Text></View>}
      ListEmptyComponent={!loading?<Text style={styles.empty}>No stops found for this route.</Text>:<ActivityIndicator color={colors.accent}/>}
      renderItem={({item,index})=><Pressable style={styles.stopRow} onPress={()=>navigation.navigate('StopDetails',{stopId:item.stop_id,stopName:item.name})}>
        <View style={styles.timeline}><View style={[styles.dotStop,index===0||index===stops.length-1?styles.dotStopStrong:null]}/>{index<stops.length-1?<View style={styles.stopLine}/>:null}</View>
        <View style={styles.stopInfo}><Text style={styles.stopIndex}>{String(index+1).padStart(2,'0')}</Text><Text style={styles.stopName} numberOfLines={2}>{item.name}</Text></View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>}
    />
  </SafeAreaView>;
}

function Metric({value,label}:{value:string;label:string}){return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;}

function buildRouteMapHtml(){
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""><style>html,body,#map{margin:0;width:100%;height:100%;background:#eef2f1}.leaflet-control-zoom{border:0!important;box-shadow:0 2px 10px rgba(23,49,47,.16)!important;border-radius:10px!important;overflow:hidden}.leaflet-control-zoom a{border:0!important;color:#17312f!important}.stop-label{width:9px;height:9px;border-radius:50%;background:#0b746b;border:2px solid #fff}.bus-label{font:800 9px system-ui,sans-serif;white-space:nowrap;border-radius:8px;padding:3px 5px;border:2px solid #fff;box-shadow:0 2px 7px rgba(23,49,47,.22)}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>
const map=L.map('map',{preferCanvas:true,zoomControl:true,attributionControl:false,zoomSnap:.5}).setView([28.6139,77.209],12.5);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);const lineLayer=L.layerGroup().addTo(map),stopLayer=L.layerGroup().addTo(map),busLayer=L.layerGroup().addTo(map);let fitted=false;
window.updateRouteMap=function(data){lineLayer.clearLayers();stopLayer.clearLayers();busLayer.clearLayers();const line=data.stops.map(s=>[s.lat,s.lon]);if(line.length>1)L.polyline(line,{color:'#0b746b',weight:5,opacity:.9,lineCap:'round'}).addTo(lineLayer);const stopIcon=L.divIcon({className:'',html:'<div class="stop-label"></div>',iconSize:[13,13],iconAnchor:[6,6]});data.stops.forEach(s=>{const popup=document.createElement('div'),title=document.createElement('b'),button=document.createElement('button');title.textContent=s.name;button.textContent='View stop';button.type='button';button.style.marginTop='6px';button.onclick=()=>openStop(s.id);popup.append(title,document.createElement('br'),button);L.marker([s.lat,s.lon],{icon:stopIcon}).addTo(stopLayer).bindPopup(popup);});data.buses.forEach(v=>{const bg=valid(v.color)?v.color:'#0b746b',fg=valid(v.textColor)?v.textColor:'#fff';L.marker([v.lat,v.lon],{icon:L.divIcon({className:'',html:'<div class="bus-label" style="background:'+bg+';color:'+fg+'">'+esc(v.route)+'</div>',iconSize:[58,22],iconAnchor:[29,11]})}).addTo(busLayer);});if(!fitted&&(line.length||data.buses.length)){const points=[...line,...data.buses.map(v=>[v.lat,v.lon])];map.fitBounds(points,{padding:[18,18],maxZoom:13});fitted=true;}};function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}function valid(x){return /^#[0-9a-f]{6}$/i.test(String(x));}function esc(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}</script></body></html>`;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},topBar:{paddingHorizontal:16,paddingTop:7,paddingBottom:7,flexDirection:'row',alignItems:'center'},backButton:{width:40,height:40,alignItems:'center',justifyContent:'center'},back:{fontSize:36,color:colors.text},topCopy:{flex:1},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:colors.textMuted},title:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:2},
 error:{marginHorizontal:16,marginBottom:8,padding:10,borderRadius:12,backgroundColor:colors.dangerSoft},errorText:{fontSize:11,color:colors.danger,fontWeight:'700'},
 hero:{marginHorizontal:16,padding:13,borderRadius:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center'},routeBadge:{minWidth:66,height:42,paddingHorizontal:10,borderRadius:11,alignItems:'center',justifyContent:'center'},routeBadgeText:{fontSize:16,fontWeight:'900'},heroCopy:{flex:1,marginLeft:12},direction:{fontSize:12,fontWeight:'800',color:colors.text},directionLine:{height:15,flexDirection:'row',alignItems:'center',marginVertical:2},dot:{width:7,height:7,borderRadius:4,borderWidth:2,borderColor:colors.accent,backgroundColor:colors.surface},line:{width:34,height:2,backgroundColor:colors.border,marginHorizontal:5},
 mapWrap:{height:245,marginHorizontal:16,marginTop:10,borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:colors.border},map:{flex:1},mapAttribution:{position:'absolute',right:7,bottom:6,backgroundColor:'rgba(255,255,255,.9)',paddingHorizontal:5,paddingVertical:2,borderRadius:4},mapAttributionText:{fontSize:7,color:'#52625f'},mapPill:{position:'absolute',left:9,top:9,flexDirection:'row',alignItems:'center',backgroundColor:'rgba(255,255,255,.94)',paddingHorizontal:8,paddingVertical:5,borderRadius:9},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:colors.success,marginRight:5},mapPillText:{fontSize:9,fontWeight:'900',color:colors.text},
 summary:{marginHorizontal:16,marginTop:9,paddingVertical:11,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-around'},metric:{alignItems:'center',minWidth:70},metricValue:{fontSize:17,fontWeight:'900',color:colors.text},metricLabel:{fontSize:9,color:colors.textMuted,marginTop:2},
 liveCard:{marginHorizontal:16,marginTop:9,padding:12,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},liveHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},liveTitle:{fontSize:14,fontWeight:'900',color:colors.text},liveSub:{fontSize:9,color:colors.textMuted,marginTop:2},liveCount:{fontSize:17,fontWeight:'900',color:colors.accent},busRow:{flexDirection:'row',alignItems:'center',paddingTop:10},miniBadge:{minWidth:52,height:30,borderRadius:8,alignItems:'center',justifyContent:'center',paddingHorizontal:6},miniBadgeText:{fontSize:10,fontWeight:'900'},busCopy:{marginLeft:9,flex:1},busId:{fontSize:11,fontWeight:'800',color:colors.text},busMeta:{fontSize:9,color:colors.textMuted,marginTop:2},
 list:{paddingHorizontal:16,paddingTop:12,paddingBottom:28},listHeader:{paddingBottom:7},listTitle:{fontSize:16,fontWeight:'900',color:colors.text},listHint:{fontSize:10,color:colors.textMuted,marginTop:2},empty:{color:colors.textMuted,paddingVertical:20},
 stopRow:{minHeight:56,flexDirection:'row',alignItems:'stretch'},timeline:{width:28,alignItems:'center'},dotStop:{width:9,height:9,borderRadius:5,backgroundColor:colors.surface,borderWidth:2,borderColor:colors.accent,marginTop:16},dotStopStrong:{width:12,height:12,borderRadius:6,backgroundColor:colors.accent},stopLine:{width:2,flex:1,backgroundColor:colors.border,marginTop:2},stopInfo:{flex:1,paddingVertical:10,paddingLeft:3},stopIndex:{fontSize:8,color:colors.textMuted,fontWeight:'800'},stopName:{fontSize:13,color:colors.text,fontWeight:'800',marginTop:1},chevron:{fontSize:23,color:colors.textMuted,alignSelf:'center'}
});
