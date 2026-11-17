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

test('a11y-check without a file argument exits with a usage error', () => {
  // The README-documented invocation requires an <html> path; calling it bare
  // must fail with exit code 2 and print usage, not hang or crash.
  let stdout = '';
  let code = null;
  try {
    stdout = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  } catch (err) {
    code = err.status;
    stdout += String(err.stderr || '') + String(err.stdout || '');
  }
  assert.strictEqual(code, 2, 'missing arg exits 2');
  assert.match(stdout, /usage: .*a11y-check\.mjs <html>/);
});

test('a11y-check reports an unreadable file cleanly instead of a stack trace', () => {
  // A bad path must produce a one-line diagnostic from the tool (file error),
  // not a raw Node ENOENT stack trace, and exit code 1.
  let stderr = '';
  let code = null;
  try {
    execFileSync(process.execPath, [SCRIPT, path.join(os.tmpdir(), 'dg-no-such-file.html')], {
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status;
    stderr += String(err.stderr || '') + String(err.stdout || '');
  }
  assert.strictEqual(code, 1, 'unreadable file exits 1');
  assert.match(stderr, /\[a11y-check\] cannot read /, 'reports a clean diagnostic');
  assert.ok(!/^\s+at |\bnode:fs:\d+/.test(stderr), 'no raw Node stack trace leaks out');
});

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

test('a11y-check fails when a single <main> lacks the id="main" anchor', () => {
  // The skip link and the keyboard-contract depend on the one main landmark
  // carrying id="main". A page with exactly one <main> that omits the id must
  // fail with the missing-id diagnostic (the count check alone can't catch it).
  const page = `<!DOCTYPE html>
<html lang="en">
<head><title>ok</title></head>
<body>
  <a class="skip-link" href="#main">Skip</a>
  <nav aria-label="Main"><a href="#s">S</a></nav>
  <main>${Array.from({ length: 20 }, (_, i) => `<p>row ${i}</p>`).join('\n')}</main>
</body>
</html>`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-mainid-'));
  const file = path.join(tmp, 'noid.html');
  fs.writeFileSync(file, page);
  const res = runCheck(file);
  assert.strictEqual(res.ok, false, 'expected failure');
  assert.strictEqual(res.code, 1, 'exit code 1');
  assert.match(res.stderr, /<main> missing id="main"/, 'reports the missing anchor');
  assert.ok(!/expected exactly one <main>/.test(res.stderr), 'the count check itself still passes');
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

test('a11y-check warns (not fails) on heading skips, external assets, and non-hex tokens', () => {
  // Beyond the hard problems the lint also emits advisory notes: heading-level
  // skips, any external script/style/img resource (offline requirement), and a
  // theme token that is not a hex color (cannot be measured). None of these
  // may fail the page — the exit code must stay 0 with the notes on stdout.
  const writePage = (body, headExtra) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-warn-'));
    const file = path.join(tmp, 'warn.html');
    fs.writeFileSync(
      file,
      `<!DOCTYPE html>
<html lang="en">
<head><title>ok</title>${headExtra || ''}</head>
<body>
  <a class="skip-link" href="#main">Skip</a>
  <nav aria-label="Main"><a href="#s">S</a></nav>
  <main id="main">${body}</main>
</body>
</html>`
    );
    return file;
  };

  // h2 followed directly by h4 skips a level; warning only.
  const skip = writePage('<h2>Top</h2><h4>Skipped</h4>');
  const resSkip = runCheck(skip);
  assert.strictEqual(resSkip.ok, true, 'heading skip does not fail the page');
  assert.match(resSkip.stdout, /heading level skip from h2 to h4/, 'reports the skipped level');

  // A page that pulls in external css/js (the offline requirement) passes with a note.
  const ext = writePage('<h2>Top</h2>', '<link rel="stylesheet" href="base.css"><script src="app.js"></script>');
  const resExt = runCheck(ext);
  assert.strictEqual(resExt.ok, true, 'external assets do not fail the page');
  assert.match(resExt.stdout, /found external script\/style\/img resource/, 'notes the offline requirement');

  // Non-hex theme tokens cannot be measured for contrast — note, not failure.
  const src =
    'title: t\n' +
    'theme:\n' +
    '  pageBg: white\n' +
    '  textColor: black\n' +
    'sections:\n' +
    '  - title: S\n' +
    '    content:\n' +
    '      - type: paragraph\n' +
    '        text: hi\n';
  const html = buildFromSource(src, 'named-colors.yaml');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-named-'));
  const file = path.join(tmp, 'named.html');
  fs.writeFileSync(file, html);
  const resNamed = runCheck(file);
  assert.strictEqual(resNamed.ok, true, 'named-color theme tokens pass the lint');
  assert.match(resNamed.stdout, /tokens not hex \(page-bg=white text-color=black\)/, 'reports the unmeasurable pair');
});

test('a11y-check linearizes a black channel with the low-value luminance branch', () => {
  // Luminance linearizes channels <= 0.04045 via c / 12.92 (0/255 for #000000)
  // and everything brighter via the gamma curve; only the gamma side has run in
  // practice because every earlier test palette channel exceeds 10/255. A black
  // token exercises the dark side and still measures exactly 21:1 on white.
  const src =
    'title: t\n' +
    'theme:\n' +
    '  pageBg: "#000000"\n' +
    '  textColor: "#ffffff"\n' +
    'sections:\n' +
    '  - title: S\n' +
    '    content:\n' +
    '      - type: paragraph\n' +
    '        text: hi\n';
  const html = buildFromSource(src, 'black-theme.yaml');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-black-'));
  const file = path.join(tmp, 'black.html');
  fs.writeFileSync(file, html);
  const res = runCheck(file);
  assert.strictEqual(res.ok, true, 'black-on-white passes AA');
  assert.match(res.stdout, /contrast \(light\): 21\.00:1/, 'measures the exact 21:1 black/white ratio');
  assert.match(res.stdout, /passes AA \(4\.5:1\)/, 'reports the compliant ratio');
});

test('a11y-check skips contrast when a palette carries no matching color token', () => {
  // The tool lints arbitrary HTML, not only generator output: an input that
  // declares --page-bg but no --text-color (or vice versa) must skip that
  // palette's contrast check entirely instead of reading undefined and failing
  // or fabricating a ratio. The page stays OK with no contrast note.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-a11y-notoken-'));
  const file = path.join(tmp, 'notoken.html');
  fs.writeFileSync(
    file,
    `<!DOCTYPE html>
<html lang="en">
<head><title>ok</title>
<style>
  :root { --page-bg: #ffffff; }
</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip</a>
  <nav aria-label="Main"><a href="#s">S</a></nav>
  <main id="main"><h2>Top</h2></main>
</body>
</html>`
  );
  const res = runCheck(file);
  assert.strictEqual(res.ok, true, 'page without a text-color token still passes');
  assert.match(res.stdout, /\[a11y-check\] OK/, 'reports OK');
  assert.ok(!/contrast \(/.test(res.stdout), 'no contrast note when a token is missing');
  assert.match(res.stdout, /heading levels used: 2/, 'the checks after contrast still run');
});
