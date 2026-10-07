import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export default function MetroScreen(){return <SafeAreaView style={styles.safe}><View style={styles.content}><Text style={styles.eyebrow}>DELHI METRO</Text><Text style={styles.title}>Metro</Text><View style={styles.card}><Text style={styles.cardTitle}>Metro data is not connected yet</Text><Text style={styles.body}>United Delhi currently has reliable bus data only. We will add metro routes when a reliable metro data source is connected.</Text></View></View></SafeAreaView>}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:20},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},title:{fontSize:28,fontWeight:'900',color:colors.text,marginTop:4},card:{marginTop:18,padding:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},cardTitle:{fontSize:17,fontWeight:'900',color:colors.text},body:{fontSize:13,lineHeight:20,color:colors.textMuted,marginTop:7}});
