import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

test('embedded escapeHtml function parses and escapes all HTML-sensitive characters', () => {
  const homeScreenPath = join(import.meta.dirname, '../../screens/HomeScreen.tsx');
  const content = readFileSync(homeScreenPath, 'utf-8');

  const buildMapHtmlMatch = content.match(/function buildMapHtml\(\)\{[\s\S]*?return `([\s\S]*?)`;/);
  assert.ok(buildMapHtmlMatch, 'Could not find buildMapHtml HTML template');

  const htmlContent = buildMapHtmlMatch[1];
  const inlineScript = [...htmlContent.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .find(script => script.includes('function escapeHtml(x)'));
  assert.ok(inlineScript, 'Could not find escapeHtml in the embedded map script');

  const definitions = [...inlineScript.matchAll(/^\s*(function escapeHtml\(x\)\{[^\r\n]*\})\s*$/gm)];
  assert.equal(definitions.length, 1, 'Expected one complete escapeHtml definition in the embedded script');

  const tempFile = join(tmpdir(), `escapeHtml-test-${process.pid}-${Date.now()}.js`);
  const input = '&<>"\'';
  const expected = '&amp;&lt;&gt;&quot;&#39;';
  const testCode = [
    definitions[0][1],
    `const input = ${JSON.stringify(input)};`,
    `const expected = ${JSON.stringify(expected)};`,
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
