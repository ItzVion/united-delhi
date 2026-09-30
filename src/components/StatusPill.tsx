import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Tone = 'ok' | 'warning' | 'danger' | 'muted';

const toneColor: Record<Tone, string> = {
  ok: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  muted: colors.textMuted
};

export function StatusPill({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  return (
    <View style={[styles.pill, { borderColor: toneColor[tone] }]}>
      <View style={[styles.dot, { backgroundColor: toneColor[tone] }]} />
      <Text style={[styles.text, { color: toneColor[tone] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 0, paddingVertical: 5, paddingHorizontal: 10, gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '700' }
});