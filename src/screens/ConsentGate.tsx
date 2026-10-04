import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable, Modal, ScrollView } from 'react-native';
import { colors } from '../theme';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';

type Props = { onConfirm: () => void };

export default function ConsentGate({ onConfirm }: Props) {
  const [checked,setChecked]=useState(false);
  const [legal,setLegal]=useState<'terms'|'privacy'|null>(null);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <UnitedDelhiMark size={64} />
        <Text style={styles.title}>United Delhi</Text>
        <Text style={styles.heading}>Before you continue</Text>
        <Text style={styles.body}>
          By continuing to United Delhi, you agree to our{' '}
          <Text style={styles.link} onPress={()=>setLegal('terms')}>Terms of Service</Text>
          {' '}and acknowledge our{' '}
          <Text style={styles.link} onPress={()=>setLegal('privacy')}>Privacy Policy</Text>.
        </Text>
        <Pressable style={styles.checkRow} onPress={()=>setChecked(v=>!v)}>
          <View style={[styles.checkbox,checked&&styles.checkboxChecked]}><Text style={styles.checkmark}>{checked?'✓':''}</Text></View>
          <Text style={styles.checkText}>I agree to the Terms of Service and acknowledge the Privacy Policy.</Text>
        </Pressable>
        <Pressable disabled={!checked} style={[styles.button,!checked&&styles.buttonDisabled]} onPress={onConfirm}>
          <Text style={styles.buttonText}>Continue to United Delhi</Text>
        </Pressable>
        <Text style={styles.small}>No account or phone number is required. Location is optional and is requested after consent to support nearby stops and map centering.</Text>
      </View>
      <Modal visible={!!legal} animationType="slide" onRequestClose={()=>setLegal(null)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHead}><Text style={styles.heading}>{legal==='terms'?'Terms of Service':'Privacy Policy'}</Text><Pressable onPress={()=>setLegal(null)}><Text style={styles.link}>Close</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.legal}>
            {legal==='terms'?<>{legal==='terms'?<><Text style={styles.legalTitle}>United Delhi Terms of Service</Text><Text style={styles.body}>Effective 4 October 2026. United Delhi is an independent transit-information service, not a transport operator, government agency, emergency service, or official DTC/Delhi Government application.</Text><Text style={styles.legalTitle}>Accuracy and availability</Text><Text style={styles.body}>Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped, unavailable or inaccurate. Realtime positions, arrivals and journey-planning results are estimates and are not guarantees.</Text><Text style={styles.legalTitle}>Acceptable use</Text><Text style={styles.body}>Do not attack or interfere with the service, bypass safeguards, obtain secrets, abuse upstream services, transmit malicious code, attempt unauthorised access, harmful scraping, stalking or profiling, or misrepresent United Delhi as an official authority.</Text><Text style={styles.legalTitle}>Third-party services</Text><Text style={styles.body}>Maps, transit feeds, hosting, databases and other third-party components may change or become unavailable and have their own terms.</Text><Text style={styles.legalTitle}>No warranty and liability</Text><Text style={styles.body}>To the maximum extent permitted by applicable law, the service is provided as-is and as-available. We do not guarantee uninterrupted or error-free service. To the maximum extent permitted by law, United Delhi and its developers are not liable for indirect, incidental, special, consequential or reliance-related losses. Nothing excludes liability that cannot lawfully be excluded.</Text><Text style={styles.legalTitle}>Changes and contact</Text><Text style={styles.body}>We may update the service or these terms. Privacy, security and legal requests should use vion4712@gmail.com. These terms are a product policy and are not a substitute for qualified legal advice.</Text></>:<><Text style={styles.legalTitle}>United Delhi Privacy Policy</Text><Text style={styles.body}>Effective 4 October 2026. United Delhi is designed to work without an account and does not intentionally request a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier or payment information.</Text><Text style={styles.legalTitle}>Location</Text><Text style={styles.body}>Location is optional. Foreground device location may be used to find nearby DTC stops and centre the map. The app does not intentionally upload a personal location history to the transit database.</Text><Text style={styles.legalTitle}>Search and planning</Text><Text style={styles.body}>Search and journey-planning inputs are sent to the United Delhi API to return transit information and are not intentionally used to create a user profile.</Text><Text style={styles.legalTitle}>Technical information</Text><Text style={styles.body}>Hosting, network, security and error-handling infrastructure may process ordinary technical information such as IP addresses, timestamps, request metadata and diagnostics.</Text><Text style={styles.legalTitle}>Third parties</Text><Text style={styles.body}>United Delhi uses Delhi Open Transit Data, OpenStreetMap/Leaflet, Render, Vercel and Neon. Third parties have their own terms and privacy policies.</Text><Text style={styles.legalTitle}>Retention, rights and children</Text><Text style={styles.body}>We aim to retain personal data only as reasonably necessary for stated purposes, security, legal obligations and service operation. Where applicable law provides rights such as access, correction or deletion, requests may be made through the vion4712@gmail.com. Where law requires parental/guardian consent or additional safeguards for children, those requirements take priority.</Text><Text style={styles.legalTitle}>Security</Text><Text style={styles.body}>Reasonable safeguards include HTTPS, input validation, rate limiting, server-side secrets and database controls. No internet service can guarantee absolute security.</Text></>}</ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  content:{flex:1,justifyContent:'center',padding:28},
  title:{fontSize:28,fontWeight:'900',color:colors.text,marginTop:16},
  heading:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:24},
  body:{fontSize:14,lineHeight:21,color:colors.textMuted,marginTop:12},
  button:{marginTop:24,backgroundColor:colors.accent,borderRadius:0,paddingVertical:15,alignItems:'center'},
  buttonDisabled:{opacity:.45},
  buttonText:{color:'#fff',fontSize:14,fontWeight:'900'},
  checkRow:{flexDirection:'row',alignItems:'flex-start',gap:12,marginTop:20,padding:14,borderWidth:1,borderColor:colors.border,borderRadius:0,backgroundColor:colors.surface},
  checkbox:{width:22,height:22,borderRadius:0,borderWidth:2,borderColor:colors.accent,alignItems:'center',justifyContent:'center'},
  checkboxChecked:{backgroundColor:colors.accent},
  checkmark:{color:'#fff',fontWeight:'900'},
  checkText:{flex:1,color:colors.text,fontSize:13,lineHeight:20,fontWeight:'700'},
  link:{color:colors.accent,fontWeight:'900',textDecorationLine:'underline'},
  small:{fontSize:11,color:colors.textMuted,textAlign:'center',marginTop:12,lineHeight:16},
  modalHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:20,borderBottomWidth:1,borderBottomColor:colors.border},
  legal:{padding:22,paddingBottom:40},
  legalTitle:{fontSize:17,fontWeight:'900',color:colors.text,marginTop:20}
});
