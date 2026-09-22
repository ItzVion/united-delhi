// Production builds must point at the deployed Render backend, never
// localhost. Set EXPO_PUBLIC_API_BASE_URL before running `eas build`.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://united-delhi.onrender.com';
