// The README-documented a11y lint tool (node scripts/a11y-check.mjs <html>)
// is part of the product surface but had no test coverage. Pin it: a generated
// page must pass all checks, and a page missing the a11y invariants must fail
// with exit code 1 and a diagnostic.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildFromSource } = require('../lib/build');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'a11y-check.mjs');

function runCheck(htmlFile) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, htmlFile], { encoding: 'utf8' });
    return { ok: true, stdout, code: 0 };
  } catch (err) {
    return { ok: false, stdout: String(err.stdout || ''), stderr: String(err.stderr || ''), code: err.status };
  }
}

test('a11y-check passes on a generated page (chart example)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'chart.yaml'), 'utf8');
  const html = buildFromSource(src, 'chart.yaml', { fileDir: 'examples' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-ok-'));
  const file = path.join(tmp, 'page.html');
  fs.writeFileSync(file, html);
  const res = runCheck(file);
  assert.strictEqual(res.ok, true, `expected pass, got code ${res.code}: ${res.stderr}`);
  assert.match(res.stdout, /\[a11y-check\] OK/, 'reports OK');
  assert.match(res.stdout, /charts with role="img": \d+/, 'reports chart count');
});

test('a11y-check fails with diagnostics on a page missing main/nav/skip', () => {
  // A stripped page that violates the invariants: no lang, no main, no nav,
  // no skip link, an unlabeled image, and an h2->h4 gap.
  const bad = `<!DOCTYPE html>
<html>
<head><title>bad</title></head>
<body>
  <h2>Top</h2>
  <h4>Skipped level</h4>
  <p>No landmarks here.</p>
  <img src="x.png">
</body>
</html>`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-bad-'));
  const file = path.join(tmp, 'bad.html');
  fs.writeFileSync(file, bad);
  const res = runCheck(file);
  assert.strictEqual(res.ok, false, 'expected failure');
  assert.strictEqual(res.code, 1, 'exit code 1');
  assert.match(res.stderr, /no <html lang> attribute/);
  assert.match(res.stderr, /expected exactly one <main>/);
  assert.match(res.stderr, /no <nav> with aria-label/);
  assert.match(res.stderr, /missing skip link to #main/);
  assert.match(res.stderr, /<img> missing alt:/);
});
