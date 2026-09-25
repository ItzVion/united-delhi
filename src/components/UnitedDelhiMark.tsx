import React from 'react';
import { StyleSheet, View } from 'react-native';

export function UnitedDelhiMark({ size = 42 }: { size?: number }) {
  const lane = size * 0.07;
  return (
    <View style={[styles.box,{width:size,height:size,borderRadius:size*0.24}]}>
      <View style={[styles.lane,{width:size*0.68,height:lane,left:size*0.16,top:size*0.34,transform:[{rotate:'-18deg'}]}]}/>
      <View style={[styles.lane,{width:size*0.62,height:lane,left:size*0.19,top:size*0.50,transform:[{rotate:'-4deg'}]}]}/>
      <View style={[styles.lane,{width:size*0.58,height:lane,left:size*0.21,top:size*0.65,transform:[{rotate:'14deg'}]}]}/>
      <View style={[styles.pin,{width:size*0.22,height:size*0.22,borderRadius:size*0.11,left:size*0.60,top:size*0.13}]}/>
      <View style={[styles.stop,{width:size*0.15,height:size*0.15,borderRadius:size*0.075,left:size*0.13,top:size*0.70}]}/>
    </View>
  );
}
const styles=StyleSheet.create({
  box:{backgroundColor:'#073F3B',overflow:'hidden',position:'relative'},
  lane:{position:'absolute',backgroundColor:'#FFFFFF',borderRadius:999},
  pin:{position:'absolute',backgroundColor:'#F47B20',borderWidth:2,borderColor:'#F7FAF8'},
  stop:{position:'absolute',backgroundColor:'#F47B20',borderWidth:2,borderColor:'#F7FAF8'}
});
