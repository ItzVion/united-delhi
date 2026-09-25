export function normalizePublicRouteName(value: string | null | undefined): string | null {
  let route = String(value ?? '').trim();
  if (!route) return null;
  route = route.replace(/(?:UP|DOWN|DWN)$/i, '').trim() || route;
  // Public-facing airport services use compact numbering (AIR-5, AIR-6, AIR-8).
  route = route.replace(/^AIR-0+(?=\d)/i, 'AIR-');
  return route;
}

export function displayRouteName(value: string | null | undefined): string | null {
  return normalizePublicRouteName(value);
}

export function routeKey(value: string | null | undefined): string | null {
  const name = normalizePublicRouteName(value);
  return name ? name.toUpperCase() : null;
}
