import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { hasEvidenceBackedVehicleColor, resolveVehicleColor } from '../lib/vehicleColor';

type Nav=NativeStackNavigationProp<RootStackParamList,'RouteDetails'>;
type RouteDetailsRoute=RouteProp<RootStackParamList,'RouteDetails'>;

export default function RouteDetailsScreen(){
  const navigation=useNavigation<Nav>();
  const {params}=useRoute<RouteDetailsRoute>();
  const {routeId,label}=params;
  const mapRef=useRef<WebView|null>(null);
  const routeMapSource=useMemo(()=>({html:buildRouteMapHtml()}),[]);
  const [route,setRoute]=useState<ApiRoute|null>(null);
  const [stops,setStops]=useState<Stop[]>([]);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [loading,setLoading]=useState(true);
  const [mapReady,setMapReady]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [selectedBus,setSelectedBus]=useState<Vehicle|null>(null);
  const requestInFlightRef=useRef(false);
  const refreshPendingRef=useRef(false);
  const requestIdRef=useRef(0);
  const loadRef=useRef<()=>void>(()=>{});

  const load=useCallback(async()=>{
    if(requestInFlightRef.current){refreshPendingRef.current=true;return;}
    requestInFlightRef.current=true;
    const requestId=++requestIdRef.current;
    try{
      const result=await api.route(routeId);
      if(requestId!==requestIdRef.current)return;
      if(result.status==='OK'){setRoute(result.route);setStops(result.stops);setVehicles(result.vehicles);setError(null);}
      else setError('Route details are unavailable.');
    }catch(e){if(requestId===requestIdRef.current)setError((e as Error).message||'Route details are unavailable.');}
    finally{
      requestInFlightRef.current=false;
      if(requestId===requestIdRef.current)setLoading(false);
      if(refreshPendingRef.current){refreshPendingRef.current=false;setTimeout(()=>loadRef.current(),0);}
    }
  },[routeId]);
  loadRef.current=()=>{void load()};

  useEffect(()=>{requestIdRef.current++;setLoading(true);void load();const id=setInterval(()=>void load(),15000);return()=>{clearInterval(id);requestIdRef.current++;refreshPendingRef.current=false;}},[load]);

  useEffect(()=>{
    if(!mapReady)return;
    const payload={
      stops:stops.map(s=>({id:s.stop_id,name:s.name,lat:s.latitude,lon:s.longitude})),
      buses:vehicles.flatMap(v=>{const name=displayRouteName(v.routeShortName)||displayRouteName(v.routeId);if(!name)return [];const c=resolveVehicleColor(v);const vehicle=name;return[{id:v.id,route:name,vehicle,color:c.background,textColor:c.text,colourKnown:hasEvidenceBackedVehicleColor(v),colourEstimated:false,lat:v.latitude,lon:v.longitude}];})
    };
    mapRef.current?.injectJavaScript(`window.updateRouteMap(${JSON.stringify(payload)});true;`);
  },[mapReady,stops,vehicles]);

  const routeName=route?.publicRouteName||displayRouteName(route?.short_name)||displayRouteName(label)||displayRouteName(routeId)||'Bus route';
  const from=route?.fromStop||stops[0]?.name||'Starting stop';
  const to=route?.toStop||stops[stops.length-1]?.name||'Ending stop';
  const liveVehicle=vehicles[0]||null;const c=liveVehicle?resolveVehicleColor(liveVehicle):resolveRouteColor(routeName,route?.route_color,route?.route_text_color);

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
        <Text style={styles.direction} numberOfLines={1}>{from}</Text>
        <View style={styles.directionLine}><View style={styles.dot}/><View style={styles.line}/><View style={[styles.dot,{backgroundColor:colors.secondary,borderColor:colors.secondary}]}/></View>
        <Text style={styles.direction} numberOfLines={1}>{to}</Text>
      </View>
    </View>

    <View style={styles.mapWrap}>
      <WebView ref={mapRef} style={styles.map} originWhitelist={['*']} javaScriptEnabled domStorageEnabled cacheEnabled userAgent="UnitedDelhi/1.0 (+https://github.com/ItzVion/united-delhi)" source={routeMapSource} onLoadEnd={()=>setMapReady(true)}
        onMessage={event=>{try{const m=JSON.parse(event.nativeEvent.data);if(m.type==='stop'){const stop=stops.find(s=>s.stop_id===m.stopId);if(stop)navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name});}else if(m.type==='bus'){const bus=vehicles.find(v=>v.id===m.busId);if(bus)setSelectedBus(bus);}}catch{}}}/>
      <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text></View>
      <View pointerEvents="none" style={styles.mapPill}><View style={styles.liveDot}/><Text style={styles.mapPillText}>{vehicles.length?(`${vehicles.length} live on route`):'No live position on route'}</Text></View>
    </View>

    <View style={styles.summary}>
      <Metric value={String(stops.length)} label="stops"/>
      <Metric value={String(vehicles.length)} label="live buses"/>
      <Metric value={selectedBus?.busType||(selectedBus?.serviceType==='electric'?'Electric':'Unknown')} label="bus type"/>
    </View>

    {vehicles.length>0?<View style={styles.liveCard}>
      <View style={styles.liveHeader}><View><Text style={styles.liveTitle}>Live buses</Text><Text style={styles.liveSub}>Fresh positions matched to this route</Text></View><Text style={styles.liveCount}>{vehicles.length}</Text></View>
      {vehicles.slice(0,4).map(v=>{const ageMs=Date.now()-Date.parse(v.observedAt);const age=Number.isFinite(ageMs)?Math.max(0,Math.round(ageMs/1000)):null;return <Pressable key={v.id} style={styles.busRow} onPress={()=>setSelectedBus(v)}><View style={styles.vehicleTag}><Text style={styles.vehicleTagText}>{v.vehicleLabel||v.licensePlate||v.id}</Text></View><View style={styles.busCopy}><Text style={styles.busId}>Live bus · {v.id}</Text><Text style={styles.busMeta}>{v.toStop?'To '+v.toStop:to} · {age===null?'Live position':age<60?'Updated just now':'Updated '+Math.floor(age/60)+' min ago'}</Text></View><Text style={styles.chevron}>›</Text></Pressable>})}
    </View>:null}

    <Modal visible={!!selectedBus} transparent animationType="slide" onRequestClose={()=>setSelectedBus(null)}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismissArea} onPress={()=>setSelectedBus(null)}/>
        {selectedBus ? (() => {
          const busName=displayRouteName(selectedBus.routeShortName)||displayRouteName(selectedBus.routeId)||routeName;
          const busColor=resolveVehicleColor(selectedBus);
          const ageMs=Date.now()-Date.parse(selectedBus.observedAt);
          const age=Number.isFinite(ageMs)?Math.max(0,Math.round(ageMs/1000)):null;
          return <View style={styles.busSheet}>
            <View style={styles.sheetHandle}/>
            <View style={styles.sheetTop}>
              <View style={[styles.sheetRouteBadge,{backgroundColor:busColor.background}]}>
                <Text style={[styles.sheetRouteText,{color:busColor.text}]}>{busName}</Text>
              </View>
              <Pressable onPress={()=>setSelectedBus(null)} style={styles.sheetClose}><Text style={styles.sheetCloseText}>×</Text></Pressable>
            </View>
            <Text style={styles.sheetEyebrow}>LIVE BUS</Text>
            <Text style={styles.sheetTitle}>Vehicle {selectedBus.id}</Text>
            <Text style={styles.sheetDestination}>To {selectedBus.toStop||to}</Text>
            <View style={styles.sheetMetaRow}>
              <View><Text style={styles.sheetMetaLabel}>STATUS</Text><Text style={styles.sheetMetaValue}>Live position</Text></View>
              <View><Text style={styles.sheetMetaLabel}>UPDATED</Text><Text style={styles.sheetMetaValue}>{age===null?'Live':age<60?'Just now':Math.floor(age/60)+' min ago'}</Text></View>
            </View>
            <Pressable style={styles.sheetAction} onPress={()=>setSelectedBus(null)}>
              <Text style={styles.sheetActionText}>Close</Text>
            </Pressable>
          </View>;
        })() : null}
      </View>
    </Modal>

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
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""><style>html,body,#map{margin:0;width:100%;height:100%;background:#eef2f1}.leaflet-control-zoom{border:0!important;box-shadow:0 2px 10px rgba(23,49,47,.16)!important;border-radius:0;overflow:hidden}.leaflet-control-zoom a{border:0!important;color:#17312f!important}.stop-label{width:9px;height:9px;border-radius:0;background:#0b746b;border:2px solid #fff}.vehicle-label{position:relative;display:flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box;min-height:22px;padding:3px 7px;border:0;box-shadow:0 2px 6px rgba(0,0,0,.25);font:900 10px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.9);-webkit-text-stroke:.15px rgba(15,23,42,.9);white-space:nowrap;text-align:center}.vehicle-bus-glyph{display:flex;align-items:center;flex:none}.vehicle-bus-glyph svg{display:block;width:14px;height:14px}.vehicle-label.unknown-colour{outline:1px dashed rgba(255,255,255,.95);outline-offset:1px;box-shadow:0 0 0 1px #64748b,0 2px 6px rgba(0,0,0,.25)}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>
const map=L.map('map',{preferCanvas:true,zoomControl:true,attributionControl:false,zoomSnap:.5}).setView([28.6139,77.209],12.5);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);const lineLayer=L.layerGroup().addTo(map),stopLayer=L.layerGroup().addTo(map),busLayer=L.layerGroup().addTo(map);let fitted=false;
window.updateRouteMap=function(data){lineLayer.clearLayers();stopLayer.clearLayers();busLayer.clearLayers();const line=data.stops.map(s=>[s.lat,s.lon]);if(line.length>1)L.polyline(line,{color:'#0b746b',weight:5,opacity:.9,lineCap:'butt'}).addTo(lineLayer);const stopIcon=L.divIcon({className:'',html:'<div class="stop-label"></div>',iconSize:[13,13],iconAnchor:[6,6]});data.stops.forEach(s=>{const popup=document.createElement('div'),title=document.createElement('b'),button=document.createElement('button');title.textContent=s.name;button.textContent='View stop';button.type='button';button.style.marginTop='6px';button.onclick=()=>openStop(s.id);popup.append(title,document.createElement('br'),button);L.marker([s.lat,s.lon],{icon:stopIcon}).addTo(stopLayer).bindPopup(popup);});data.buses.forEach(v=>{const bg=valid(v.color)?v.color:'transparent',knownColour=v.colourKnown===true,estimatedColour=v.colourEstimated===true,displayableColour=knownColour||estimatedColour,title=estimatedColour?'Estimated bus colour; may be inaccurate':knownColour?'Colour supplied by API or reviewed record':'Physical bus colour unknown',html='<div class="vehicle-label'+(displayableColour?'':' unknown-colour')+'" title="'+title+'" style="background:'+esc(bg)+';color:#FFFFFF"><span class="vehicle-bus-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V7.5A3.5 3.5 0 0 1 8.5 4h7A3.5 3.5 0 0 1 19 7.5V19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 10h14M8 7h8M7.5 15h.01M16.5 15h.01M7 19v2m10-2v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'+esc(v.vehicle)+'</div>';const marker=L.marker([v.lat,v.lon],{icon:L.divIcon({className:'',html,iconSize:[90,24],iconAnchor:[45,12]})});marker.on('click',()=>window.ReactNativeWebView.postMessage(JSON.stringify({type:'bus',busId:v.id})));marker.addTo(busLayer);});if(!fitted&&(line.length||data.buses.length)){const points=[...line,...data.buses.map(v=>[v.lat,v.lon])];map.fitBounds(points,{padding:[18,18],maxZoom:13});fitted=true;}};function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}function valid(x){return /^#[0-9a-f]{6}$/i.test(String(x));}function textColorFor(apiColor){if(!valid(apiColor))return '#14211B';const h=String(apiColor).slice(1),rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255),lin=rgb.map(c=>c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4));return .2126*lin[0]+.7152*lin[1]+.0722*lin[2]>.179?'#14211B':'#FFFFFF';}function esc(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}</script></body></html>`;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 modalBackdrop:{flex:1,backgroundColor:'rgba(23,49,47,.28)',justifyContent:'flex-end'},
 modalDismissArea:{flex:1},
 busSheet:{backgroundColor:colors.surface,borderTopLeftRadius:0,borderTopRightRadius:0,padding:18,paddingBottom:26,borderTopWidth:1,borderColor:colors.border},
 sheetHandle:{width:42,height:4,borderRadius:0,backgroundColor:colors.border,alignSelf:'center',marginBottom:16},
 sheetTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 sheetRouteBadge:{minWidth:68,height:42,paddingHorizontal:10,borderRadius:0,alignItems:'center',justifyContent:'center'},
 sheetRouteText:{fontSize:16,fontWeight:'900'},
 sheetClose:{width:34,height:34,borderRadius:0,backgroundColor:colors.background,alignItems:'center',justifyContent:'center'},
 sheetCloseText:{fontSize:24,color:colors.textMuted,lineHeight:26},
 sheetEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:colors.accent,marginTop:16},
 sheetTitle:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:3},
 sheetDestination:{fontSize:14,fontWeight:'800',color:colors.textMuted,marginTop:4},
 sheetMetaRow:{flexDirection:'row',gap:36,marginTop:18,paddingTop:14,borderTopWidth:1,borderTopColor:colors.border},
 sheetMetaLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:colors.textMuted},
 sheetMetaValue:{fontSize:12,fontWeight:'900',color:colors.text,marginTop:3},
 sheetAction:{height:44,borderRadius:0,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',marginTop:18},
 sheetActionText:{fontSize:13,fontWeight:'900',color:'#fff'},
topBar:{paddingHorizontal:16,paddingTop:7,paddingBottom:7,flexDirection:'row',alignItems:'center'},backButton:{width:40,height:40,alignItems:'center',justifyContent:'center'},back:{fontSize:36,color:colors.text},topCopy:{flex:1},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:colors.textMuted},title:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:2},
 error:{marginHorizontal:16,marginBottom:8,padding:10,borderRadius:0,backgroundColor:colors.dangerSoft},errorText:{fontSize:11,color:colors.danger,fontWeight:'700'},
 hero:{marginHorizontal:16,padding:13,borderRadius:0,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center'},routeBadge:{minWidth:66,height:42,paddingHorizontal:10,borderRadius:0,alignItems:'center',justifyContent:'center'},routeBadgeText:{fontSize:16,fontWeight:'900'},heroCopy:{flex:1,marginLeft:12},direction:{fontSize:12,fontWeight:'800',color:colors.text},directionLine:{height:15,flexDirection:'row',alignItems:'center',marginVertical:2},dot:{width:7,height:7,borderRadius:0,borderWidth:2,borderColor:colors.accent,backgroundColor:colors.surface},line:{width:34,height:2,backgroundColor:colors.border,marginHorizontal:5},
 mapWrap:{height:245,marginHorizontal:16,marginTop:10,borderRadius:0,overflow:'hidden',borderWidth:1,borderColor:colors.border},map:{flex:1},mapAttribution:{position:'absolute',right:7,bottom:6,backgroundColor:'rgba(255,255,255,.9)',paddingHorizontal:5,paddingVertical:2,borderRadius:0},mapAttributionText:{fontSize:7,color:'#52625f'},mapPill:{position:'absolute',left:9,top:9,flexDirection:'row',alignItems:'center',backgroundColor:'rgba(255,255,255,.94)',paddingHorizontal:8,paddingVertical:5,borderRadius:0},liveDot:{width:7,height:7,borderRadius:0,backgroundColor:colors.success,marginRight:5},mapPillText:{fontSize:9,fontWeight:'900',color:colors.text},
 summary:{marginHorizontal:16,marginTop:9,paddingVertical:11,borderRadius:0,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-around'},metric:{alignItems:'center',minWidth:70},metricValue:{fontSize:17,fontWeight:'900',color:colors.text},metricLabel:{fontSize:9,color:colors.textMuted,marginTop:2},
 liveCard:{marginHorizontal:16,marginTop:9,padding:12,borderRadius:0,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},liveHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},liveTitle:{fontSize:14,fontWeight:'900',color:colors.text},liveSub:{fontSize:9,color:colors.textMuted,marginTop:2},liveCount:{fontSize:17,fontWeight:'900',color:colors.accent},busRow:{flexDirection:'row',alignItems:'center',paddingTop:10},vehicleTag:{minWidth:86,height:30,borderRadius:0,backgroundColor:colors.surfaceAlt,alignItems:'center',justifyContent:'center',paddingHorizontal:7},vehicleTagText:{fontSize:9,fontWeight:'900',color:colors.text},busCopy:{marginLeft:9,flex:1},busId:{fontSize:11,fontWeight:'800',color:colors.text},busMeta:{fontSize:9,color:colors.textMuted,marginTop:2},
 list:{paddingHorizontal:16,paddingTop:12,paddingBottom:28},listHeader:{paddingBottom:7},listTitle:{fontSize:16,fontWeight:'900',color:colors.text},listHint:{fontSize:10,color:colors.textMuted,marginTop:2},empty:{color:colors.textMuted,paddingVertical:20},
 stopRow:{minHeight:56,flexDirection:'row',alignItems:'stretch'},timeline:{width:28,alignItems:'center'},dotStop:{width:9,height:9,borderRadius:0,backgroundColor:colors.surface,borderWidth:2,borderColor:colors.accent,marginTop:16},dotStopStrong:{width:12,height:12,borderRadius:0,backgroundColor:colors.accent},stopLine:{width:2,flex:1,backgroundColor:colors.border,marginTop:2},stopInfo:{flex:1,paddingVertical:10,paddingLeft:3},stopIndex:{fontSize:8,color:colors.textMuted,fontWeight:'800'},stopName:{fontSize:13,color:colors.text,fontWeight:'800',marginTop:1},chevron:{fontSize:23,color:colors.textMuted,alignSelf:'center'}
});
