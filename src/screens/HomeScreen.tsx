import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';
import { confirmLocationUse } from '../lib/locationConsent';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;
type MapBounds = { south:number; west:number; north:number; east:number };
const DELHI={latitude:28.6139,longitude:77.209};

export default function HomeScreen(){
  const navigation=useNavigation<Nav>();
  const mapRef=useRef<WebView|null>(null);
  const [location,setLocation]=useState<Location.LocationObject|null>(null);
  const [locationStatus,setLocationStatus]=useState('Finding your location…');
  const [nearbyStops,setNearbyStops]=useState<Stop[]>([]);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [fresh,setFresh]=useState<'loading'|'ok'|'unavailable'>('loading');
  const [mapReady,setMapReady]=useState(false);
  const [bounds,setBounds]=useState<MapBounds|null>(null);
  const [selectedBus,setSelectedBus]=useState<Vehicle|null>(null);

  const requestLocation=useCallback(async()=>{
    if(!(await confirmLocationUse())){setLocationStatus('Showing Delhi without your location.');return;}
    try{
      const permission=await Location.getForegroundPermissionsAsync();
      if(permission.status!=='granted'){
        const requested=await Promise.race([
          Location.requestForegroundPermissionsAsync(),
          new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('timeout')),10000))
        ]);
        if(requested.status!=='granted'){setLocationStatus('Location is off. Showing Delhi.');return;}
      }
      const last=await Location.getLastKnownPositionAsync({maxAge:5*60*1000,requiredAccuracy:2000});
      if(last)setLocation(last);
      try{
        const current=await Promise.race([
          Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),
          new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('timeout')),10000))
        ]);
        setLocation(current);setLocationStatus('');
      }catch{if(!last)setLocationStatus('Could not get GPS. Showing Delhi.');}
    }catch{setLocationStatus('Location unavailable. Showing Delhi.');}
  },[]);

  const loadNearby=useCallback(async(lat:number,lon:number)=>{
    try{const result=await api.nearbyStops(lat,lon,6);setNearbyStops(result.status==='OK'?result.stops:[]);}
    catch{setNearbyStops([]);}
  },[]);

  const loadVehicles=useCallback(async()=>{
    try{const result=await api.vehicles();setVehicles(result.status==='OK'?result.vehicles:[]);setFresh(result.status==='OK'?'ok':'unavailable');}
    catch{setFresh('unavailable');}
  },[]);

  useEffect(()=>{void requestLocation();},[requestLocation]);
  useEffect(()=>{if(location)void loadNearby(location.coords.latitude,location.coords.longitude);},[location,loadNearby]);
  useEffect(()=>{void loadVehicles();const id=setInterval(()=>void loadVehicles(),15000);return()=>clearInterval(id);},[loadVehicles]);

  useEffect(()=>{
    if(!mapReady)return;
    const center=bounds
      ? {lat:(bounds.south+bounds.north)/2,lon:(bounds.west+bounds.east)/2}
      : {lat:location?.coords.latitude??DELHI.latitude,lon:location?.coords.longitude??DELHI.longitude};
    const visible=bounds?vehicles.filter(v=>v.latitude>=bounds.south&&v.latitude<=bounds.north&&v.longitude>=bounds.west&&v.longitude<=bounds.east):vehicles;
    const payload={
      center,
      stops:nearbyStops.map(s=>({id:s.stop_id,name:s.name,lat:s.latitude,lon:s.longitude})),
      buses:visible.flatMap(v=>{
        const route=displayRouteName(v.routeShortName);
        if(!route || !v.routeId) return [];
        const c=resolveRouteColor(route,v.routeColor,v.routeTextColor);
        return [{id:v.id,routeId:v.routeId,route,color:c.background,textColor:c.text,lat:v.latitude,lon:v.longitude}];
      }).slice(0,220),
      location:location?{lat:location.coords.latitude,lon:location.coords.longitude}:null
    };
    mapRef.current?.injectJavaScript(`window.updateMap(${JSON.stringify(payload)});true;`);
  },[mapReady,bounds,location,nearbyStops,vehicles]);

  const liveLabel=fresh==='ok'?(`${vehicles.length} live buses`):fresh==='loading'?'Checking live buses':'Live data unavailable';

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.brandRow}><UnitedDelhiMark size={50}/><View style={styles.brandCopy}><Text style={styles.brand}>UNITED DELHI</Text><Text style={styles.tagline}>Delhi transit, made simple</Text></View></View>
        <StatusPill label={liveLabel} tone={fresh==='ok'?'ok':fresh==='unavailable'?'danger':'muted'}/>
      </View>

      <Pressable style={styles.search} onPress={()=>navigation.navigate('Search')}>
        <Text style={styles.searchIcon}>⌕</Text>
        <Text style={styles.searchText}>Search routes, stops or places</Text>
        <Text style={styles.searchKey}>⌘</Text>
      </Pressable>

      <View style={styles.sectionLine}>
        <Text style={styles.sectionKicker}>LIVE TRANSIT</Text>
        <Pressable onPress={requestLocation}><Text style={styles.locationLink}>{location?'Recenter':'Use my location'}</Text></Pressable>
      </View>

      <View style={styles.mapCard}>
        <WebView
          ref={mapRef}
          style={styles.map}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          userAgent="UnitedDelhi/1.0 (+https://github.com/ItzVion/united-delhi)"
          source={{html:buildMapHtml()}}
          onLoadEnd={()=>setMapReady(true)}
          onMessage={event=>{
            try{
              const m=JSON.parse(event.nativeEvent.data);
              if(m.type==='stop'){
                const stop=nearbyStops.find(s=>s.stop_id===m.stopId);
                if(stop)navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name});
              }else if(m.type==='bus'){
                const bus=vehicles.find(v=>v.id===m.busId);
                if(bus)setSelectedBus(bus);
              }else if(m.type==='bounds'&&m.bounds)setBounds(m.bounds);
            }catch{}
          }}
        />
        <View pointerEvents="none" style={styles.mapTop}>
          <View style={styles.liveDot}/>
          <Text style={styles.mapTopText}>{fresh==='ok'?(`${vehicles.length} buses live`):'Live map'}</Text>
        </View>
        <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text></View>
        {locationStatus?<Pressable style={styles.locationNotice} onPress={requestLocation}><Text style={styles.locationNoticeText}>{locationStatus}</Text><Text style={styles.retry}>Retry</Text></Pressable>:null}
        {selectedBus ? (() => {
          const name=displayRouteName(selectedBus.routeShortName);
          if(!name || !selectedBus.routeId) return null;
          const c=resolveRouteColor(name,selectedBus.routeColor,selectedBus.routeTextColor);
          const ageSeconds=Math.max(0,Math.round((Date.now()-Date.parse(selectedBus.observedAt))/1000));
          const freshness=Number.isFinite(ageSeconds)?(ageSeconds<60?'Updated just now':`Updated ${Math.floor(ageSeconds/60)} min ago`):'Live position';
          return <View style={styles.busPreview}>
            <Pressable style={styles.busPreviewClose} onPress={()=>setSelectedBus(null)}><Text style={styles.busPreviewCloseText}>×</Text></Pressable>
            <Pressable style={styles.busPreviewBody} onPress={()=>{
              navigation.navigate('RouteDetails',{routeId:selectedBus.routeId!,label:name});
            }}>
              <View style={[styles.busPreviewBadge,{backgroundColor:c.background}]}><Text style={[styles.busPreviewBadgeText,{color:c.text}]}>{name}</Text></View>
              <View style={styles.busPreviewCopy}>
                <Text style={styles.busPreviewEyebrow}>LIVE BUS</Text>
                <Text style={styles.busPreviewTitle} numberOfLines={1}>To {selectedBus.toStop || 'Destination'}</Text>
                <Text style={styles.busPreviewMeta} numberOfLines={1}>{selectedBus.id} · {freshness} · View route</Text>
              </View>
              <Text style={styles.busPreviewArrow}>›</Text>
            </Pressable>
          </View>;
        })() : null}
      </View>

      <View style={styles.quickRow}>
        <QuickAction icon="⌕" title="Search" sub="Routes & stops" onPress={()=>navigation.navigate('Search')}/>
        <QuickAction icon="↗" title="Plan trip" sub="Find your bus" accent={colors.secondary} onPress={()=>navigation.navigate('Planner')}/>
        <QuickAction icon="●" title="Nearby" sub="Around you" accent={colors.success} onPress={()=>navigation.navigate('Nearby')}/>
      </View>

      <View style={styles.sectionHead}>
        <View><Text style={styles.sectionTitle}>Nearby stops</Text><Text style={styles.sectionSub}>Tap a stop for routes and live arrivals</Text></View>
        <Pressable onPress={()=>navigation.navigate('Nearby')}><Text style={styles.seeAll}>See all</Text></Pressable>
      </View>

      {nearbyStops.slice(0,4).map(stop=><Pressable key={stop.stop_id} style={styles.stopCard} onPress={()=>navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name})}>
        <View style={styles.stopIcon}><Text style={styles.stopIconText}>●</Text></View>
        <View style={styles.stopCopy}><Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text><Text style={styles.stopDistance}>{stop.distance_m!=null?`${Math.round(stop.distance_m)} m away`:'Nearby stop'}</Text></View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>)}
      {!nearbyStops.length?<View style={styles.emptyCard}><Text style={styles.emptyTitle}>No nearby stops yet</Text><Text style={styles.emptyText}>Turn on location to find stops around you.</Text></View>:null}

      <Pressable style={styles.legal} onPress={()=>navigation.navigate('Legal')}><Text style={styles.legalText}>Legal & privacy</Text></Pressable>
    </ScrollView>

    <View style={styles.bottomNav}>
      <BottomItem icon="⌂" label="Home" active onPress={()=>{}}/>
      <BottomItem icon="⌕" label="Search" onPress={()=>navigation.navigate('Search')}/>
      <BottomItem icon="↗" label="Plan" onPress={()=>navigation.navigate('Planner')}/>
      <BottomItem icon="●" label="Nearby" onPress={()=>navigation.navigate('Nearby')}/>
    </View>
  </SafeAreaView>;
}

