import React from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable } from 'react-native';
import { colors } from '../theme';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';

type Props = { onConfirm: () => void };

export default function AgeGate({ onConfirm }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <UnitedDelhiMark size={64} />
        <Text style={styles.title}>United Delhi</Text>
        <Text style={styles.heading}>Before you continue</Text>
        <Text style={styles.body}>
          The current production service is limited to people aged 18 or older.
          This is because the app can process location and other online request data.
        </Text>
        <Text style={styles.body}>
          If you are under 18, please do not continue to the production service.
          A future version may support younger users after a legally appropriate
          parental-consent system is implemented.
        </Text>
        <Pressable style={styles.button} onPress={onConfirm}>
          <Text style={styles.buttonText}>I am 18 or older</Text>
        </Pressable>
        <Text style={styles.small}>Your age is not saved by this screen.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  content:{flex:1,justifyContent:'center',padding:28},
  title:{fontSize:28,fontWeight:'900',color:colors.text,marginTop:16},
  heading:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:28},
  body:{fontSize:14,lineHeight:21,color:colors.textMuted,marginTop:12},
  button:{marginTop:24,backgroundColor:colors.accent,borderRadius:14,paddingVertical:15,alignItems:'center'},
  buttonText:{color:'#fff',fontSize:14,fontWeight:'900'},
  small:{fontSize:11,color:colors.textMuted,textAlign:'center',marginTop:12}
});
