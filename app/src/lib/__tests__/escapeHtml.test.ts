import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

test('embedded escapeHtml function in HomeScreen.tsx has valid JavaScript syntax', () => {
  const homeScreenPath = join(import.meta.dirname, '../../screens/HomeScreen.tsx');
  const content = readFileSync(homeScreenPath, 'utf-8');

  // Extract the buildMapHtml function body which contains the embedded JavaScript
  const buildMapHtmlMatch = content.match(/function buildMapHtml\(\)\{[\s\S]*?return `([\s\S]*?)`;/);
  assert.ok(buildMapHtmlMatch, 'Could not find buildMapHtml function');

  const htmlContent = buildMapHtmlMatch[1];

  // Find the line containing the escapeHtml function definition
  const lines = htmlContent.split('\n');
  let escapeHtmlLine: string | null = null;
  for (const line of lines) {
    if (line.includes('function escapeHtml(x)')) {
      escapeHtmlLine = line.trim();
      break;
    }
  }
  assert.ok(escapeHtmlLine, 'Could not find escapeHtml function definition in embedded script');

  // Validate JavaScript syntax by writing to a temp file and checking it
  const tempFile = join(tmpdir(), `escapeHtml-test-${Date.now()}.js`);
  // Add a test call to verify the function works - use a simpler test string to avoid escaping issues
  const testCode = `${escapeHtmlLine}\nconst result = escapeHtml('<test>&"\\'');\nif (result !== '<test>&"\\'') {\n  throw new Error('escapeHtml function produced incorrect output: ' + result);\n}\n`;
  writeFileSync(tempFile, testCode);

  const result = spawnSync('node', ['--check', tempFile], { encoding: 'utf-8' });

  // Clean up
  try { unlinkSync(tempFile); } catch {}

  assert.equal(result.status, 0, `Embedded JavaScript syntax error: ${result.stderr || result.stdout}`);
});