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
  assert.match(res.stdout, /contrast \(light\): [0-9.]+:1/, 'reports a measured light contrast ratio');
  assert.match(res.stdout, /passes AA \(4\.5:1\)/, 'default palette passes AA');
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

test('a11y-check fails when the page theme has insufficient contrast', () => {
  // theme pair #ffffff on #f5f5f5 computes ~1.1:1, far below the AA 4.5:1
  // threshold for body text, so the lint must fail with the measured ratio.
  const src =
    'title: t\n' +
    'theme:\n' +
    '  pageBg: "#ffffff"\n' +
    '  textColor: "#f5f5f5"\n' +
    'sections:\n' +
    '  - title: S\n' +
    '    content:\n' +
    '      - type: paragraph\n' +
    '        text: hi\n';
  const html = buildFromSource(src, 'low-contrast.yaml');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-contrast-'));
  const file = path.join(tmp, 'page.html');
  fs.writeFileSync(file, html);
  const res = runCheck(file);
  assert.strictEqual(res.ok, false, 'expected failure for low contrast');
  assert.strictEqual(res.code, 1, 'exit code 1');
  assert.match(res.stderr, /contrast \(light\): 1\.\d+:1 below AA 4\.5:1/, 'reports the failing ratio');
});

test('a11y-check checks the dark theme palette against AA too', () => {
  // theme.dark overrides merge into the dark CSS block; the lint measures that
  // palette (bgs/tcs index 1) under the same 4.5:1 threshold while the light
  // palette in :root still passes. Only the light path was pinned before.
  const src =
    'title: t\n' +
    'theme:\n' +
    '  pageBg: "#ffffff"\n' +
    '  textColor: "#111111"\n' +
    '  dark:\n' +
    '    pageBg: "#111111"\n' +
    '    textColor: "#0f0f0f"\n' +
    'sections:\n' +
    '  - title: S\n' +
    '    content:\n' +
    '      - type: paragraph\n' +
    '        text: hi\n';
  const html = buildFromSource(src, 'dark-low-contrast.yaml');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-dark-'));
  const file = path.join(tmp, 'page.html');
  fs.writeFileSync(file, html);
  const res = runCheck(file);
  assert.strictEqual(res.ok, false, 'expected failure for low dark contrast');
  assert.strictEqual(res.code, 1, 'exit code 1');
  assert.match(res.stderr, /contrast \(dark\): 1\.0\d:1 below AA 4\.5:1/, 'reports the failing dark ratio');
  assert.match(res.stdout, /contrast \(light\): \d+\.\d+:1 .* passes AA \(4\.5:1\)/, 'light palette still passes');

  // sanity: with a compliant dark palette the same page passes.
  const good =
    'title: t\n' +
    'theme:\n' +
    '  pageBg: "#ffffff"\n' +
    '  textColor: "#111111"\n' +
    '  dark:\n' +
    '    pageBg: "#111111"\n' +
    '    textColor: "#dddddd"\n' +
    'sections:\n' +
    '  - title: S\n' +
    '    content:\n' +
    '      - type: paragraph\n' +
    '        text: hi\n';
  const htmlGood = buildFromSource(good, 'dark-good.yaml');
  const fileGood = path.join(tmp, 'good.html');
  fs.writeFileSync(fileGood, htmlGood);
  const resGood = runCheck(fileGood);
  assert.strictEqual(resGood.ok, true, 'compliant dark palette passes');
  assert.match(resGood.stdout, /contrast \(dark\): \d+\.\d+:1/, 'dark ratio reported');
});
