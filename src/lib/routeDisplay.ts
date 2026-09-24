export function normalizePublicRouteName(value: string | null | undefined): string | null {
  const route = String(value ?? '').trim();
  if (!route) return null;
  return route.replace(/(?:UP|DOWN)$/i, '').trim() || route;
}

export function displayRouteName(value: string | null | undefined): string | null {
  return normalizePublicRouteName(value);
}

export function routeKey(value: string | null | undefined): string | null {
  const name = normalizePublicRouteName(value);
  return name ? name.toUpperCase() : null;
}
