import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable, Modal, ScrollView } from 'react-native';
import { colors } from '../theme';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';

type Props = { onConfirm: () => void };

export default function AgeGate({ onConfirm }: Props) {
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
        <Text style={styles.small}>No account or phone number is required. Location is requested only when you choose a location-based feature.</Text>
      </View>
      <Modal visible={!!legal} animationType="slide" onRequestClose={()=>setLegal(null)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHead}><Text style={styles.heading}>{legal==='terms'?'Terms of Service':'Privacy Policy'}</Text><Pressable onPress={()=>setLegal(null)}><Text style={styles.link}>Close</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.legal}>
            {legal==='terms'?<><Text style={styles.legalTitle}>United Delhi Terms of Service</Text><Text style={styles.body}>United Delhi is an independent transit-information service. It provides route, stop, map, journey-planning, Metro network and realtime vehicle information. It is not a transport operator, government agency or emergency service.</Text><Text style={styles.legalTitle}>Transit information</Text><Text style={styles.body}>Transit information can be delayed, incomplete, changed, duplicated, incorrectly mapped or unavailable. Realtime positions and journey-planning results are estimates and should not be treated as guarantees.</Text><Text style={styles.legalTitle}>Acceptable use</Text><Text style={styles.body}>Do not attack or interfere with the Service, obtain secrets, abuse upstream services, stalk or profile people, transmit malicious code, impersonate the Service, or misrepresent United Delhi as an official government or transport service.</Text><Text style={styles.legalTitle}>Availability</Text><Text style={styles.body}>The Service may change, be suspended, or become unavailable. Third-party data, maps and infrastructure have their own terms.</Text><Text style={styles.body}>The full Terms are available from the Legal & privacy section. Final public or commercial launch should use the developer contact listed on the store listing and appropriate legal review.</Text></>:<><Text style={styles.legalTitle}>United Delhi Privacy Policy</Text><Text style={styles.body}>United Delhi is designed to work without an account. We do not currently ask for a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier or payment information.</Text><Text style={styles.legalTitle}>Location</Text><Text style={styles.body}>Location is optional. When you choose Nearby, device location is used to find nearby DTC stops. The current implementation does not intentionally store a user's personal location history in the transit database.</Text><Text style={styles.legalTitle}>Search and planning</Text><Text style={styles.body}>Search and journey-planning text is sent to the United Delhi API to return transit information. The app does not intentionally create a user profile from those requests.</Text><Text style={styles.legalTitle}>Tracking</Text><Text style={styles.body}>United Delhi does not currently use personalized advertising, behavioral tracking or advertising identifiers.</Text><Text style={styles.legalTitle}>Applicable law</Text><Text style={styles.body}>If applicable law requires additional safeguards for children or another category of user, those requirements take priority and the service should be updated accordingly.</Text><Text style={styles.body}>The full Privacy Policy is available from the Legal & privacy section and on the public policy page.</Text></>}
          </ScrollView>
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
  button:{marginTop:24,backgroundColor:colors.accent,borderRadius:14,paddingVertical:15,alignItems:'center'},
  buttonDisabled:{opacity:.45},
  buttonText:{color:'#fff',fontSize:14,fontWeight:'900'},
  checkRow:{flexDirection:'row',alignItems:'flex-start',gap:12,marginTop:20,padding:14,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.surface},
  checkbox:{width:22,height:22,borderRadius:6,borderWidth:2,borderColor:colors.accent,alignItems:'center',justifyContent:'center'},
  checkboxChecked:{backgroundColor:colors.accent},
  checkmark:{color:'#fff',fontWeight:'900'},
  checkText:{flex:1,color:colors.text,fontSize:13,lineHeight:20,fontWeight:'700'},
  link:{color:colors.accent,fontWeight:'900',textDecorationLine:'underline'},
  small:{fontSize:11,color:colors.textMuted,textAlign:'center',marginTop:12,lineHeight:16},
  modalHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:20,borderBottomWidth:1,borderBottomColor:colors.border},
  legal:{padding:22,paddingBottom:40},
  legalTitle:{fontSize:17,fontWeight:'900',color:colors.text,marginTop:20}
});
