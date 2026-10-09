import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

export default function AboutScreen(){
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList,'About'>>();
  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Pressable onPress={()=>navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹  Back</Text></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>UNITED DELHI</Text><Text style={styles.title}>About this app</Text></View></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><Text style={styles.name}>United Delhi</Text><Text style={styles.tagline}>Delhi transit, in one place.</Text><Text style={styles.heroBody}>An independent transit-information app for exploring DTC bus positions, routes, bus stops, nearby stops and direct bus trip planning.</Text></View>
      <Text style={styles.section}>Data and maps</Text>
      <View style={styles.card}><Text style={styles.cardTitle}>Live bus positions</Text><Text style={styles.body}>Vehicle locations are received from Delhi Open Transit Data through the United Delhi API. Availability and freshness depend on the upstream feed.</Text></View>
      <View style={styles.card}><Text style={styles.cardTitle}>Routes and stops</Text><Text style={styles.body}>Static transit data connects route and stop details. Metro lines and station sequences are shown where the metro dataset is available.</Text></View>
      <View style={styles.card}><Text style={styles.cardTitle}>Map</Text><Text style={styles.body}>The map uses Leaflet and OpenStreetMap map tiles. © OpenStreetMap contributors.</Text></View>
      <View style={styles.card}><Text style={styles.cardTitle}>Independent project</Text><Text style={styles.body}>United Delhi is not an official DTC, Delhi Government or Delhi Metro Rail Corporation app, and it does not sell tickets or passes.</Text></View>
      <Text style={styles.version}>United Delhi · Version 1.0.8</Text>
      <Pressable style={styles.legalLink} onPress={()=>navigation.navigate('Legal')}><Text style={styles.legalLinkText}>Read Legal & Privacy information ›</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},header:{minHeight:70,flexDirection:'row',alignItems:'center',paddingHorizontal:16,backgroundColor:colors.accentDark},back:{paddingRight:14,paddingVertical:10},backText:{fontSize:12,fontWeight:'800',color:colors.secondary},headerCopy:{flex:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.secondary},title:{fontSize:21,fontWeight:'900',color:'#FFFFFF',marginTop:3},content:{padding:16,paddingBottom:32},hero:{padding:18,backgroundColor:colors.accentDark},name:{fontSize:22,fontWeight:'900',color:'#FFFFFF'},tagline:{fontSize:12,fontWeight:'700',color:colors.secondary,marginTop:3},heroBody:{fontSize:12,lineHeight:19,color:'#FFFFFF',marginTop:9},body:{fontSize:12,lineHeight:18,color:colors.textMuted,marginTop:6},section:{fontSize:11,fontWeight:'900',letterSpacing:.7,color:colors.textMuted,marginTop:18,marginBottom:7,textTransform:'uppercase'},card:{padding:14,marginBottom:8,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},cardTitle:{fontSize:13,fontWeight:'900',color:colors.text},version:{fontSize:10,color:colors.textMuted,textAlign:'center',marginTop:16},legalLink:{alignItems:'center',padding:12},legalLinkText:{fontSize:11,fontWeight:'800',color:colors.accent}});
