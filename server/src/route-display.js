export function publicRouteName(route, fallback = null) {
  const candidates = [route?.short_name, route?.long_name, fallback];
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) return value;
  }
  return null;
}
