import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

test('embedded escapeHtml function has valid JavaScript syntax and escapes HTML', () => {
  const homeScreenPath = join(import.meta.dirname, '../../screens/HomeScreen.tsx');
  const content = readFileSync(homeScreenPath, 'utf-8');

  const buildMapHtmlMatch = content.match(/function buildMapHtml\(\)\{[\s\S]*?return `([\s\S]*?)`;/);
  assert.ok(buildMapHtmlMatch, 'Could not find buildMapHtml HTML template');

  const htmlContent = buildMapHtmlMatch[1];
  const escapeHtmlLine = htmlContent
    .split('\n')
    .map(line => line.trim())
    .find(line => line.includes('function escapeHtml(x)'));
  assert.ok(escapeHtmlLine, 'Could not find escapeHtml function in embedded script');

  const tempFile = join(tmpdir(), `escapeHtml-test-${process.pid}-${Date.now()}.js`);
  const testCode = [
    escapeHtmlLine,
    'const input = ["<script>", "&", String.fromCharCode(34), String.fromCharCode(39), "</script>"].join("");',
    'const expected = "&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;";',
    'if (escapeHtml(input) !== expected) { throw new Error("escapeHtml output mismatch: " + escapeHtml(input)); }',
  ].join('\n') + '\n';
  writeFileSync(tempFile, testCode);

  try {
    const syntax = spawnSync('node', ['--check', tempFile], { encoding: 'utf-8' });
    assert.equal(syntax.status, 0, `Embedded JavaScript syntax error: ${syntax.stderr || syntax.stdout}`);

    const executed = spawnSync('node', [tempFile], { encoding: 'utf-8' });
    assert.equal(executed.status, 0, `escapeHtml behavior test failed: ${executed.stderr || executed.stdout}`);
  } finally {
    try { unlinkSync(tempFile); } catch {}
  }
});
