import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATIC_IMPORTER_PATH = path.join(SERVER_ROOT, 'scripts', 'import-dtc-static.mjs');

export function resolveServerPath(value) {
  return path.resolve(SERVER_ROOT, value);
}
