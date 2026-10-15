import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SERVER_ROOT, STATIC_IMPORTER_PATH, resolveServerPath } from '../src/runtime-paths.js';

test('GTFS importer and relative archive paths resolve from the server package', () => {
  assert.equal(path.basename(SERVER_ROOT), 'server');
  assert.equal(STATIC_IMPORTER_PATH, path.join(SERVER_ROOT, 'scripts', 'import-dtc-static.mjs'));
  assert.equal(resolveServerPath(path.join('data', 'dtc.zip')), path.join(SERVER_ROOT, 'data', 'dtc.zip'));
});

test('absolute GTFS archive paths remain unchanged', () => {
  const archive = path.join(SERVER_ROOT, 'data', 'dtc.zip');
  assert.equal(resolveServerPath(archive), archive);
});
