import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const marker = '<script>';
const start = html.indexOf(marker);
const end = html.lastIndexOf('</script>');
if (start < 0 || end <= start) throw new Error('web/index.html is missing its inline script');
const script = html.slice(start + marker.length, end);
new Function(script);
if (!html.includes('https://united-delhi.de.deplexo.com')) throw new Error('web client API base is missing');
if (!html.includes('/api/realtime/vehicles')) throw new Error('web realtime endpoint is missing');
console.log('United Delhi web client syntax/config check passed.');
