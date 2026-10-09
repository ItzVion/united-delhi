import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';

const faq:[string,string][]=[
 ['Why is a bus missing or not moving?','Vehicle positions come from the upstream live feed. A bus may disappear or look stationary when the feed is delayed, a vehicle has not reported a recent position, or network service is unavailable.'],
 ['Why does the map look blank?','The map needs an internet connection to load Leaflet and OpenStreetMap tiles. Check the connection, then use Retry map on the map panel.'],
 ['Why does the app ask for location?','Location is optional. It is used to find nearby stops and centre the map; you can continue using the app without granting location permission.'],
 ['Are metro trains tracked live?','No. The Metro section shows lines and station sequences from static network data. It does not show live train locations or arrival predictions.'],
 ['Are arrival times guaranteed?','No. Vehicle positions and journey planning can be delayed or incomplete. Check local signs and official transport information when timing matters.']
];

export default function HelpScreen(){
 const navigation=useNavigation();
 return <SafeAreaView style={styles.safe}><View style={styles.header}><Pressable onPress={()=>navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹  Back</Text></Pressable><View style={styles.headCopy}><Text style={styles.eyebrow}>UNITED DELHI</Text><Text style={styles.title}>Help & FAQs</Text></View></View>
 <ScrollView contentContainerStyle={styles.content}>{faq.map(([q,a])=><View key={q} style={styles.card}><Text style={styles.question}>{q}</Text><Text style={styles.answer}>{a}</Text></View>)}<View style={styles.note}><Text style={styles.question}>Still stuck?</Text><Text style={styles.answer}>Open Settings → About United Delhi for data sources, or Legal & Privacy for service and privacy details.</Text></View></ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},header:{minHeight:70,flexDirection:'row',alignItems:'center',paddingHorizontal:16,backgroundColor:colors.accentDark},back:{paddingRight:14,paddingVertical:10},backText:{fontSize:12,fontWeight:'800',color:colors.secondary},headCopy:{flex:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.secondary},title:{fontSize:21,fontWeight:'900',color:'#FFFFFF',marginTop:3},content:{padding:16,paddingBottom:32},card:{padding:15,marginBottom:8,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},question:{fontSize:13,fontWeight:'900',color:colors.text},answer:{fontSize:12,lineHeight:18,color:colors.textMuted,marginTop:6},note:{padding:15,marginTop:6,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceAlt}});
