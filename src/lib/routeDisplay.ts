export function displayRouteName(value: string | null | undefined): string | null {
  const route = String(value ?? '').trim();
  if (!route) return null;

  const withoutDirection = route.replace(/(UP|DOWN)$/i, '').trim();
  return withoutDirection || route;
}
