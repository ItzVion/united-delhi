import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, TripPlanOption } from '../api/client';
type PlannerSuggestion = {id:string;label:string;mode:'bus'|'metro'};
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';
import { resolveRouteColor } from '../lib/routeColor';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Planner'>;

export default function PlannerScreen() {
  const navigation = useNavigation<Nav>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromStopId, setFromStopId] = useState<string | null>(null);
  const [toStopId, setToStopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<TripPlanOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<PlannerSuggestion[]>([]);
  const [toSuggestions, setToSuggestions] = useState<PlannerSuggestion[]>([]);
  const [metroStops, setMetroStops] = useState<PlannerSuggestion[]>([]);
  const [fromMode, setFromMode] = useState<'bus'|'metro'>('bus');
  const [toMode, setToMode] = useState<'bus'|'metro'>('bus');
  const [fromFocus, setFromFocus] = useState(false);
  const [toFocus, setToFocus] = useState(false);

  useEffect(() => {
    const value=from.trim();
    if(value.length<2){setFromSuggestions([]);return;}
    let active=true;
    const timer=setTimeout(async()=>{try{const r=await api.search(value);if(active){const bus=(r.results||[]).filter(x=>x.type==='stop').slice(0,8).map(x=>({id:x.id,label:x.label,mode:'bus' as const}));const metro=metroStops.filter(x=>x.label.toLowerCase().includes(value.toLowerCase())).map(x=>({...x,mode:'metro' as const}));setFromSuggestions([...bus,...metro].slice(0,8));}}catch{if(active)setFromSuggestions([]);}},180);
    return()=>{active=false;clearTimeout(timer);};
  },[from,metroStops]);
  useEffect(() => {
    const value=to.trim();
    if(value.length<2){setToSuggestions([]);return;}
    let active=true;
    const timer=setTimeout(async()=>{try{const r=await api.search(value);if(active){const bus=(r.results||[]).filter(x=>x.type==='stop').slice(0,8).map(x=>({id:x.id,label:x.label,mode:'bus' as const}));const metro=metroStops.filter(x=>x.label.toLowerCase().includes(value.toLowerCase())).map(x=>({...x,mode:'metro' as const}));setToSuggestions([...bus,...metro].slice(0,8));}}catch{if(active)setToSuggestions([]);}},180);
    return()=>{active=false;clearTimeout(timer);};
  },[to,metroStops]);
  const swap = () => { const value = from; const valueId = fromStopId; const mode=fromMode; setFrom(to); setTo(value); setFromStopId(toStopId); setToStopId(valueId); setFromMode(toMode); setToMode(mode); };

  const plan = async () => {
    if (from.trim().length < 2 || to.trim().length < 2) {
      setError('Select a starting bus stop and destination.');
      return;
    }
    setLoading(true); setError(null); setOptions([]); setFromFocus(false); setToFocus(false);
    try {
      const result = (fromMode==='bus'&&toMode==='bus') ? await api.plan(from.trim(), to.trim(), fromStopId ?? undefined, toStopId ?? undefined) : await api.planMultimodal(fromMode,toMode,String(fromStopId),String(toStopId));
      if (result.status === 'OK') setOptions(result.options);
      else setError(result.reason || 'No journey could be planned.');
    } catch (e) {
      setError((e as Error).message || 'Journey planner is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => navigation.goBack()}><Text style={styles.backText}>‹</Text></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>JOURNEY PLANNER</Text>
            <Text style={styles.title}>Plan your ride</Text>
            <Text style={styles.subtitle}>Bus, Metro and combined journeys across Delhi</Text>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldRow}>
            <View style={styles.rail}><View style={styles.originDot}/><View style={styles.railLine}/><View style={styles.destinationDot}/></View>
            <View style={styles.fields}>
              <Text style={styles.fieldLabel}>FROM</Text>
              <View style={styles.inputWrap}>
                <TextInput value={from} onFocus={()=>setFromFocus(true)} onChangeText={value=>{setFrom(value);setFromStopId(null);setFromFocus(true);}} placeholder="Starting bus stop or Metro station" placeholderTextColor={colors.textMuted} style={styles.input}/>
                {fromFocus && fromSuggestions.length>0 ? <View style={styles.suggestions}>{fromSuggestions.map(s=><Pressable key={s.mode+':'+s.id} style={styles.suggestion} onPress={()=>{setFrom(s.label);setFromStopId(s.id);setFromMode(s.mode);setFromSuggestions([]);setFromFocus(false);}}><View style={styles.suggestionIcon}><Text style={styles.suggestionDot}>{s.mode==='metro'?'M':'B'}</Text></View><View style={styles.suggestionCopy}><Text style={styles.suggestionTitle} numberOfLines={1}>{s.label}</Text><Text style={styles.suggestionMeta}>{s.mode==='metro'?'Metro station':'Bus stop'} · {s.id}</Text></View><Text style={styles.suggestionArrow}>›</Text></Pressable>)}</View> : null}
              </View>
              <View style={styles.divider}/>
              <Text style={styles.fieldLabel}>TO</Text>
              <View style={styles.inputWrap}>
                <TextInput value={to} onFocus={()=>setToFocus(true)} onChangeText={value=>{setTo(value);setToStopId(null);setToFocus(true);}} placeholder="Destination bus stop or Metro station" placeholderTextColor={colors.textMuted} style={styles.input}/>
                {toFocus && toSuggestions.length>0 ? <View style={styles.suggestions}>{toSuggestions.map(s=><Pressable key={s.mode+':'+s.id} style={styles.suggestion} onPress={()=>{setTo(s.label);setToStopId(s.id);setToMode(s.mode);setToSuggestions([]);setToFocus(false);}}><View style={styles.suggestionIcon}><Text style={styles.suggestionDot}>{s.mode==='metro'?'M':'B'}</Text></View><View style={styles.suggestionCopy}><Text style={styles.suggestionTitle} numberOfLines={1}>{s.label}</Text><Text style={styles.suggestionMeta}>{s.mode==='metro'?'Metro station':'Bus stop'} · {s.id}</Text></View><Text style={styles.suggestionArrow}>›</Text></Pressable>)}</View> : null}
              </View>
            </View>
            <Pressable onPress={swap} style={styles.swap}><Text style={styles.swapText}>↕</Text></Pressable>
          </View>
          <Pressable style={styles.planButton} onPress={plan} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.planText}>Find journeys</Text>}
          </Pressable>
        </View>

        {error ? <View style={styles.error}><Text style={styles.errorTitle}>Couldn't plan this trip</Text><Text style={styles.errorText}>{error}</Text></View> : null}

        {options.length > 0 ? <Text style={styles.resultsTitle}>{options.length} journey options</Text> : null}
        {options.map((option, index) => (
          <View key={`${option.type}-${index}`} style={[styles.option, index === 0 && styles.optionFeatured]}>
            <View style={styles.optionTop}>
              <View>
                <Text style={styles.optionType}>{option.journeyMode==='mixed'?'BUS + METRO':option.journeyMode==='metro'?'METRO JOURNEY':option.type === 'direct' ? 'DIRECT BUS' : 'BUS TRANSFER'}</Text>
                <Text style={styles.duration}>{option.durationMinutes} min</Text>
              </View>
              <View style={styles.walkPill}><Text style={styles.walkText}>{option.durationIsEstimate?'ESTIMATED TIME':'TRAVEL TIME'}{option.walkingMinutes!=null?` · ${option.walkingMinutes} min walk`:''}</Text></View>
            </View>
            {option.legs.map((leg, legIndex) => (
              <View key={`${leg.routeId}-${legIndex}`} style={styles.leg}>
                {(() => { const name=displayRouteName(leg.routeName)||'Bus'; const rc=resolveRouteColor(name,leg.routeColor,leg.routeTextColor); return <View style={[styles.routeBadge,{backgroundColor:rc.background}]}><Text style={[styles.routeBadgeText,{color:rc.text}]}>{name}</Text></View>; })()}
                <View style={styles.legCopy}>
                  <Text style={styles.legRoute}>Bus {displayRouteName(leg.routeName) || 'Bus'}</Text>
                  <Text style={styles.legStops} numberOfLines={1}>{leg.fromStop} → {leg.toStop}</Text>
                </View>
              </View>
            ))}
            {option.transferStop ? <Text style={styles.transfer}>Change buses at {option.transferStop}</Text> : null}
          </View>
        ))}

        {!loading && !error && options.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>↗</Text>
            <Text style={styles.emptyTitle}>Where are you going?</Text>
            <Text style={styles.emptyText}>Enter two Delhi stops or place names and United Delhi will find direct and one-change bus journeys.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},content:{paddingBottom:32},
 inputWrap:{position:'relative',zIndex:10},
 suggestions:{position:'absolute',left:0,right:0,top:39,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,zIndex:100,elevation:12,shadowColor:'#000',shadowOpacity:.12,shadowRadius:8,shadowOffset:{width:0,height:3}},
 suggestion:{minHeight:50,paddingHorizontal:9,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border},
 suggestionIcon:{width:28,height:28,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},suggestionDot:{fontSize:8,color:colors.accent},suggestionCopy:{flex:1,marginLeft:8},suggestionTitle:{fontSize:11,fontWeight:'800',color:colors.text},suggestionMeta:{fontSize:9,color:colors.textMuted,marginTop:2},suggestionArrow:{fontSize:20,color:colors.textMuted},
 header:{paddingHorizontal:18,paddingTop:8,paddingBottom:14,flexDirection:'row',alignItems:'center'},back:{width:42,height:42,alignItems:'center',justifyContent:'center'},backText:{fontSize:36,color:colors.text,lineHeight:40},headerCopy:{marginLeft:2},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},title:{fontSize:24,fontWeight:'900',color:colors.text,marginTop:2},subtitle:{fontSize:12,color:colors.textMuted,marginTop:2},
 form:{marginHorizontal:18,padding:16,borderRadius:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
 fieldRow:{flexDirection:'row'},rail:{width:20,alignItems:'center',paddingTop:7},originDot:{width:9,height:9,borderRadius:14,borderWidth:2,borderColor:colors.accent,backgroundColor:colors.surface},destinationDot:{width:9,height:9,borderRadius:14,backgroundColor:colors.secondary},railLine:{width:2,flex:1,backgroundColor:colors.border,marginVertical:4},fields:{flex:1},fieldLabel:{fontSize:9,fontWeight:'900',letterSpacing:1,color:colors.textMuted},input:{height:38,fontSize:15,color:colors.text,fontWeight:'700'},divider:{height:1,backgroundColor:colors.border,marginVertical:5},swap:{width:38,height:38,borderRadius:14,backgroundColor:colors.surfaceAlt,alignItems:'center',justifyContent:'center',marginLeft:7,marginTop:15},swapText:{fontSize:20,fontWeight:'900',color:colors.accent},
 planButton:{height:48,borderRadius:14,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',marginTop:14},planText:{fontSize:14,fontWeight:'900',color:'#fff'},
 error:{marginHorizontal:18,marginTop:12,padding:13,borderRadius:14,backgroundColor:colors.dangerSoft,borderWidth:1,borderColor:colors.danger},errorTitle:{fontSize:13,fontWeight:'900',color:colors.danger},errorText:{fontSize:12,color:colors.textMuted,marginTop:3,lineHeight:17},
 resultsTitle:{fontSize:17,fontWeight:'900',color:colors.text,marginHorizontal:18,marginTop:20,marginBottom:9},option:{marginHorizontal:18,marginBottom:10,padding:15,borderRadius:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},optionFeatured:{borderColor:colors.accent},optionTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},optionType:{fontSize:9,fontWeight:'900',letterSpacing:1,color:colors.accent},duration:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:2},walkPill:{paddingHorizontal:9,paddingVertical:6,borderRadius:14,backgroundColor:colors.secondarySoft},walkText:{fontSize:10,fontWeight:'800',color:colors.warning},
 leg:{flexDirection:'row',alignItems:'center',marginTop:13,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border},routeBadge:{minWidth:54,height:34,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},routeBadgeText:{fontSize:14,fontWeight:'900',color:colors.accent},legCopy:{flex:1,marginLeft:10},legRoute:{fontSize:12,fontWeight:'800',color:colors.text},legStops:{fontSize:11,color:colors.textMuted,marginTop:3},transfer:{fontSize:11,fontWeight:'700',color:colors.warning,marginTop:10},
 empty:{margin:18,padding:25,borderRadius:14,backgroundColor:colors.surfaceAlt,alignItems:'center'},emptyIcon:{fontSize:28,color:colors.accent},emptyTitle:{fontSize:17,fontWeight:'900',color:colors.text,marginTop:7},emptyText:{fontSize:12,lineHeight:18,color:colors.textMuted,textAlign:'center',marginTop:5}
});