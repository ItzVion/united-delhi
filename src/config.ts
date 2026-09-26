const configuredBase = String(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://united-delhi.de.deplexo.com').trim().replace(/\/+$/, '');
if (!/^https:\/\//i.test(configuredBase) && !/^http:\/\/localhost(?::\d+)?$/i.test(configuredBase) && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(configuredBase)) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTPS outside localhost development.');
}
export const API_BASE_URL = configuredBase;
