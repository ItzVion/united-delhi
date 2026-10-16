import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SERVER_ROOT, STATIC_IMPORTER_PATH, resolveServerPath } from '../src/runtime-paths.js';

test('GTFS importer and relative archive paths resolve from the server package', () => {
  // Deployments and isolated test harnesses can use different directory names.
  // Assert that SERVER_ROOT is absolute; the following path checks verify its contents.
  assert.equal(path.isAbsolute(SERVER_ROOT), true);
  assert.equal(STATIC_IMPORTER_PATH, path.join(SERVER_ROOT, 'scripts', 'import-dtc-static.mjs'));
  assert.equal(resolveServerPath(path.join('data', 'dtc.zip')), path.join(SERVER_ROOT, 'data', 'dtc.zip'));
});

test('absolute GTFS archive paths remain unchanged', () => {
  const archive = path.join(SERVER_ROOT, 'data', 'dtc.zip');
  assert.equal(resolveServerPath(archive), archive);
});
