import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useNavigation } from '@react-navigation/native';

const EFFECTIVE_DATE='16 October 2026';

export default function LegalScreen() {
  const navigation=useNavigation();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={()=>navigation.goBack()}><Text style={styles.back}>‹  Back</Text></Pressable>
        <Text style={styles.eyebrow}>UNITED DELHI</Text>
        <Text style={styles.title}>Legal & privacy</Text>
        <Text style={styles.updated}>Effective {EFFECTIVE_DATE}</Text>

        <Text style={styles.section}>Privacy Policy</Text>
        <Text style={styles.heading}>Information we collect</Text>
        <Text style={styles.body}>United Delhi is designed to work without an account. We do not intentionally request a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier, or payment information.</Text>
        <Text style={styles.heading}>Location</Text>
        <Text style={styles.body}>Location is optional. When you enable it, foreground device location may be used to find nearby DTC stops and centre the map. Nearby-stop requests send coordinates rounded to four decimal places. The app keeps device location in memory while needed for these features and does not save a personal location history.</Text>
        <Text style={styles.heading}>Search and journey planning</Text>
        <Text style={styles.body}>Search terms and journey-planning inputs are sent to the United Delhi API so it can return transit information. They are not intentionally used to create a user profile.</Text>
        <Text style={styles.heading}>Technical information</Text>
        <Text style={styles.body}>Hosting, network, security and error-handling infrastructure may process ordinary technical information such as IP addresses, timestamps, request metadata and diagnostic information. Realtime vehicle data is transit data, not a record of a user's personal location.</Text>
        <Text style={styles.heading}>Third-party services</Text>
        <Text style={styles.body}>United Delhi uses Delhi Open Transit Data and Transport Stack for transit data, OpenStreetMap/Leaflet for maps, a VPS for the API and PostgreSQL, and Vercel for the website. These services may process information under their own terms and privacy policies.</Text>
        <Text style={styles.heading}>Design and feature inspiration</Text>
        <Text style={styles.body}>United Delhi uses familiar transit interaction patterns and functions also found in apps such as Chartr and One Delhi, including live bus maps, route and stop information, route visualisation and journey planning. These are inspirations rather than a claim of identical design, code, or assets. United Delhi is an independent project and is not affiliated with, endorsed by, or operated by Chartr or One Delhi. Its branding, implementation and backend are independently maintained.</Text>
        <Text style={styles.heading}>Retention and deletion</Text>
        <Text style={styles.body}>We aim to retain personal data only for as long as reasonably necessary for the stated purpose, security, legal obligations and service operation. Where applicable, you may request access, correction, deletion or other rights through the published vion4712@gmail.com.</Text>
        <Text style={styles.heading}>Children and applicable law</Text>
        <Text style={styles.body}>United Delhi does not use targeted advertising, behavioural profiling or tracking of children. Where applicable law requires parental or guardian consent, additional safeguards, or other obligations for children, those requirements take priority.</Text>
        <Text style={styles.heading}>Security</Text>
        <Text style={styles.body}>We use reasonable technical and organisational safeguards, including HTTPS, input validation, rate limiting, server-side secrets and database controls. No internet service can guarantee absolute security.</Text>

        <Text style={styles.section}>Terms of Service</Text>
        <Text style={styles.heading}>Service</Text>
        <Text style={styles.body}>United Delhi is an independent transit-information service providing route, stop, map, journey-planning and realtime vehicle information. It is not a transport operator, government agency, emergency service, or official DTC/Delhi Government application.</Text>
        <Text style={styles.heading}>Accuracy and availability</Text>
        <Text style={styles.body}>Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped, unavailable or inaccurate. Realtime positions, arrivals and journey-planning results are estimates. Do not rely on United Delhi as a guarantee of a vehicle's location, arrival, departure, route or safety.</Text>
        <Text style={styles.heading}>Acceptable use</Text>
        <Text style={styles.body}>You must not attack or interfere with the service, bypass safeguards, obtain credentials or secrets, abuse upstream services, send malicious code, attempt unauthorised access, scrape the service in a way that harms availability, stalk or profile people, or falsely represent United Delhi as an official authority.</Text>
        <Text style={styles.heading}>Third-party data and services</Text>
        <Text style={styles.body}>Maps, transit feeds, hosting, databases and other third-party components may change or become unavailable and may have separate terms. United Delhi is not responsible for third-party outages or changes outside its reasonable control.</Text>
        <Text style={styles.heading}>No warranty</Text>
        <Text style={styles.body}>To the maximum extent permitted by applicable law, the service is provided on an as-is and as-available basis without guarantees that it will be uninterrupted, error-free, complete or suitable for a particular purpose.</Text>
        <Text style={styles.heading}>Limitation of liability</Text>
        <Text style={styles.body}>To the maximum extent permitted by applicable law, United Delhi and its developers will not be liable for indirect, incidental, special, consequential or reliance-related losses arising from use of or inability to use the service. Nothing in these terms excludes liability that cannot lawfully be excluded.</Text>
        <Text style={styles.heading}>Changes</Text>
        <Text style={styles.body}>We may update the service, these terms or the privacy policy when necessary. The effective date shown above will identify the current version.</Text>
        <Text style={styles.heading}>Contact and legal review</Text>
        <Text style={styles.body}>Privacy, security and legal requests should use vion4712@gmail.com. These documents are intended as a practical product policy and are not a substitute for advice from a qualified lawyer. Public or commercial launch should receive appropriate legal review for the actual developer/entity, contact details, applicable jurisdictions and operational data practices.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  content:{padding:20,paddingBottom:50},
  back:{fontSize:15,fontWeight:'800',color:colors.accent,marginBottom:18},
  eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.accent},
  title:{fontSize:28,fontWeight:'900',color:colors.text,marginTop:3},
  updated:{fontSize:11,color:colors.textMuted,marginTop:4},
  section:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:26},
  heading:{fontSize:16,fontWeight:'900',color:colors.text,marginTop:17},
  body:{fontSize:13,lineHeight:20,color:colors.textMuted,marginTop:5}
});
