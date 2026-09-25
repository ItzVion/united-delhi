import React from 'react';
import { StyleSheet, View } from 'react-native';

export function UnitedDelhiMark({ size=42 }: { size?: number }) {
  const inner = size * 0.22;
  return (
    <View style={[styles.mark,{width:size,height:size,borderRadius:size*0.26}]}>
      <View style={[styles.route,{left:size*0.25,width:size*0.11,height:size*0.52,borderRadius:size*0.08}]} />
      <View style={[styles.route,{left:size*0.445,width:size*0.11,height:size*0.68,borderRadius:size*0.08}]} />
      <View style={[styles.route,{left:size*0.64,width:size*0.11,height:size*0.52,borderRadius:size*0.08}]} />
      <View style={[styles.dot,{width:inner,height:inner,borderRadius:inner/2,right:size*0.16,top:size*0.15}]} />
    </View>
  );
}
const styles=StyleSheet.create({
 mark:{backgroundColor:'#0B746B',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'},
 route:{position:'absolute',bottom:'18%',backgroundColor:'#FFFFFF'},
 dot:{position:'absolute',backgroundColor:'#F28C28',borderWidth:2,borderColor:'#0B746B'}
});
