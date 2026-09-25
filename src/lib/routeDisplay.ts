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

export function publicRouteDirection(
  value: string | null | undefined,
  fromStop?: string | null,
  toStop?: string | null
): { from: string; to: string } {
  const publicName = normalizePublicRouteName(value);
  const raw = String(value ?? '').trim().toUpperCase();
  const isDown = /(?:DOWN|DWN)$/.test(raw);

  if (publicName === '801') {
    return isDown
      ? { from: 'IGI Airport Terminal 2', to: 'Kapashera Border' }
      : { from: 'Kapashera Border', to: 'IGI Airport Terminal 2' };
  }

  if (publicName === '801STL') {
    return isDown
      ? { from: 'Kapashera Border', to: 'Uttam Nagar Terminal' }
      : { from: 'Uttam Nagar Terminal', to: 'Kapashera Border' };
  }

  return {
    from: fromStop || 'Starting stop',
    to: toStop || 'Ending stop'
  };
}
