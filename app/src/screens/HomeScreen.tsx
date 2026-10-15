import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, readVehicleCache, SearchResult, Stop, Vehicle } from '../api/client';
import { colors } from '../theme';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';
import { fleetLegendRows, hasEvidenceBackedVehicleColor, resolveVehicleColor } from '../lib/vehicleColor';
import { confirmLocationUse } from '../lib/locationConsent';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;
type MapBounds = { south:number; west:number; north:number; east:number };
const DELHI={latitude:28.6139,longitude:77.209};
const UNKNOWN_BUS_MARKER_COLOR='#64748B';
export default function HomeScreen(){
  const navigation=useNavigation<Nav>();
  const insets=useSafeAreaInsets();
  // Keep app tabs above Android system navigation buttons.
  const bottomInset=Math.max(insets.bottom,Platform.OS==='android'?24:0);
  const { width:windowWidth }=useWindowDimensions();
  const contentWidth=Math.min(windowWidth,760);
  const mapHeight=Math.min(380,Math.max(275,contentWidth*0.36));
  const mapRef=useRef<WebView|null>(null);
  const mapSource=useMemo(()=>({html:buildMapHtml()}),[]);
  const [location,setLocation]=useState<Location.LocationObject|null>(null);
  const [locationStatus,setLocationStatus]=useState('Finding your location…');
  const [nearbyStops,setNearbyStops]=useState<Stop[]>([]);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [fresh,setFresh]=useState<'loading'|'ok'|'stale'|'unavailable'>('loading');
  const [lastRealtimeAt,setLastRealtimeAt]=useState<string|null>(null);
  const [mapReady,setMapReady]=useState(false);
  const [mapError,setMapError]=useState(false);
  const [bounds,setBounds]=useState<MapBounds|null>(null);
  const [selectedBus,setSelectedBus]=useState<Vehicle|null>(null);
  const [searchQuery,setSearchQuery]=useState('');
  const [searchResults,setSearchResults]=useState<SearchResult[]>([]);
  const [searchLoading,setSearchLoading]=useState(false);
  const [searchError,setSearchError]=useState<string|null>(null);
  const [legendOpen,setLegendOpen]=useState(false);
  const lastVehiclesRef=useRef<Vehicle[]>([]);
  const lastNearbyLocationRef=useRef<{lat:number;lon:number}|null>(null);
  const nearbyLoadingRef=useRef(false);
  const vehiclesLoadingRef=useRef(false);
  const vehiclesRefreshPendingRef=useRef(false);
  const loadVehiclesRef=useRef<()=>void>(()=>{});
const legendRows = [...fleetLegendRows(vehicles), { key:'unknown', label:'Unknown / no verified colour', color:UNKNOWN_BUS_MARKER_COLOR }];

  const requestLocation=useCallback(async()=>{
    try{
      let permission=await Location.getForegroundPermissionsAsync();
      if(permission.status!=='granted'){
        if(!(await confirmLocationUse())){setLocationStatus('Showing Delhi without your location.');return;}
        const requested=await Promise.race([
          Location.requestForegroundPermissionsAsync(),
          new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('timeout')),10000))
        ]);
        permission=requested;
        if(permission.status!=='granted'){setLocationStatus('Location is off. Showing Delhi.');return;}
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
    if(nearbyLoadingRef.current)return;
    const previous=lastNearbyLocationRef.current;
    if(previous){
      const rad=(n:number)=>n*Math.PI/180,dLat=rad(lat-previous.lat),dLon=rad(lon-previous.lon);
      const a=Math.sin(dLat/2)**2+Math.cos(rad(previous.lat))*Math.cos(rad(lat))*Math.sin(dLon/2)**2;
      const metres=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      if(metres<100)return;
    }
    nearbyLoadingRef.current=true;
    try{
      const result=await api.nearbyStops(lat,lon,6);
      if(result.status==='OK'){lastNearbyLocationRef.current={lat,lon};setNearbyStops(result.stops);}
    }catch{
      // Keep the last good nearby stops during transient network failures.
    }finally{nearbyLoadingRef.current=false}
  },[]);

  const loadVehicles=useCallback(async()=>{
    if(vehiclesLoadingRef.current){vehiclesRefreshPendingRef.current=true;return;}
    vehiclesLoadingRef.current=true;
    try{
      const result=await api.vehicles();
      const list=Array.isArray(result.vehicles)?result.vehicles:[];
      // Never call retained/cached positions "live" when the current feed is empty or stale.
      if(list.length){
        lastVehiclesRef.current=list;
        setVehicles(list);
        setLastRealtimeAt(result.fetchedAt||null);
        const ageMs=result.fetchedAt?Date.now()-Date.parse(result.fetchedAt):Infinity;
        const genuinelyFresh=result.status==='OK'&&result.stale!==true&&Number.isFinite(ageMs)&&ageMs>=-60000&&ageMs<=90000;
        setFresh(genuinelyFresh?'ok':'stale');
      }else{
        if(lastVehiclesRef.current.length)setVehicles(lastVehiclesRef.current);
        setFresh(lastVehiclesRef.current.length?'stale':'unavailable');
      }
    }catch{
      if(lastVehiclesRef.current.length)setVehicles(lastVehiclesRef.current);
      setFresh(lastVehiclesRef.current.length?'stale':'unavailable');
    }finally{
      vehiclesLoadingRef.current=false;
      if(vehiclesRefreshPendingRef.current){
        vehiclesRefreshPendingRef.current=false;
        setTimeout(()=>loadVehiclesRef.current(),0);
      }
    }
  },[]);
  loadVehiclesRef.current=()=>{void loadVehicles()};

  useEffect(()=>{void requestLocation();},[requestLocation]);
  useEffect(()=>{if(location)void loadNearby(location.coords.latitude,location.coords.longitude);},[location,loadNearby]);
  useEffect(()=>{
    let active=true;
    void readVehicleCache().then(cached=>{
      if(active&&cached?.vehicles?.length){
        lastVehiclesRef.current=cached.vehicles;
        setVehicles(cached.vehicles);
        setLastRealtimeAt(cached.fetchedAt||null);
        setFresh('stale');
      }
    }).finally(()=>{if(active)void loadVehicles();});
    const id=setInterval(()=>void loadVehicles(),15000);
    return()=>{active=false;clearInterval(id);};
  },[loadVehicles]);

  useEffect(()=>{const value=searchQuery.trim();if(value.length<2){setSearchResults([]);setSearchError(null);setSearchLoading(false);return;}let cancelled=false;setSearchLoading(true);setSearchError(null);const timer=setTimeout(async()=>{try{const result=await api.search(value);if(!cancelled){const seen=new Set<string>();const cleaned=(result.status==='OK'?result.results:[]).filter(item=>{const key=item.type+'|'+item.id+'|'+item.label.toLowerCase();if(seen.has(key))return false;seen.add(key);return true}).slice(0,12);setSearchResults(cleaned);}}catch(e){if(!cancelled){setSearchResults([]);setSearchError((e as Error).message||'Search is temporarily unavailable.');}}finally{if(!cancelled)setSearchLoading(false);}},220);return()=>{cancelled=true;clearTimeout(timer);};},[searchQuery]);

  useEffect(()=>{
    if(!mapReady)return;
    const center=bounds
      ? {lat:(bounds.south+bounds.north)/2,lon:(bounds.west+bounds.east)/2}
      : {lat:location?.coords.latitude??DELHI.latitude,lon:location?.coords.longitude??DELHI.longitude};
    // Fetch/cache the full realtime fleet, but only send buses inside the
    // current map viewport to the WebView. This prevents thousands of DOM
    // markers from being created outside the visible area.
    const visible= bounds
      ? vehicles.filter(v=>Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)&&
          v.latitude>=bounds.south && v.latitude<=bounds.north &&
          v.longitude>=bounds.west && v.longitude<=bounds.east)
      : vehicles.filter(v=>Number.isFinite(v.latitude)&&Number.isFinite(v.longitude));
    const payload={
      center,
      stops:nearbyStops.map(s=>({id:s.stop_id,name:s.name,lat:s.latitude,lon:s.longitude})),
      buses:visible.map(v=>{
        const route=displayRouteName(v.routeShortName) || displayRouteName(v.routeId) || 'BUS';
        const c=resolveVehicleColor(v);
        return [{id:v.id,routeId:v.routeId,route,color:c.background,textColor:c.text,colourKnown:hasEvidenceBackedVehicleColor(v),colourEstimated:false,lat:v.latitude,lon:v.longitude}];
      }).flat(),
      location:location?{lat:location.coords.latitude,lon:location.coords.longitude}:null
    };
    mapRef.current?.injectJavaScript(`window.updateMap(${JSON.stringify(payload)});true;`);
  },[mapReady,bounds,location,nearbyStops,vehicles]);

  const realtimeAge=lastRealtimeAt?Math.max(0,Math.round((Date.now()-Date.parse(lastRealtimeAt))/1000)):null;
  const realtimeAgeLabel=realtimeAge===null?'':realtimeAge<60?'just now':`${Math.floor(realtimeAge/60)} min ago`;
  const liveLabel=fresh==='ok'?(`${vehicles.length} live · ${realtimeAgeLabel||'just now'}`):fresh==='stale'?(`${vehicles.length} buses · updated ${realtimeAgeLabel||'earlier'}`):fresh==='loading'?'Checking live buses':vehicles.length?(`${vehicles.length} buses · connection lost`):'Live data unavailable';

  return <SafeAreaView style={styles.safe} edges={['top','left','right']}>
    <ScrollView contentContainerStyle={[styles.scroll,{paddingBottom:118+bottomInset}]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.brandRow}><UnitedDelhiMark size={50}/><View style={styles.brandCopy}><Text style={styles.brand}>UNITED DELHI</Text><Text style={styles.tagline}>Delhi transit</Text></View></View>
        <StatusPill label={liveLabel} tone={fresh==='ok'?'ok':fresh==='unavailable'?'danger':fresh==='stale'?'muted':'muted'}/>
      </View>

      <View style={styles.search}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search routes, stops or places" placeholderTextColor={colors.textMuted} style={styles.searchInput} autoCorrect={false} returnKeyType="search"/>
        {searchLoading?<ActivityIndicator size="small" color={colors.accent}/>:null}
        {searchQuery?<Pressable onPress={()=>setSearchQuery('')}><Text style={styles.searchKey}>×</Text></Pressable>:null}
      </View>
      {searchQuery.trim().length>=2?<View style={styles.searchResults}>
        {searchError?<Text style={styles.searchError}>{searchError}</Text>:searchResults.length?searchResults.map((item,index)=>{const name=item.type==='route'?(displayRouteName(item.label)||item.label):item.label;const rc=item.type==='route'?resolveRouteColor(displayRouteName(item.label),item.routeColor,item.routeTextColor):null;return <Pressable key={item.type+'-'+item.id+'-'+index} style={styles.searchResult} onPress={()=>item.type==='stop'?navigation.navigate('StopDetails',{stopId:item.id,stopName:item.label}):navigation.navigate('RouteDetails',{routeId:item.id,label:item.label})}>
          {item.type==='route'?<View style={[styles.searchBadge,{backgroundColor:rc?.background}]}><Text style={[styles.searchBadgeText,{color:rc?.text}]}>{name}</Text></View>:<View style={styles.searchStopIcon}><Text style={styles.searchStopDot}>●</Text></View>}
          <View style={styles.searchCopy}><Text style={styles.searchTitle} numberOfLines={1}>{item.type==='route'?'Bus route':item.label}</Text><Text style={styles.searchMeta} numberOfLines={1}>{item.type==='route'?(item.fromStop||'Start')+' → '+(item.toStop||'Destination'):'Bus stop'}</Text></View><Text style={styles.searchArrow}>›</Text>
        </Pressable>}):<Text style={styles.searchEmpty}>{searchLoading?'Searching…':'No matching routes or stops found.'}</Text>}
      </View>:null}

      <View style={styles.sectionLine}>
        <Text style={styles.sectionKicker}>LIVE TRANSIT</Text>
        <Pressable onPress={requestLocation}><Text style={styles.locationLink}>{location?'Recenter':'Use my location'}</Text></Pressable>
      </View>

      <View style={[styles.mapCard,{height:mapHeight}]}>
        <WebView
          ref={mapRef}
          style={styles.map}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          userAgent="UnitedDelhi/1.0 (+https://github.com/ItzVion/united-delhi)"
          source={mapSource}
          onError={()=>{setMapReady(false);setMapError(true);}}
          onMessage={event=>{
            try{
              const m=JSON.parse(event.nativeEvent.data);
              if(m.type==='map-ready'){setMapReady(true);setMapError(false);}
              else if(m.type==='map-error'){setMapReady(false);setMapError(true);}
              else if(m.type==='map-tile-error'){setMapError(true);}
              else if(m.type==='map-tiles-ok'){setMapError(false);}
              else if(m.type==='stop'){
                const stop=nearbyStops.find(s=>s.stop_id===m.stopId);
                if(stop)navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name});
              }else if(m.type==='bus'){
                const bus=vehicles.find(v=>v.id===m.busId);
                if(bus)setSelectedBus(bus);
              }else if(m.type==='refresh-buses')void loadVehicles();
              else if(m.type==='bounds'&&m.bounds)setBounds(m.bounds);
              else if(m.type==='legend')setLegendOpen(true);
              else if(m.type==='locate')void requestLocation();
            }catch{}
          }}
        />
        <View pointerEvents="none" style={styles.mapTop}>
          <View style={styles.liveDot}/>
          <Text style={styles.mapTopText}>{fresh==='ok'?(`${vehicles.length} buses · updated ${realtimeAgeLabel||'just now'}`):fresh==='stale'?(`${vehicles.length} buses · updated ${realtimeAgeLabel||'earlier'}`):fresh==='unavailable'?'Live data unavailable':'Checking live buses'}</Text>
        </View>
        {mapError?<View style={styles.mapErrorOverlay}><Text style={styles.mapErrorTitle}>Map couldn't load</Text><Text style={styles.mapErrorText}>Check your connection and try loading the map again.</Text><Pressable style={styles.mapRetry} onPress={()=>{setMapReady(false);setMapError(false);mapRef.current?.reload();}}><Text style={styles.mapRetryText}>Retry map</Text></Pressable></View>:null}
        <View pointerEvents="none" style={styles.mapAttribution}><Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text></View><View pointerEvents="none" style={styles.mapLegend}>{legendRows.map(row=><View key={row.key} style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:row.color}]}/><Text style={styles.legendText}>{row.label}</Text></View>)}</View>
        {locationStatus?<Pressable style={styles.locationNotice} onPress={requestLocation}><Text style={styles.locationNoticeText}>{locationStatus}</Text><Text style={styles.retry}>Retry</Text></Pressable>:null}
        {selectedBus ? (() => {
          const name=displayRouteName(selectedBus.routeShortName) || displayRouteName(selectedBus.routeId) || 'Bus';
          if(!selectedBus.routeId) return null;
          const c=resolveVehicleColor(selectedBus);
          const ageSeconds=Math.max(0,Math.round((Date.now()-Date.parse(selectedBus.observedAt))/1000));
          const freshness=Number.isFinite(ageSeconds)?(ageSeconds<60?'Updated just now':`Updated ${Math.floor(ageSeconds/60)} min ago`):'Live position';
          return <View style={styles.busPreview}>
            <Pressable style={styles.busPreviewClose} onPress={()=>setSelectedBus(null)}><Text style={styles.busPreviewCloseText}>×</Text></Pressable>
            <Pressable style={styles.busPreviewBody} onPress={()=>{
              if(selectedBus.routeId) navigation.navigate('RouteDetails',{routeId:selectedBus.routeId,label:name});
            }}>
              <View style={[styles.busPreviewBadge,{backgroundColor:c.background}]}><Text style={[styles.busPreviewBadgeText,{color:c.text}]}>{name}</Text></View>
              <View style={styles.busPreviewCopy}>
                <Text style={styles.busPreviewEyebrow}>LIVE BUS</Text>
                <Text style={styles.busPreviewTitle} numberOfLines={1}>To {selectedBus.toStop || 'Destination'}</Text>
                <Text style={styles.busPreviewMeta} numberOfLines={2}>{selectedBus.vehicleLabel || selectedBus.licensePlate || selectedBus.id} · {freshness} · View route{hasEvidenceBackedVehicleColor(selectedBus)?'':' · colour unavailable'}</Text>
              </View>
              <Text style={styles.busPreviewArrow}>›</Text>
            </Pressable>
          </View>;
        })() : null}
      </View>
        <Modal visible={legendOpen} transparent animationType="fade" onRequestClose={()=>setLegendOpen(false)}>
          <Pressable style={styles.legendOverlay} onPress={()=>setLegendOpen(false)}>
            <Pressable style={styles.legendDialog} onPress={event=>event.stopPropagation()}>
              <Text style={styles.legendTitle}>Bus Color Legend</Text>
              <View style={styles.legendHeader}><Text style={styles.legendHeaderText}>Bus Icon</Text><Text style={styles.legendHeaderText}>Type</Text></View>
              {legendRows.map(row=><View key={row.key} style={styles.legendRow}><View style={styles.legendIcons}><View style={[styles.legendBus,{backgroundColor:row.color}]}><View style={styles.legendBusWindow}/><View style={styles.legendBusWindshield}/><View style={styles.legendBusLightRow}><View style={styles.legendBusLight}/><View style={styles.legendBusLight}/></View></View></View><Text style={styles.legendType}>{row.label}</Text></View>)}
              <Pressable style={styles.legendClose} onPress={()=>setLegendOpen(false)}><Text style={styles.legendCloseText}>Understood!</Text></Pressable>
            </Pressable>
          </Pressable>
        </Modal>

      <View style={styles.quickRow}>
        <QuickAction icon="↗" title="Plan trip" sub="Find your bus" accent={colors.secondary} onPress={()=>navigation.navigate('Planner')}/>
        <QuickAction icon="◎" title="Location" sub={location?'Recenter map':'Use my location'} accent={colors.success} onPress={requestLocation}/>
      </View>

      <View style={styles.sectionHead}>
        <View><Text style={styles.sectionTitle}>Nearby stops</Text><Text style={styles.sectionSub}>Tap a stop for routes and live arrivals</Text></View>
        <Pressable onPress={requestLocation}><Text style={styles.seeAll}>{location?'Recenter':'Use location'}</Text></Pressable>
      </View>

      {nearbyStops.slice(0,4).map(stop=><Pressable key={stop.stop_id} style={styles.stopCard} onPress={()=>navigation.navigate('StopDetails',{stopId:stop.stop_id,stopName:stop.name})}>
        <View style={styles.stopIcon}><Text style={styles.stopIconText}>●</Text></View>
        <View style={styles.stopCopy}><Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text><Text style={styles.stopDistance}>{(stop.distanceMeters??stop.distance_m)!=null?`${Math.round(Number(stop.distanceMeters??stop.distance_m))} m away`:'Nearby stop'}</Text></View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>)}
      {!nearbyStops.length?<View style={styles.emptyCard}><Text style={styles.emptyTitle}>No nearby stops yet</Text><Text style={styles.emptyText}>Location is optional; use the map or enable location to find nearby stops.</Text></View>:null}

      <Pressable style={styles.legal} onPress={()=>navigation.navigate('Legal')}><Text style={styles.legalText}>Legal & privacy</Text></Pressable>
    </ScrollView>

    <View style={[styles.bottomNav,{bottom:bottomInset}]}>
      <BottomItem icon="⌂" label="Bus" active onPress={()=>{}}/>
      <BottomItem icon="↗" label="Trip Plan" onPress={()=>navigation.navigate('Planner')}/>
      <BottomItem icon="◎" label="Metro" onPress={()=>navigation.navigate('Metro')}/>
      <BottomItem icon="☰" label="Settings" onPress={()=>navigation.navigate('Settings')}/>
    </View>
    {Platform.OS==='android'?<View pointerEvents="none" style={[styles.systemNavBackground,{height:bottomInset}]}/>:null}
  </SafeAreaView>;
}

