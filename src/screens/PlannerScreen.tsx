import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, TripPlanOption } from '../api/client';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { displayRouteName } from '../lib/routeDisplay';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Planner'>;

export default function PlannerScreen() {
  const navigation = useNavigation<Nav>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<TripPlanOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const swap = () => { const value = from; setFrom(to); setTo(value); };

  const plan = async () => {
    if (from.trim().length < 2 || to.trim().length < 2) {
      setError('Enter both a starting place and destination.');
      return;
    }
    setLoading(true); setError(null); setOptions([]);
    try {
      const result = await api.plan(from.trim(), to.trim());
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
            <Text style={styles.subtitle}>Bus journeys across Delhi</Text>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldRow}>
            <View style={styles.rail}><View style={styles.originDot}/><View style={styles.railLine}/><View style={styles.destinationDot}/></View>
            <View style={styles.fields}>
              <Text style={styles.fieldLabel}>FROM</Text>
              <TextInput value={from} onChangeText={setFrom} placeholder="Starting stop or place" placeholderTextColor={colors.textMuted} style={styles.input}/>
              <View style={styles.divider}/>
              <Text style={styles.fieldLabel}>TO</Text>
              <TextInput value={to} onChangeText={setTo} placeholder="Where do you want to go?" placeholderTextColor={colors.textMuted} style={styles.input}/>
            </View>
            <Pressable onPress={swap} style={styles.swap}><Text style={styles.swapText}>↕</Text></Pressable>
          </View>
          <Pressable style={styles.planButton} onPress={plan} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.planText}>Find buses</Text>}
          </Pressable>
        </View>

        {error ? <View style={styles.error}><Text style={styles.errorTitle}>Couldn't plan this trip</Text><Text style={styles.errorText}>{error}</Text></View> : null}

        {options.length > 0 ? <Text style={styles.resultsTitle}>{options.length} journey options</Text> : null}
        {options.map((option, index) => (
          <View key={`${option.type}-${index}`} style={[styles.option, index === 0 && styles.optionFeatured]}>
            <View style={styles.optionTop}>
              <View>
                <Text style={styles.optionType}>{index === 0 ? 'RECOMMENDED' : option.type === 'direct' ? 'DIRECT BUS' : 'ONE CHANGE'}</Text>
                <Text style={styles.duration}>{option.durationMinutes} min</Text>
              </View>
              <View style={styles.walkPill}><Text style={styles.walkText}>Walk {option.walkingMinutes} min</Text></View>
            </View>
            {option.legs.map((leg, legIndex) => (
              <View key={`${leg.routeId}-${legIndex}`} style={styles.leg}>
                <View style={styles.routeBadge}><Text style={styles.routeBadgeText}>{displayRouteName(leg.routeName) || leg.routeId}</Text></View>
                <View style={styles.legCopy}>
                  <Text style={styles.legRoute}>Bus {displayRouteName(leg.routeName) || leg.routeId}</Text>
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
 header:{paddingHorizontal:18,paddingTop:8,paddingBottom:14,flexDirection:'row',alignItems:'center'},back:{width:42,height:42,alignItems:'center',justifyContent:'center'},backText:{fontSize:36,color:colors.text,lineHeight:40},headerCopy:{marginLeft:2},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},title:{fontSize:24,fontWeight:'900',color:colors.text,marginTop:2},subtitle:{fontSize:12,color:colors.textMuted,marginTop:2},
 form:{marginHorizontal:18,padding:16,borderRadius:20,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
 fieldRow:{flexDirection:'row'},rail:{width:20,alignItems:'center',paddingTop:7},originDot:{width:9,height:9,borderRadius:5,borderWidth:2,borderColor:colors.accent,backgroundColor:colors.surface},destinationDot:{width:9,height:9,borderRadius:5,backgroundColor:colors.secondary},railLine:{width:2,flex:1,backgroundColor:colors.border,marginVertical:4},fields:{flex:1},fieldLabel:{fontSize:9,fontWeight:'900',letterSpacing:1,color:colors.textMuted},input:{height:38,fontSize:15,color:colors.text,fontWeight:'700'},divider:{height:1,backgroundColor:colors.border,marginVertical:5},swap:{width:38,height:38,borderRadius:19,backgroundColor:colors.surfaceAlt,alignItems:'center',justifyContent:'center',marginLeft:7,marginTop:15},swapText:{fontSize:20,fontWeight:'900',color:colors.accent},
 planButton:{height:48,borderRadius:14,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',marginTop:14},planText:{fontSize:14,fontWeight:'900',color:'#fff'},
 error:{marginHorizontal:18,marginTop:12,padding:13,borderRadius:15,backgroundColor:colors.dangerSoft,borderWidth:1,borderColor:colors.danger},errorTitle:{fontSize:13,fontWeight:'900',color:colors.danger},errorText:{fontSize:12,color:colors.textMuted,marginTop:3,lineHeight:17},
 resultsTitle:{fontSize:17,fontWeight:'900',color:colors.text,marginHorizontal:18,marginTop:20,marginBottom:9},option:{marginHorizontal:18,marginBottom:10,padding:15,borderRadius:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},optionFeatured:{borderColor:colors.accent},optionTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},optionType:{fontSize:9,fontWeight:'900',letterSpacing:1,color:colors.accent},duration:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:2},walkPill:{paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:colors.secondarySoft},walkText:{fontSize:10,fontWeight:'800',color:colors.warning},
 leg:{flexDirection:'row',alignItems:'center',marginTop:13,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border},routeBadge:{minWidth:54,height:34,paddingHorizontal:9,borderRadius:9,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},routeBadgeText:{fontSize:14,fontWeight:'900',color:colors.accent},legCopy:{flex:1,marginLeft:10},legRoute:{fontSize:12,fontWeight:'800',color:colors.text},legStops:{fontSize:11,color:colors.textMuted,marginTop:3},transfer:{fontSize:11,fontWeight:'700',color:colors.warning,marginTop:10},
 empty:{margin:18,padding:25,borderRadius:20,backgroundColor:colors.surfaceAlt,alignItems:'center'},emptyIcon:{fontSize:28,color:colors.accent},emptyTitle:{fontSize:17,fontWeight:'900',color:colors.text,marginTop:7},emptyText:{fontSize:12,lineHeight:18,color:colors.textMuted,textAlign:'center',marginTop:5}
});