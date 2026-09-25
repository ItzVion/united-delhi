import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export function UnitedDelhiMark({ size = 42 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.26 }]}>
      <Image
        source={require('../../assets/icon.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="United Delhi logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: '#F7FAF8',
    overflow: 'hidden',
  },
});
