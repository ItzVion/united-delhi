import React from 'react';
import { Image } from 'react-native';

export function UnitedDelhiMark({ size = 42 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      accessibilityRole="image"
      accessibilityLabel="United Delhi logo"
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}