function QuickAction({icon,title,sub,onPress,accent=colors.accent}:{icon:string;title:string;sub:string;onPress:()=>void;accent?:string}){
  return <Pressable style={styles.quick} onPress={onPress}><Text style={[styles.quickIcon,{color:accent}]}>{icon}</Text><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickSub}>{sub}</Text></Pressable>;
}
function BottomItem({icon,label,onPress,active=false}:{icon:string;label:string;onPress:()=>void;active?:boolean}){
  return <Pressable style={styles.bottomItem} onPress={onPress}><Text style={[styles.bottomIcon,{color:active?colors.accent:colors.textMuted}]}>{icon}</Text><Text style={[styles.bottomLabel,{color:active?colors.accent:colors.textMuted}]}>{label}</Text></Pressable>;
}

function buildMapHtml(){
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""><style>
html,body,#map{margin:0;width:100%;height:100%;background:#eef2f1}.leaflet-control-zoom{border:0!important;box-shadow:0 2px 12px rgba(23,49,47,.16)!important;border-radius:12px!important;overflow:hidden}.leaflet-control-zoom a{border:0!important;color:#17312f!important}
.stop-label{width:10px;height:10px;border-radius:50%;background:#0b746b;border:2px solid #fff;box-shadow:0 2px 6px rgba(23,49,47,.28)}.bus-label{font:800 9px system-ui,sans-serif;white-space:nowrap;border-radius:8px;padding:3px 5px;border:2px solid #fff;box-shadow:0 2px 7px rgba(23,49,47,.22)}
</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>
const map=L.map('map',{preferCanvas:true,zoomControl:true,attributionControl:false,zoomSnap:.5}).setView([28.6139,77.209],12.5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);
const stopLayer=L.layerGroup().addTo(map),busLayer=L.layerGroup().addTo(map),userLayer=L.layerGroup().addTo(map),busMarkers=new Map();
function reportBounds(){const b=map.getBounds();window.ReactNativeWebView.postMessage(JSON.stringify({type:'bounds',bounds:{south:b.getSouth(),west:b.getWest(),north:b.getNorth(),east:b.getEast()}}));}
map.on('moveend',reportBounds);setTimeout(reportBounds,300);
window.updateMap=function(data){
 stopLayer.clearLayers();busLayer.clearLayers();userLayer.clearLayers();busMarkers.clear();
 const stopIcon=L.divIcon({className:'',html:'<div class="stop-label"></div>',iconSize:[14,14],iconAnchor:[7,7]});
 data.stops.forEach(s=>{const popup=document.createElement('div'),title=document.createElement('b'),button=document.createElement('button');title.textContent=s.name;button.textContent='View stop';button.type='button';button.style.marginTop='6px';button.onclick=()=>openStop(s.id);popup.append(title,document.createElement('br'),button);L.marker([s.lat,s.lon],{icon:stopIcon}).addTo(stopLayer).bindPopup(popup);});
 data.buses.forEach(v=>{const bg=validColor(v.color)?v.color:'#0b746b',fg=validColor(v.textColor)?v.textColor:'#fff';const marker=L.marker([v.lat,v.lon],{icon:L.divIcon({className:'',html:'<div class="bus-label" style="background:'+bg+';color:'+fg+'">'+escapeHtml(v.route)+'</div>',iconSize:[56,22],iconAnchor:[28,11]})});marker.on('click',()=>openBus(v.id));marker.addTo(busLayer);busMarkers.set(v.id,marker);});
 if(data.location)L.circleMarker([data.location.lat,data.location.lon],{radius:6,color:'#fff',weight:2,fillColor:'#0b746b',fillOpacity:1}).addTo(userLayer);
};
function openStop(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop',stopId:id}));}function openBus(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'bus',busId:id}));}
function validColor(x){return /^#[0-9a-f]{6}$/i.test(String(x));}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
</script></body></html>`;
}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 scroll:{paddingHorizontal:16,paddingTop:7,paddingBottom:24},
 header:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 brandRow:{flexDirection:'row',alignItems:'center'},brandCopy:{marginLeft:9},brand:{fontSize:18,fontWeight:'900',letterSpacing:1,color:colors.text},tagline:{fontSize:9,color:colors.textMuted,marginTop:2},
 search:{height:48,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',paddingHorizontal:13,marginTop:7},
 searchIcon:{fontSize:23,color:colors.text,marginRight:8},searchText:{flex:1,fontSize:13,color:colors.textMuted},searchKey:{fontSize:13,fontWeight:'800',color:colors.textMuted},
 sectionLine:{paddingHorizontal:2,paddingTop:13,paddingBottom:7,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionKicker:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:colors.textMuted},locationLink:{fontSize:11,fontWeight:'900',color:colors.accent},
 mapCard:{height:275,borderRadius:20,overflow:'hidden',borderWidth:1,borderColor:colors.border,backgroundColor:'#eef2f1'},map:{flex:1},
 mapTop:{position:'absolute',left:10,top:10,flexDirection:'row',alignItems:'center',backgroundColor:'rgba(255,255,255,.94)',paddingHorizontal:9,paddingVertical:6,borderRadius:10},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:colors.success,marginRight:6},mapTopText:{fontSize:10,fontWeight:'900',color:colors.text},mapAttribution:{position:'absolute',right:7,bottom:6,backgroundColor:'rgba(255,255,255,.9)',paddingHorizontal:5,paddingVertical:2,borderRadius:4},mapAttributionText:{fontSize:7,color:'#52625f'},
 locationNotice:{position:'absolute',left:10,right:10,bottom:10,padding:9,borderRadius:11,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-between'},
 busPreview:{position:'absolute',left:9,right:9,bottom:9,borderRadius:17,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,shadowColor:'#17312F',shadowOpacity:.14,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:6},
 busPreviewBody:{minHeight:72,padding:11,paddingRight:28,flexDirection:'row',alignItems:'center'},
 busPreviewClose:{position:'absolute',right:6,top:5,zIndex:3,width:25,height:25,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:colors.background},
 busPreviewCloseText:{fontSize:19,lineHeight:21,color:colors.textMuted},
 busPreviewBadge:{minWidth:58,height:40,borderRadius:11,paddingHorizontal:8,alignItems:'center',justifyContent:'center'},
 busPreviewBadgeText:{fontSize:13,fontWeight:'900'},
 busPreviewCopy:{flex:1,marginLeft:10},
 busPreviewEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1,color:colors.accent},
 busPreviewTitle:{fontSize:14,fontWeight:'900',color:colors.text,marginTop:2},
 busPreviewMeta:{fontSize:9,color:colors.textMuted,marginTop:3},
 busPreviewArrow:{fontSize:27,color:colors.textMuted,marginLeft:6},locationNoticeText:{fontSize:11,color:colors.textMuted},retry:{fontSize:11,fontWeight:'900',color:colors.accent},
 quickRow:{flexDirection:'row',gap:8,marginTop:10},quick:{flex:1,minHeight:72,padding:10,borderRadius:16,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},quickIcon:{fontSize:18,fontWeight:'900'},quickTitle:{fontSize:12,fontWeight:'900',color:colors.text,marginTop:4},quickSub:{fontSize:9,color:colors.textMuted,marginTop:1},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:18,marginBottom:8},sectionTitle:{fontSize:17,fontWeight:'900',color:colors.text},sectionSub:{fontSize:10,color:colors.textMuted,marginTop:2},seeAll:{fontSize:11,fontWeight:'900',color:colors.accent},
 stopCard:{flexDirection:'row',alignItems:'center',padding:11,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,marginBottom:7},stopIcon:{width:34,height:34,borderRadius:11,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},stopIconText:{fontSize:10,color:colors.accent},stopCopy:{flex:1,marginLeft:10},stopName:{fontSize:13,fontWeight:'800',color:colors.text},stopDistance:{fontSize:10,color:colors.textMuted,marginTop:2},arrow:{fontSize:24,color:colors.textMuted,marginLeft:7},
 emptyCard:{padding:18,borderRadius:15,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},emptyTitle:{fontSize:13,fontWeight:'900',color:colors.text},emptyText:{fontSize:11,color:colors.textMuted,marginTop:3},
 legal:{alignItems:'center',paddingVertical:18},legalText:{fontSize:10,fontWeight:'800',color:colors.textMuted},
 bottomNav:{height:64,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingBottom:4},bottomItem:{width:72,alignItems:'center'},bottomIcon:{fontSize:19,fontWeight:'900'},bottomLabel:{fontSize:9,fontWeight:'800',marginTop:3}
});