function QuickAction({icon,title,sub,onPress,accent=colors.accent}:{icon:string;title:string;sub:string;onPress:()=>void;accent?:string}){
  return <Pressable style={styles.quick} onPress={onPress}><Text style={[styles.quickIcon,{color:accent}]}>{icon}</Text><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickSub}>{sub}</Text></Pressable>;
}
function BottomItem({icon,label,onPress,active=false}:{icon:string;label:string;onPress:()=>void;active?:boolean}){
  return <Pressable style={styles.bottomItem} onPress={onPress}><Text style={[styles.bottomIcon,{color:active?colors.secondary:'#AAB7BF'}]}>{icon}</Text><Text style={[styles.bottomLabel,{color:active?colors.accent:colors.textMuted}]}>{label}</Text></Pressable>;
}

function buildMapHtml(){
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""><style>
html,body,#map{margin:0;width:100%;height:100%;background:#eef2f1}.leaflet-control-zoom{border:0!important;box-shadow:0 2px 12px rgba(23,49,47,.16)!important;border-radius:0;overflow:hidden}.leaflet-control-zoom a{border:0!important;color:#17312f!important}
.leaflet-control-locate{margin:0 8px 32px 0}.leaflet-control-locate button{width:40px;height:40px;border:1px solid #d8e4e0;border-radius:0;background:#fff;color:#0b746b;font:900 21px system-ui;line-height:40px;box-shadow:0 3px 14px rgba(23,49,47,.18);cursor:pointer}.leaflet-control-locate button:active{transform:scale(.96)}
.stop-label{width:10px;height:10px;border-radius:0;background:#0b746b;border:2px solid #fff;box-shadow:0 2px 6px rgba(23,49,47,.28)}.ud-mobile-bus{position:relative;width:44px;height:26px;border:0;box-shadow:0 3px 9px rgba(23,49,47,.30);display:flex;align-items:center;justify-content:center;gap:2px;box-sizing:border-box;font:900 7px/1 system-ui,sans-serif;overflow:hidden;white-space:nowrap}.ud-mobile-bus.unknown-colour{outline:1px dashed rgba(255,255,255,.95);outline-offset:1px;box-shadow:0 0 0 1px #64748b,0 3px 9px rgba(23,49,47,.30)}.ud-colour-unknown{position:absolute;top:1px;right:1px;z-index:2;width:10px;height:10px;display:grid;place-items:center;border:1px solid #475569;border-radius:50%;background:#fff;color:#475569;font:900 8px/8px system-ui,sans-serif}.ud-mobile-bus-glyph{width:17px;height:17px;display:grid;place-items:center;flex:0 0 auto}.ud-mobile-bus-glyph svg{width:17px;height:17px;display:block}.ud-mobile-bus-label{max-width:20px;overflow:hidden;text-overflow:clip}
</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>
function notifyNative(message){try{window.ReactNativeWebView?.postMessage?.(JSON.stringify(message))}catch{}}
window.onerror=function(message){notifyNative({type:'map-error',message:String(message||'Map script error')});return false;};
let currentLocation=null;let autoFocused=false;let lastBusData=[];
let saved=null;try{saved=window.localStorage.getItem('ud-map-center')}catch{}
let initialCenter=[28.6139,77.209],initialZoom=10.5;
try{if(saved){const p=JSON.parse(saved);if(Number.isFinite(p.lat)&&Number.isFinite(p.lon)){initialCenter=[p.lat,p.lon];initialZoom=14;}}}catch{}
const map=L.map('map',{preferCanvas:true,zoomControl:true,attributionControl:false,zoomSnap:.5,minZoom:9,maxBounds:[[28.40,76.84],[28.88,77.35]],maxBoundsViscosity:.18,inertia:true,inertiaDeceleration:1800,inertiaMaxSpeed:1800,bounceAtZoomLimits:false}).setView(initialCenter,initialZoom);
const tileLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:['a','b','c'],maxZoom:19,keepBuffer:1,updateWhenZooming:false,updateWhenIdle:true}).addTo(map);let failedTiles=0;tileLayer.on('tileerror',()=>{failedTiles++;if(failedTiles>=3)notifyNative({type:'map-tile-error'})});tileLayer.on('tileload',()=>{failedTiles=0;notifyNative({type:'map-tiles-ok'})});
const stopLayer=L.layerGroup().addTo(map),busLayer=L.layerGroup().addTo(map),userLayer=L.layerGroup().addTo(map),busMarkers=new Map(),busAnimations=new Map();
const legendControl=L.Control.extend({options:{position:'bottomright'},onAdd:function(){const wrap=L.DomUtil.create('div','leaflet-control-legend'),button=L.DomUtil.create('button','');button.type='button';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 15V9h10v6M8 17h2m4 0h2M8 11h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';button.title='Bus color legend';button.setAttribute('aria-label','Bus color legend');L.DomEvent.disableClickPropagation(button);L.DomEvent.on(button,'click',()=>notifyNative({type:'legend'}));wrap.appendChild(button);return wrap;}});map.addControl(new legendControl());
const locateControl=L.Control.extend({options:{position:'bottomright'},onAdd:function(){const wrap=L.DomUtil.create('div','leaflet-control-locate'),button=L.DomUtil.create('button','');button.type='button';button.textContent='◎';button.title='Center on my location';button.setAttribute('aria-label','Center on my location');L.DomEvent.disableClickPropagation(button);L.DomEvent.on(button,'click',()=>{notifyNative({type:'refresh-buses'});if(currentLocation){map.flyTo([currentLocation.lat,currentLocation.lon],14,{duration:1.0,easeLinearity:.2})}else{notifyNative({type:'locate'});}});wrap.appendChild(button);return wrap;}});map.addControl(new locateControl());
function reportBounds(){const b=map.getBounds();const c=map.getCenter();try{localStorage.setItem('ud-map-center',JSON.stringify({lat:c.lat,lon:c.lng}));}catch{}notifyNative({type:'bounds',bounds:{south:b.getSouth(),west:b.getWest(),north:b.getNorth(),east:b.getEast()}});}
map.on('moveend',reportBounds);map.on('zoomend',reportBounds);setTimeout(reportBounds,250);
function markerFor(v){
 const bg=validColor(v.color)?v.color:'transparent';
 const label=map.getZoom()>=12?String(v.route||'LIVE').slice(0,10):'';
 const fg=textColorFor(bg),knownColour=v.colourKnown===true,estimatedColour=v.colourEstimated===true,displayableColour=knownColour||estimatedColour;
 const badge=knownColour?'':estimatedColour?'<span class="ud-colour-unknown" title="Estimated from fleet details; this colour may be wrong" aria-hidden="true">~</span>':'<span class="ud-colour-unknown" title="No usable physical-colour information" aria-hidden="true">?</span>';
 const markerTitle=estimatedColour?'Estimated bus colour; it may be inaccurate':knownColour?'Colour supplied by the API or a reviewed vehicle record':'Physical bus colour unknown';
 const html='<div class="ud-mobile-bus'+(displayableColour?'':' unknown-colour')+'" title="'+markerTitle+'" style="background:'+bg+';color:'+fg+'">'+
   '<span class="ud-mobile-bus-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 15V9h10v6M8 17h2m4 0h2M8 11h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'+
   '<span class="ud-mobile-bus-label">'+escapeHtml(label)+'</span>'+badge+'</div>';
 return L.marker([Number(v.lat),Number(v.lon)],{zIndexOffset:1000,icon:L.divIcon({className:'ud-bus-icon',html,iconSize:[44,26],iconAnchor:[22,13]})});
}
function animateMarker(marker,target,duration=1100){
 const tLat=Number(target[0]),tLon=Number(target[1]);
 if(!Number.isFinite(tLat)||!Number.isFinite(tLon))return;
 const previous=busAnimations.get(marker);
 if(previous)cancelAnimationFrame(previous);
 const current=marker.getLatLng();
 const fromLat=Number(current.lat),fromLon=Number(current.lng);
 if(!Number.isFinite(fromLat)||!Number.isFinite(fromLon)){
   marker.setLatLng([tLat,tLon]);return;
 }
 const dLat=tLat-fromLat,dLon=tLon-fromLon;
 if(Math.abs(dLat)+Math.abs(dLon)<0.0000002){marker.setLatLng([tLat,tLon]);return;}
 const start=performance.now();
 const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
 const step=now=>{
   const p=Math.min(1,(now-start)/duration),e=ease(p);
   marker.setLatLng([fromLat+dLat*e,fromLon+dLon*e]);
   if(p<1)busAnimations.set(marker,requestAnimationFrame(step));else busAnimations.delete(marker);
 };
 busAnimations.set(marker,requestAnimationFrame(step));
}
function renderBuses(){
 const visible=new Map();
 const bounds=map.getBounds().pad(.12);
 lastBusData.forEach(v=>{const lat=Number(v.lat),lon=Number(v.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||!bounds.contains([lat,lon]))return;visible.set(v.id,v);});
 for(const [id,marker] of busMarkers){if(!visible.has(id)){const frame=busAnimations.get(marker);if(frame)cancelAnimationFrame(frame);busAnimations.delete(marker);busLayer.removeLayer(marker);busMarkers.delete(id);}}
 for(const [id,v] of visible){
   const bg=validColor(v.color)?v.color:'transparent';
   const label=map.getZoom()>=12?String(v.route||'LIVE').slice(0,10):'';
   const existing=busMarkers.get(id);
   if(existing){
     animateMarker(existing,[Number(v.lat),Number(v.lon)]);

     if(existing._udLabel!==label||existing._udBg!==bg||existing._udKnown!==(v.colourKnown===true)||existing._udEstimated!==(v.colourEstimated===true)){
       const next=markerFor(v);next.on('click',()=>openBus(v.id));next._udLabel=label;next._udBg=bg;next._udKnown=v.colourKnown===true;next._udEstimated=v.colourEstimated===true;
       busLayer.removeLayer(existing);busMarkers.set(id,next);next.addTo(busLayer);
     }
   }else{
     const marker=markerFor(v);marker._udLabel=label;marker._udBg=bg;marker._udKnown=v.colourKnown===true;marker._udEstimated=v.colourEstimated===true;marker.on('click',()=>openBus(v.id));marker.addTo(busLayer);busMarkers.set(id,marker);
   }
 }
}
window.updateMap=function(data){
 currentLocation=data.location||null;if(!currentLocation)autoFocused=false;lastBusData=Array.isArray(data.buses)?data.buses:[];
 stopLayer.clearLayers();userLayer.clearLayers();
 const stopIcon=L.divIcon({className:'',html:'<div class="stop-label"></div>',iconSize:[14,14],iconAnchor:[7,7]});
 (Array.isArray(data.stops)?data.stops:[]).forEach(s=>{const popup=document.createElement('div'),title=document.createElement('b'),button=document.createElement('button');title.textContent=s.name;button.textContent='View stop';button.type='button';button.style.marginTop='6px';button.onclick=()=>openStop(s.id);popup.append(title,document.createElement('br'),button);L.marker([s.lat,s.lon],{icon:stopIcon,zIndexOffset:300}).addTo(stopLayer).bindPopup(popup);});
 if(currentLocation&&!autoFocused){autoFocused=true;setTimeout(()=>map.flyTo([currentLocation.lat,currentLocation.lon],14,{duration:1.2,easeLinearity:.2}),80);}
 renderBuses();
 if(currentLocation)L.circleMarker([currentLocation.lat,currentLocation.lon],{radius:9,color:'#fff',weight:3,fillColor:'#0b746b',fillOpacity:1}).addTo(userLayer);
};
notifyNative({type:'map-ready'});
function centerOnUser(){if(currentLocation)map.flyTo([currentLocation.lat,currentLocation.lon],14,{duration:1.2,easeLinearity:.2});}
function openStop(id){notifyNative({type:'stop',stopId:id});}
function openBus(id){
 const marker=busMarkers.get(id);
 if(marker){map.stop();map.flyTo(marker.getLatLng(),18,{duration:.45,easeLinearity:.25});}
 notifyNative({type:'bus',busId:id});
}
function validColor(x){return /^#[0-9a-f]{6}$/i.test(String(x));}
function textColorFor(apiColor){if(!validColor(apiColor))return '#14211B';const h=String(apiColor).slice(1),rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255),lin=rgb.map(c=>c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4));return .2126*lin[0]+.7152*lin[1]+.0722*lin[2]>.179?'#14211B':'#FFFFFF';}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
</script></body></html>`;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 scroll:{width:'100%',maxWidth:760,alignSelf:'center',paddingHorizontal:0,paddingTop:0,paddingBottom:118,backgroundColor:'#F5F6F7'},
 header:{height:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,backgroundColor:colors.accentDark},
 brandRow:{flexDirection:'row',alignItems:'center'},brandCopy:{marginLeft:9},brand:{fontSize:17,fontWeight:'900',letterSpacing:.8,color:'#FFFFFF'},tagline:{fontSize:10,color:'rgba(255,255,255,.82)',marginTop:2},
 search:{height:48,borderRadius:0,backgroundColor:colors.surface,borderWidth:0,flexDirection:'row',alignItems:'center',paddingHorizontal:13,marginTop:10,marginHorizontal:14,elevation:4,shadowColor:'#071019',shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:2},zIndex:10},
 searchIcon:{fontSize:23,color:colors.text,marginRight:8},searchInput:{flex:1,fontSize:13,color:colors.text,paddingVertical:0},searchKey:{fontSize:20,fontWeight:'800',color:colors.textMuted,paddingHorizontal:3},
 searchResults:{marginTop:7,borderRadius:0,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,overflow:'hidden'},searchResult:{minHeight:52,paddingHorizontal:12,paddingVertical:9,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border},searchBadge:{minWidth:48,height:30,borderRadius:0,alignItems:'center',justifyContent:'center',paddingHorizontal:6},searchBadgeText:{fontSize:10,fontWeight:'900'},searchStopIcon:{width:30,height:30,borderRadius:0,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},searchStopDot:{fontSize:9,color:colors.accent},searchCopy:{flex:1,marginLeft:9},searchTitle:{fontSize:11,fontWeight:'900',color:colors.text},searchMeta:{fontSize:9,color:colors.textMuted,marginTop:2},searchArrow:{fontSize:21,color:colors.textMuted},searchEmpty:{padding:13,fontSize:10,color:colors.textMuted},searchError:{padding:13,fontSize:10,color:colors.danger},
 sectionLine:{display:'none'},sectionKicker:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:colors.textMuted},locationLink:{fontSize:11,fontWeight:'900',color:colors.accent},
 mapCard:{borderRadius:0,overflow:'hidden',borderWidth:1,borderColor:colors.border,backgroundColor:'#DDE4E5',marginTop:12,marginHorizontal:0},map:{flex:1},
 mapErrorOverlay:{position:'absolute',left:10,right:10,top:10,bottom:10,alignItems:'center',justifyContent:'center',padding:18,backgroundColor:'rgba(255,254,250,.97)',borderWidth:1,borderColor:colors.border,zIndex:10},mapErrorTitle:{fontSize:16,fontWeight:'900',color:colors.text},mapErrorText:{fontSize:12,lineHeight:18,textAlign:'center',color:colors.textMuted,marginTop:6},mapRetry:{marginTop:12,paddingHorizontal:18,paddingVertical:10,backgroundColor:colors.accentDark},mapRetryText:{fontSize:12,fontWeight:'900',color:'#FFFFFF'},
 legendOverlay:{flex:1,backgroundColor:'rgba(23,49,47,.42)',alignItems:'center',justifyContent:'center',padding:16},
 legendDialog:{width:'100%',maxWidth:360,maxHeight:'85%',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,padding:14},
 legendTitle:{fontSize:22,fontWeight:'800',color:colors.text,marginBottom:12},
 legendHeader:{flexDirection:'row',justifyContent:'flex-start',paddingBottom:7,borderBottomWidth:0,borderBottomColor:colors.border},
 legendHeaderText:{width:160,fontSize:13,fontWeight:'500',color:colors.textMuted},
 legendRow:{flexDirection:'row',alignItems:'center',justifyContent:'flex-start',minHeight:32,borderBottomWidth:0},
 legendIcons:{flexDirection:'row',gap:8,width:160,flexGrow:0,flexShrink:0},
 legendBus:{width:36,height:26,borderRadius:0,alignItems:'center',justifyContent:'center'},
 legendBusWindow:{position:'absolute',left:4,right:4,top:3,height:3,backgroundColor:'rgba(255,255,255,.22)'},
 legendBusWindshield:{position:'absolute',left:5,right:5,top:8,height:3,backgroundColor:'rgba(255,255,255,.9)'},
 legendBusLightRow:{position:'absolute',left:4,right:4,bottom:2,flexDirection:'row',justifyContent:'space-between'},
 legendBusLight:{width:3,height:2,borderRadius:0,backgroundColor:'#fff'},

 legendType:{flex:1,fontSize:14,fontWeight:'500',color:colors.text,textAlign:'left'},
 legendClose:{marginTop:8,minHeight:44,alignItems:'center',justifyContent:'center',backgroundColor:'#C7352C',paddingHorizontal:16},
 legendCloseText:{fontSize:14,fontWeight:'800',color:'#fff'},
 mapTop:{position:'absolute',left:10,top:10,flexDirection:'row',alignItems:'center',backgroundColor:'rgba(255,255,255,.94)',paddingHorizontal:9,paddingVertical:6,borderRadius:0},liveDot:{width:7,height:7,borderRadius:0,backgroundColor:colors.success,marginRight:6},mapTopText:{fontSize:10,fontWeight:'900',color:colors.text},mapAttribution:{position:'absolute',right:7,bottom:6,backgroundColor:'rgba(255,255,255,.9)',paddingHorizontal:5,paddingVertical:2,borderRadius:0},mapAttributionText:{fontSize:7,color:'#52625f'},mapLegend:{position:'absolute',left:7,bottom:7,flexDirection:'row',gap:7,backgroundColor:'rgba(255,255,255,.94)',paddingHorizontal:7,paddingVertical:5,borderRadius:0,borderWidth:1,borderColor:colors.border},legendItem:{flexDirection:'row',alignItems:'center',gap:3},legendDot:{width:7,height:7,borderRadius:0},legendText:{fontSize:8,fontWeight:'800',color:colors.text},
 locationNotice:{position:'absolute',left:10,right:10,bottom:10,padding:9,borderRadius:0,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-between'},
 busPreview:{position:'absolute',left:9,right:9,bottom:9,borderRadius:0,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,shadowColor:'#17312F',shadowOpacity:.14,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:6},
 busPreviewBody:{minHeight:72,padding:11,paddingRight:28,flexDirection:'row',alignItems:'center'},
 busPreviewClose:{position:'absolute',right:6,top:5,zIndex:3,width:25,height:25,borderRadius:0,alignItems:'center',justifyContent:'center',backgroundColor:colors.background},
 busPreviewCloseText:{fontSize:19,lineHeight:21,color:colors.textMuted},
 busPreviewBadge:{minWidth:58,height:40,borderRadius:0,paddingHorizontal:8,alignItems:'center',justifyContent:'center'},
 busPreviewBadgeText:{fontSize:13,fontWeight:'900'},
 busPreviewCopy:{flex:1,marginLeft:10},
 busPreviewEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1,color:colors.accent},
 busPreviewTitle:{fontSize:14,fontWeight:'900',color:colors.text,marginTop:2},
 busPreviewMeta:{fontSize:9,color:colors.textMuted,marginTop:3},
 busPreviewArrow:{fontSize:27,color:colors.textMuted,marginLeft:6},locationNoticeText:{fontSize:11,color:colors.textMuted},retry:{fontSize:11,fontWeight:'900',color:colors.accent},
 quickRow:{display:'none'},quick:{flex:1,minHeight:72,padding:10,borderRadius:0,backgroundColor:colors.surface,borderWidth:0,borderColor:colors.border},quickIcon:{fontSize:18,fontWeight:'900'},quickTitle:{fontSize:12,fontWeight:'900',color:colors.text,marginTop:4},quickSub:{fontSize:9,color:colors.textMuted,marginTop:1},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:10,marginBottom:0,paddingTop:16,paddingHorizontal:14,paddingBottom:8,backgroundColor:colors.surface,borderTopLeftRadius:0,borderTopRightRadius:0},sectionTitle:{fontSize:16,fontWeight:'900',color:colors.text},sectionSub:{fontSize:10,color:colors.textMuted,marginTop:2},seeAll:{fontSize:11,fontWeight:'900',color:colors.accent},
 stopCard:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:11,borderRadius:0,backgroundColor:colors.surface,borderWidth:0,borderTopWidth:1,borderColor:'#EDF0F1',marginBottom:0},stopIcon:{width:30,height:30,borderRadius:0,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},stopIconText:{fontSize:10,color:colors.accent},stopCopy:{flex:1,marginLeft:10},stopName:{fontSize:13,fontWeight:'800',color:colors.text},stopDistance:{fontSize:10,color:colors.textMuted,marginTop:2},arrow:{fontSize:24,color:colors.textMuted,marginLeft:7},
 emptyCard:{padding:18,borderRadius:0,backgroundColor:colors.surface,borderWidth:0,borderTopWidth:1,borderColor:'#EDF0F1'},emptyTitle:{fontSize:13,fontWeight:'900',color:colors.text},emptyText:{fontSize:11,color:colors.textMuted,marginTop:3},
 legal:{alignItems:'center',paddingVertical:18},legalText:{fontSize:10,fontWeight:'800',color:colors.textMuted},
 systemNavBackground:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:'#000000',zIndex:20},
 bottomNav:{position:'absolute',left:0,right:0,bottom:0,maxWidth:760,alignSelf:'center',height:62,borderRadius:0,backgroundColor:colors.accentDark,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingBottom:0,elevation:10,shadowColor:'#071019',shadowOpacity:.25,shadowRadius:16,shadowOffset:{width:0,height:7}},bottomItem:{width:78,height:52,borderRadius:0,alignItems:'center',justifyContent:'center'},bottomIcon:{fontSize:19,fontWeight:'900'},bottomLabel:{fontSize:9,fontWeight:'800',marginTop:3}
});
