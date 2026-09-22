import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,FlatList,Pressable,SafeAreaView,StyleSheet,Text,View} from 'react-native';
import MapView,{Marker,Polyline} from 'react-native-maps';
import {useNavigation,useRoute,RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {api,Route as ApiRoute,Stop,Vehicle} from '../api/client';
import {colors} from '../theme';
import {StatusPill} from '../components/StatusPill';
import type {RootStackParamList} from '../navigation/types';
type Nav=NativeStackNavigationProp<RootStackParamList,'RouteDetails'>;type RouteDetailsRoute=RouteProp<RootStackParamList,'RouteDetails'>;
export default function RouteDetailsScreen(){
 const navigation=useNavigation<Nav>();const {params}=useRoute<RouteDetailsRoute>();const {routeId,label}=params;
 const [route,setRoute]=useState<ApiRoute|null>(null),[stops,setStops]=useState<Stop[]>([]),[vehicles,setVehicles]=useState<Vehicle[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);try{const result=await api.route(routeId);if(result.status==='OK'){setRoute(result.route);setStops(result.stops);setVehicles(result.vehicles);setError(null);}else setError('Route details are unavailable.');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[routeId]);
 useEffect(()=>{load();const interval=setInterval(load,20000);return()=>clearInterval(interval);},[load]);
 const polylineCoords=stops.map(s=>({latitude:s.latitude,longitude:s.longitude}));
 return <SafeAreaView style={styles.safe}><View style={styles.header}><Pressable onPress={()=>navigation.goBack()}><Text style={styles.back}>Back</Text></Pressable><Text style={styles.title}>{route?.short_name||label||routeId}</Text>{route?.long_name?<Text style={styles.subtitle}>{route.long_name}</Text>:null}<StatusPill label={error?'Unavailable':`${vehicles.length} live vehicles`} tone={error?'danger':vehicles.length>0?'ok':'muted'}/></View>
 {loading?<ActivityIndicator color={colors.accent} style={{marginTop:12}}/>:null}{error?<Text style={styles.errorText}>{error}</Text>:null}
 {polylineCoords.length>1?<View style={styles.mapWrap}><MapView style={styles.map} initialRegion={{latitude:polylineCoords[0].latitude,longitude:polylineCoords[0].longitude,latitudeDelta:0.08,longitudeDelta:0.08}}><Polyline coordinates={polylineCoords} strokeColor={colors.accent} strokeWidth={3}/>{stops.map(s=><Marker key={s.stop_id} coordinate={{latitude:s.latitude,longitude:s.longitude}} title={s.name} pinColor={colors.warning}/>)}{vehicles.map(v=><Marker key={v.id} coordinate={{latitude:v.latitude,longitude:v.longitude}} title="Live bus" pinColor={colors.accent}/>)}</MapView></View>:null}
 <FlatList data={stops} keyExtractor={item=>item.stop_id} contentContainerStyle={styles.list} ListHeaderComponent={<Text style={styles.listTitle}>Stops in order</Text>} renderItem={({item,index})=><Pressable style={styles.stopRow} onPress={()=>navigation.navigate('StopDetails',{stopId:item.stop_id,stopName:item.name})}><Text style={styles.stopIndex}>{index+1}</Text><Text style={styles.stopName}>{item.name}</Text></Pressable>}/>
 </SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},header:{paddingHorizontal:20,paddingTop:12,gap:6},back:{color:colors.accent,fontSize:15,fontWeight:'600'},title:{color:colors.text,fontSize:26,fontWeight:'800'},subtitle:{color:colors.textMuted,fontSize:14},errorText:{color:colors.danger,marginHorizontal:20,marginTop:8,fontSize:13},mapWrap:{marginTop:14,marginHorizontal:20,height:200,borderRadius:18,overflow:'hidden'},map:{flex:1},list:{paddingHorizontal:20,paddingTop:16,paddingBottom:24},listTitle:{color:colors.text,fontSize:16,fontWeight:'700',marginBottom:8},stopRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:colors.surface,borderRadius:12,padding:12,marginBottom:8},stopIndex:{color:colors.accent,fontWeight:'800',width:22},stopName:{color:colors.text,fontSize:14,flexShrink:1}});
