export function normalizePublicRouteName(value: string | null | undefined): string | null {
  let route = String(value ?? '').trim();
  if (!route) return null;
  route = route.replace(/(?:UP|DOWN|DWN)$/i, '').trim() || route;
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
  _value: string | null | undefined,
  fromStop?: string | null,
  toStop?: string | null
): { from: string; to: string } {
  return {
    from: fromStop || 'Starting stop',
    to: toStop || 'Ending stop'
  };
}
