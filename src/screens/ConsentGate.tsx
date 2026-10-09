import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable, Modal, ScrollView } from 'react-native';
import { colors } from '../theme';
import { UnitedDelhiMark } from '../components/UnitedDelhiMark';

type Props = { onConfirm: () => void };
type LegalPage = 'terms' | 'privacy';

const terms = [
  ['United Delhi Terms of Service', 'Effective 4 October 2026. United Delhi is an independent transit-information service, not a transport operator, government agency, emergency service, or official DTC/Delhi Government application.'],
  ['Accuracy and availability', 'Transit information may be delayed, incomplete, changed, duplicated, incorrectly mapped, unavailable or inaccurate. Realtime positions, arrivals and journey-planning results are estimates and are not guarantees.'],
  ['Acceptable use', 'Do not attack or interfere with the service, bypass safeguards, obtain secrets, abuse upstream services, transmit malicious code, attempt unauthorised access, harmful scraping, stalking or profiling, or misrepresent United Delhi as an official authority.'],
  ['Third-party services', 'Maps, transit feeds, hosting, databases and other third-party components may change or become unavailable and have their own terms.'],
  ['No warranty and liability', 'To the maximum extent permitted by applicable law, the service is provided as-is and as-available. We do not guarantee uninterrupted or error-free service. To the maximum extent permitted by law, United Delhi and its developers are not liable for indirect, incidental, special, consequential or reliance-related losses. Nothing excludes liability that cannot lawfully be excluded.'],
  ['Changes and contact', 'We may update the service or these terms. Privacy, security and legal requests should use vion4712@gmail.com. These terms are a product policy and are not a substitute for qualified legal advice.'],
] as const;

const privacy = [
  ['United Delhi Privacy Policy', 'Effective 4 October 2026. United Delhi is designed to work without an account and does not intentionally request a name, phone number, email address, contacts, photos, microphone, camera, advertising identifier or payment information.'],
  ['Location', 'Location is optional. Foreground device location may be used to find nearby DTC stops and centre the map. The app does not intentionally upload a personal location history to the transit database.'],
  ['Search and planning', 'Search and journey-planning inputs are sent to the United Delhi API to return transit information and are not intentionally used to create a user profile.'],
  ['Technical information', 'Hosting, network, security and error-handling infrastructure may process ordinary technical information such as IP addresses, timestamps, request metadata and diagnostics.'],
  ['Third parties', 'United Delhi uses Delhi Open Transit Data, OpenStreetMap/Leaflet, Render, Vercel and Neon. Third parties have their own terms and privacy policies.'],
  ['Retention, rights and children', 'We aim to retain personal data only as reasonably necessary for stated purposes, security, legal obligations and service operation. Where applicable law provides rights such as access, correction or deletion, requests may be made through vion4712@gmail.com. Where law requires parental/guardian consent or additional safeguards for children, those requirements take priority.'],
  ['Security', 'Reasonable safeguards include HTTPS, input validation, rate limiting, server-side secrets and database controls. No internet service can guarantee absolute security.'],
] as const;

export default function ConsentGate({ onConfirm }: Props) {
  const [checked, setChecked] = useState(false);
  const [legal, setLegal] = useState<LegalPage | null>(null);
  const sections = legal === 'terms' ? terms : privacy;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <UnitedDelhiMark size={64} />
        <Text style={styles.title}>United Delhi</Text>
        <Text style={styles.heading}>Before you continue</Text>
        <Text style={styles.body}>
          By continuing to United Delhi, you agree to our{' '}
          <Text style={styles.link} onPress={() => setLegal('terms')}>Terms of Service</Text>
          {' '}and acknowledge our{' '}
          <Text style={styles.link} onPress={() => setLegal('privacy')}>Privacy Policy</Text>.
        </Text>
        <Pressable style={styles.checkRow} onPress={() => setChecked(value => !value)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            <Text style={styles.checkmark}>{checked ? '✓' : ''}</Text>
          </View>
          <Text style={styles.checkText}>I agree to the Terms of Service and acknowledge the Privacy Policy.</Text>
        </Pressable>
        <Pressable disabled={!checked} style={[styles.button, !checked && styles.buttonDisabled]} onPress={onConfirm} accessibilityRole="button">
          <Text style={styles.buttonText}>Continue to United Delhi</Text>
        </Pressable>
        <Text style={styles.small}>No account or phone number is required. Location is optional and is requested after consent to support nearby stops and map centering.</Text>
      </View>
      <Modal visible={legal !== null} animationType="slide" onRequestClose={() => setLegal(null)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHead}>
            <Text style={styles.heading}>{legal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</Text>
            <Pressable onPress={() => setLegal(null)} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.legal}>
            {sections.map(([title, body]) => (
              <View key={title}>
                <Text style={styles.legalTitle}>{title}</Text>
                <Text style={styles.body}>{body}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 28 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, marginTop: 16 },
  heading: { fontSize: 21, fontWeight: '900', color: colors.text, marginTop: 24 },
  body: { fontSize: 14, lineHeight: 21, color: colors.textMuted, marginTop: 12 },
  button: { marginTop: 24, backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 20, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  checkbox: { width: 22, height: 22, borderRadius: 14, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.accent },
  checkmark: { color: '#fff', fontWeight: '900' },
  checkText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '900', textDecorationLine: 'underline' },
  small: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  legal: { padding: 22, paddingBottom: 40 },
  legalTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginTop: 20 },
});
