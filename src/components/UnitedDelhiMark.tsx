import React from 'react';
import { Image, StyleSheet } from 'react-native';

export function UnitedDelhiMark({ size = 42 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/united-delhi-logo.png')}
      style={[styles.image, { width: size, height: size }]}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="United Delhi logo"
    />
  );
}

const styles = StyleSheet.create({
  image: { flexShrink: 0 }
});
