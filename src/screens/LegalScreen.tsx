import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

const BASE='https://github.com/ItzVion/united-delhi/blob/main/';
const links=[
  ['Privacy Policy','PRIVACY_POLICY.md'],
  ['Terms of Service','TERMS_OF_SERVICE.md'],
  ['Third-Party Notices','THIRD_PARTY_NOTICES.md'],
  ['Security Policy','SECURITY.md']
] as const;

export default function LegalScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>UNITED DELHI</Text>
        <Text style={styles.title}>Legal & privacy</Text>
        <Text style={styles.intro}>
          United Delhi is an independent transit-information app. These documents
          explain how the service handles data, third-party services, security,
          and use of the app.
        </Text>
        <View style={styles.card}>
          {links.map(([label,file]) => (
            <Pressable key={file} style={styles.linkRow} onPress={() => Linking.openURL(BASE+file)}>
              <Text style={styles.link}>{label}</Text>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.section}>Location</Text>
        <Text style={styles.body}>
          Location is optional and used only for transit features. Nearby uses a
          reduced-precision location request to find stops. Smart Leave calculates
          walking distance on the device.
        </Text>
        <Text style={styles.section}>Transit information</Text>
        <Text style={styles.body}>
          Route, stop, and realtime information can be delayed or inaccurate.
          United Delhi is not a transport authority and does not guarantee arrival
          times or vehicle availability.
        </Text>
        <Text style={styles.section}>Contact</Text>
        <Text style={styles.body}>
          Privacy and legal contact: [LEGAL CONTACT EMAIL]
        </Text>
        <Text style={styles.warning}>
          The contact placeholder must be replaced before public release.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  content:{padding:20,paddingBottom:40},
  eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},
  title:{fontSize:28,fontWeight:'900',color:colors.text,marginTop:3},
  intro:{fontSize:14,lineHeight:21,color:colors.textMuted,marginTop:10},
  card:{marginTop:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,overflow:'hidden'},
  linkRow:{padding:15,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',justifyContent:'space-between'},
  link:{fontSize:14,fontWeight:'900',color:colors.accent},
  arrow:{fontSize:24,color:colors.textMuted},
  section:{fontSize:17,fontWeight:'900',color:colors.text,marginTop:20},
  body:{fontSize:13,lineHeight:20,color:colors.textMuted,marginTop:5},
  warning:{fontSize:11,lineHeight:16,color:colors.warning,marginTop:8}
});
