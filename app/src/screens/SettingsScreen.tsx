import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Nav=NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen(){
 const navigation=useNavigation<Nav>();
 const Item=({title,sub,onPress}:{title:string;sub:string;onPress:()=>void})=><Pressable style={styles.row} onPress={onPress}><View style={styles.icon}><Text style={styles.iconText}>›</Text></View><View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.sub}>{sub}</Text></View><Text style={styles.arrow}>›</Text></Pressable>;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
   <Text style={styles.eyebrow}>UNITED DELHI</Text><Text style={styles.header}>Settings</Text><Text style={styles.caption}>App information and controls</Text>
   <View style={styles.list}>
    <Item title="Bus Color Legend" sub="What the bus colours mean" onPress={()=>navigation.navigate('Home')}/>
    <Item title="Help & FAQs" sub="Answers and transport helplines" onPress={()=>navigation.navigate('Legal')}/>
    <Item title="Privacy Policy" sub="How location and data are handled" onPress={()=>navigation.navigate('Legal')}/>
    <Item title="Terms of Service" sub="Rules for using United Delhi" onPress={()=>navigation.navigate('Legal')}/>
    <Item title="About United Delhi" sub="Data sources, map and app information" onPress={()=>navigation.navigate('Legal')}/>
   </View>
   <View style={styles.about}><Text style={styles.aboutTitle}>About this app</Text><Text style={styles.aboutText}>United Delhi provides live Delhi bus positions, routes, stops and direct bus journey planning.</Text><Text style={styles.aboutText}>No ticketing, purchases, passes or account features are included.</Text></View>
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},content:{padding:20,paddingBottom:100},
 eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},header:{fontSize:28,fontWeight:'900',color:colors.text,marginTop:4},caption:{fontSize:12,color:colors.textMuted,marginTop:3},
 list:{marginTop:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
 row:{minHeight:64,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',alignItems:'center',paddingHorizontal:14},
 icon:{width:34,height:34,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},iconText:{fontSize:24,color:colors.accent,fontWeight:'900'},
 copy:{flex:1,marginLeft:12},title:{fontSize:14,fontWeight:'900',color:colors.text},sub:{fontSize:11,color:colors.textMuted,marginTop:3},arrow:{fontSize:24,color:colors.textMuted},
 about:{marginTop:14,padding:16,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},aboutTitle:{fontSize:15,fontWeight:'900',color:colors.text},aboutText:{fontSize:12,lineHeight:18,color:colors.textMuted,marginTop:5}
});