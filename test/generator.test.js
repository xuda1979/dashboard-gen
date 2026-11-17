// End-to-end generator tests: build a fixture DSL -> assert DOM/aria/chart/theme.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildFromSource, renderHtml } = require('../lib/build');

const EXAMPLE_DIR = path.join(__dirname, '..', 'examples');

function buildFixture(name, opts) {
  const file = path.join(EXAMPLE_DIR, `${name}.yaml`);
  const source = fs.readFileSync(file, 'utf8');
  return buildFromSource(source, file, { fileDir: EXAMPLE_DIR, ...opts });
}

// ---------------------------------------------------------------------------
// AC1: given the 5 example DSLs, generate correct single-file HTML
// ---------------------------------------------------------------------------

test('landing example produces a single HTML page', () => {
  const html = buildFixture('landing');
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Acme Analytics/);
  assert.match(html, /<h1[^>]*class="dg-headline dg-h1"/);
  assert.match(html, /class="dg-btn dg-btn--primary"/);
  assert.match(html, /class="dg-card dg-card--primary"/);
  assert.match(html, /class="dg-grid"/);
  assert.ok(!html.includes('<script src=') && !html.includes('<link rel="stylesheet" href='), 'no external assets');
});

test('table example renders semantic table with headers and aria label', () => {
  const html = buildFixture('table');
  assert.match(html, /<table class="dg-table"/);
  assert.match(html, /aria-label="Current deployment status per service"/);
  assert.match(html, /<th scope="col">Service<\/th>/);
  assert.match(html, /<th scope="col">Status<\/th>/);
  assert.match(html, />api-gateway</); // row data present
  assert.match(html, /<th scope="col">Tier<\/th>/); // object form -> header union
  assert.match(html, />Gold</);
  assert.match(html, /<td>healthy<\/td>/);
});

test('headerless table renders first cell as th scope=row', () => {
  const html = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'table', header: false, rows: [['api-gateway', 'v2'], ['auth', 'v1']] }] }],
  });
  assert.match(html, /<th scope="row">api-gateway<\/th>/);
  assert.match(html, /<td>v2<\/td>/);
});

// ---------------------------------------------------------------------------
// AC3: chart components render correct SVG (self-implemented, no library)
// ---------------------------------------------------------------------------

test('chart example embeds all three chart types with inline data', () => {
  const html = buildFixture('chart');
  for (const type of ['line', 'bar', 'pie']) {
    assert.match(html, new RegExp(`data-chart-type="${type}"`));
  }
  assert.ok(html.includes('window.__DG_DATA__'), 'inline data store present');
  assert.match(html, /data-chart-swatches=/); // pie swatches carried through
  assert.match(html, /role="img"/);
  assert.ok(!/chart\.js|chartist|echarts|apexcharts|d3\./.test(html), 'no chart library reference');
});

test('chart CSS and runtime are self-contained (no CDN URLs)', () => {
  const html = buildFixture('chart');
  assert.ok(!html.includes('https://cdn.') && !html.includes('//unpkg.com') && !html.includes('//cdnjs'),
    'no CDN dependency');
  assert.ok(!html.includes('http://') && !html.includes('<link '), 'no remote font/link/script tags');
});

// ---------------------------------------------------------------------------
// AC5: accessibility basics
// ---------------------------------------------------------------------------

test('generated page exposes aria labels and landmarks', () => {
  const html = buildFixture('dashboard');
  assert.match(html, /<nav[^>]*aria-label="Primary"/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /<a class="skip-link" href="#main">/);
  assert.match(html, /<h2 class="dg-section-title" id="s-overview"/);
  assert.match(html, /aria-label="Requests per minute by environment/);
  assert.match(html, /aria-label="Recent releases"/);
  assert.match(html, /role="img"/);
});

test('chart figure carries aria label and role', () => {
  const html = buildFixture('chart');
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Seven-day rolling dashboard users/);
});

test('inline chart runtime render functions exist (line/bar/pie svg builders)', () => {
  const html = buildFixture('chart');
  for (const fn of ['function lineSvg', 'function barSvg', 'function pieSvg']) {
    assert.ok(html.includes(fn), `runtime defines ${fn}`);
  }
  assert.ok(html.includes("document.querySelectorAll('.dg-chart[data-chart-data]')"));
});

// ---------------------------------------------------------------------------
// AC4: watch mode
// ---------------------------------------------------------------------------

test('watch mode rebuilds when DSL changes', async () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-'));
  const src = path.join(tmp, 'site.yaml');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(src, 'title: v1\nsections: []\n');
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    // wait for the initial build
    await new Promise((r) => setTimeout(r, 250));
    // trigger a change
    fs.writeFileSync(src, 'title: v2\nsections: []\n');
    // poll until rebuild lands
    let rebuilt = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.readFileSync(out, 'utf8').includes('v2')) { rebuilt = true; break; }
    }
    assert.ok(rebuilt, 'watch rebuilt on change');
  } finally {
    if (watcher) watcher.close();
    process.chdir(origCwd);
  }
});

test('watch mode survives delete+recreate of the DSL file (editor-style save)', async () => {
  // Editors replace a file via rename/delete+create; the watcher watches the
  // parent dir and must treat the resulting events (null-filename or otherwise)
  // as changes, staying alive long enough to pick up the recreated file. The
  // intermediate deleted-state build legitimately fails; what must hold is that
  // the *next* build runs with the new content.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-del-'));
  const src = path.join(tmp, 'site.yaml');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(src, 'title: v1\nsections: []\n');
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    await new Promise((r) => setTimeout(r, 250)); // initial build
    fs.unlinkSync(src);
    fs.writeFileSync(src, 'title: v3\nsections: []\n');
    let rebuilt = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.readFileSync(out, 'utf8').includes('v3')) { rebuilt = true; break; }
    }
    assert.ok(rebuilt, 'watch rebuilt after delete+recreate');
  } finally {
    if (watcher) watcher.close();
    // The deleted-state build fails the rebuild and sets process.exitCode via
    // errorOut; restore it so this test file still exits 0.
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('watch mode honors DG_OUTPUT filename override', () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-out-'));
  const src = path.join(tmp, 'site.yaml');
  fs.writeFileSync(src, 'title: out\nsections: []\n');
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origOut = process.env.DG_OUTPUT;
  process.env.DG_OUTPUT = 'index.html';
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    // the initial build runs synchronously, so the override file exists now
    assert.ok(fs.existsSync(path.join(tmp, 'dist', 'index.html')), 'DG_OUTPUT file built');
    assert.ok(!fs.existsSync(path.join(tmp, 'dist', 'site.html')), 'default name not written');
    assert.ok(fs.readFileSync(path.join(tmp, 'dist', 'index.html'), 'utf8').includes('out'));
  } finally {
    if (watcher) watcher.close();
    if (origOut === undefined) delete process.env.DG_OUTPUT;
    else process.env.DG_OUTPUT = origOut;
    process.chdir(origCwd);
  }
});

test('watch mode ignores touches to files other than the DSL source', async () => {
  // watch() watches the parent directory, so unrelated edits (a README, a
  // fixture file) arrive as fs.watch events too. The callback must skip any
  // event whose filename is neither null nor the DSL basename — otherwise a
  // sibling-file touch triggers a wasted rebuild with stale content.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-other-'));
  const src = path.join(tmp, 'site.yaml');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(src, 'title: v1\nsections: []\n');
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    await new Promise((r) => setTimeout(r, 250)); // initial build
    // A sibling-file write fires a watcher event but must not rebuild the page.
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'ignore me');
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(
      fs.readFileSync(out, 'utf8').includes('v1'),
      'no rebuild happened for an unrelated file'
    );
    // Sanity check: the DSL itself still triggers a rebuild afterward.
    fs.writeFileSync(src, 'title: v2\nsections: []\n');
    let rebuilt = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.readFileSync(out, 'utf8').includes('v2')) { rebuilt = true; break; }
    }
    assert.ok(rebuilt, 'DSL change still rebuilds after the ignored event');
  } finally {
    if (watcher) watcher.close();
    process.chdir(origCwd);
  }
});

test('cmdWatch restart releases the previous watcher and leaves a live one', async () => {
  // cmdWatch calls stopWatchers() before starting a fresh watch. Two watchers
  // share the same parent dir and output only differ by DG_OUTPUT, so the
  // released one is detectable: it must NOT rebuild its own output file after a
  // change while the new watcher's file still updates.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-cmd-'));
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), 'title: one\nsections: []\n');
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { cmdWatch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  const origOut = process.env.DG_OUTPUT;
  process.chdir(tmp);
  let watcher2;
  try {
    // first watch target
    process.env.DG_OUTPUT = 'a.html';
    cmdWatch({ _: [] });
    const aHtml = path.join(tmp, 'dist', 'a.html');
    assert.ok(fs.existsSync(aHtml), 'first watcher built its output');
    assert.ok(fs.readFileSync(aHtml, 'utf8').includes('one'));

    // restart with a different output name: this must release the first watcher
    process.env.DG_OUTPUT = 'b.html';
    watcher2 = cmdWatch({ _: [] });
    const bHtml = path.join(tmp, 'dist', 'b.html');
    assert.ok(fs.existsSync(bHtml), 'restarted watcher built its output');

    fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), 'title: two\nsections: []\n');
    let rebuilt = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.readFileSync(bHtml, 'utf8').includes('two')) { rebuilt = true; break; }
    }
    assert.ok(rebuilt, 'restarted watcher is live and rebuilds on change');
    await new Promise((r) => setTimeout(r, 250)); // let any stale watcher events settle
    const aAfter = fs.readFileSync(aHtml, 'utf8');
    assert.ok(aAfter.includes('one'), 'first watcher output keeps its old build');
    assert.ok(!aAfter.includes('two'), 'released watcher no longer rebuilds');
  } finally {
    if (watcher2) watcher2.close();
    if (origOut === undefined) delete process.env.DG_OUTPUT;
    else process.env.DG_OUTPUT = origOut;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('watch mode reports a failed initial build cleanly instead of crashing', () => {
  // The initial build runs synchronously inside watch(); a DSL that fails the
  // build (here an unknown component type) must surface through the same
  // DashboardError diagnostic as build — never a raw stack trace — and must
  // leave the watcher running for a later retry.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-fail-'));
  const src = path.join(tmp, 'site.yaml');
  fs.writeFileSync(src, 'title: bad\nsections:\n  - content:\n      - type: nope\n');
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  let stderr = '';
  const origWrite = process.stderr.write;
  process.stderr.write = (s) => { stderr += String(s); return true; };
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    assert.match(stderr, /Unknown component type "nope"/, 'reports the build error');
    assert.ok(!/\s+at /.test(stderr), 'no raw stack trace leaks out');
    assert.strictEqual(process.exitCode, 1, 'failed initial build sets a failing exit code');
  } finally {
    process.stderr.write = origWrite;
    if (watcher) watcher.close();
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('watch recovers when the DSL is fixed after a failed initial build', async () => {
  // The failed-initial-build test above pins the clean diagnostic; this one pins
  // the retry half of that contract ("must leave the watcher running for a later
  // retry"). After the initial build fails, fixing the DSL must trigger a real
  // rebuild on the *same* watcher — not only a clean error message.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-retry-'));
  const src = path.join(tmp, 'site.yaml');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(src, 'title: bad\nsections:\n  - content:\n      - type: nope\n');
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  let stderr = '';
  const origWrite = process.stderr.write;
  process.stderr.write = (s) => { stderr += String(s); return true; };
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    assert.match(stderr, /Unknown component type "nope"/, 'initial build failure reported');

    fs.writeFileSync(src, 'title: fixed\nsections: []\n');
    let rebuilt = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.existsSync(out) && fs.readFileSync(out, 'utf8').includes('fixed')) { rebuilt = true; break; }
    }
    assert.ok(rebuilt, 'watcher rebuilt the page after the DSL was fixed');
  } finally {
    process.stderr.write = origWrite;
    if (watcher) watcher.close();
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg watch --check lints the initial build and passes on a compliant page', () => {
  // watch --check folds the same lib/a11y.js gate as build --check into the
  // watch loop: the very first (synchronous) build is linted too, and a page
  // that satisfies the invariants leaves the exit code untouched.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-check-ok-'));
  const src = path.join(tmp, 'site.yaml');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(src, [
    'title: t',
    'sections:',
    '  - title: S',
    '    content:',
    '      - type: paragraph',
    '        text: hi',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  let stdout = '';
  const origOutWrite = process.stdout.write;
  // Tee, don't swallow: the test runner emits sibling-test results to stdout
  // asynchronously; dropping the write would eat those deferred emissions.
  process.stdout.write = (s) => { stdout += String(s); return origOutWrite.call(process.stdout, s); };
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'), { check: true });
    assert.match(stdout, /a11y-check OK/, 'compliant page passes the gate on the initial build');
    assert.ok(fs.existsSync(out), 'page built');
    assert.strictEqual(process.exitCode, origExit, 'compliant page leaves the exit code unchanged');
  } finally {
    process.stdout.write = origOutWrite;
    if (watcher) watcher.close();
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg watch --check flags a violating rebuild but stays live and re-lints on the fix', async () => {
  // The a11y gate is not just a one-shot: a page that violates a hard invariant
  // (contrast here) is still written to dist but --check reports the violation
  // and sets exit code 1, leaving the watcher running; fixing the theme rebuilds
  // on the SAME watcher and re-lints to OK.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-check-fail-'));
  const src = path.join(tmp, 'site.yaml');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(src, [
    'title: t',
    'theme:',
    '  pageBg: "#ffffff"',
    '  textColor: "#f5f5f5"',
    'sections:',
    '  - title: S',
    '    content:',
    '      - type: paragraph',
    '        text: hi',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  let stdout = '';
  const origOutWrite = process.stdout.write;
  // Tee, don't swallow (same reason as the sibling test above).
  process.stdout.write = (s) => { stdout += String(s); return origOutWrite.call(process.stdout, s); };
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'), { check: true });
    assert.ok(fs.existsSync(out), 'page still written before the check fails');
    assert.match(stdout, /a11y-check FAIL/, 'violating page fails the gate');
    assert.strictEqual(process.exitCode, 1, 'a11y violation on the initial build sets exit code 1');

    // Fix the theme; the same watcher must still be live and re-lint the rebuilt
    // page to OK (mirrors the failed-rebuild recovery contract for the gate).
    process.exitCode = origExit === undefined ? 0 : origExit;
    fs.writeFileSync(src, [
      'title: t',
      'sections:',
      '  - title: S',
      '    content:',
      '      - type: paragraph',
      '        text: hi',
      '',
    ].join('\n'));
    let passed = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (stdout.includes('a11y-check OK')) { passed = true; break; }
    }
    assert.ok(passed, 'watcher re-linted to OK after the violation was fixed');
    assert.strictEqual(process.exitCode, origExit === undefined ? 0 : origExit, 'rebuilt page clears the failure exit code');
  } finally {
    process.stdout.write = origOutWrite;
    if (watcher) watcher.close();
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg watch exits cleanly with code 0 on SIGINT', async () => {
  // The watch loop registers a SIGINT handler that closes the watcher and
  // exits 0; without it Ctrl-C would kill the process with the default signal
  // disposition (exit code 130), not the documented "stop cleanly" contract.
  const os = require('node:os');
  const { spawn } = require('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-sigint-'));
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), 'title: sigint\nsections: []\n');
  const binDg = path.join(__dirname, '..', 'bin', 'dg');

  const child = spawn(process.execPath, [binDg, 'watch', 'dg.dsl.yaml'], {
    cwd: tmp,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });

  // Wait until the watcher reports ready before sending the signal so the
  // SIGINT handler is definitely registered.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`watch never became ready: ${out}`)), 5000);
    child.stdout.on('data', () => {
      if (out.includes('watching')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', reject);
  });

  child.kill('SIGINT');
  const exitCode = await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('watch did not exit on SIGINT')), 5000)),
  ]);
  assert.strictEqual(exitCode, 0, 'SIGINT exits with code 0');
  assert.match(out, new RegExp(`watching .*${path.basename(tmp).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'watch reported ready');
});

test('dg build honors the DG_OUTPUT filename override', () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-out-'));
  fs.writeFileSync(path.join(tmp, 'site.yaml'), 'title: out\nsections: []\n');

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  const origOut = process.env.DG_OUTPUT;
  process.env.DG_OUTPUT = 'index.html';
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['site.yaml'] });
    assert.ok(fs.existsSync(path.join(tmp, 'dist', 'index.html')), 'DG_OUTPUT file built');
    assert.ok(!fs.existsSync(path.join(tmp, 'dist', 'site.html')), 'default name not written');
    assert.ok(fs.readFileSync(path.join(tmp, 'dist', 'index.html'), 'utf8').includes('out'));
  } finally {
    if (origOut === undefined) delete process.env.DG_OUTPUT;
    else process.env.DG_OUTPUT = origOut;
    process.chdir(origCwd);
  }
});

test('dg build finds a default DSL source when no arg is given', () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-default-'));
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), 'title: auto\nsections: []\n');

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: [] });
    // dg.dsl.yaml names the site "site" (dg.dsl -> site), so the default
    // source detection builds dist/site.html even with no argv arg.
    const out = path.join(tmp, 'dist', 'site.html');
    assert.ok(fs.existsSync(out), 'default build output written');
    assert.ok(fs.readFileSync(out, 'utf8').includes('auto'));
  } finally {
    process.chdir(origCwd);
  }
});

test('dg build resolves alternate default DSL candidates', () => {
  // defaultSource() accepts dg.dsl.yaml, dg.dsl.yml, dg.dsl.json, or site.yaml
  // when no src arg is passed. Pin the non-primary candidates so the documented
  // "point dg build at the DSL file" contract works for any of the four names.
  const os = require('node:os');
  const { cmdBuild } = require('../lib/cli');
  const candidates = [
    ['dg.dsl.yml', 'title: yml-dot\nsections: []\n'],
    ['dg.dsl.json', JSON.stringify({ title: 'json-dot', sections: [] })],
    ['site.yaml', 'title: site-dot\nsections: []\n'],
  ];
  for (const [file, source] of candidates) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-alt-'));
    fs.writeFileSync(path.join(tmp, file), source);
    const origCwd = process.cwd();
    process.chdir(tmp);
    try {
      cmdBuild({ _: [] });
      // All four candidates map to the site name "site", so the output lands at
      // dist/site.html regardless of which default candidate was discovered.
      const out = path.join(tmp, 'dist', 'site.html');
      assert.ok(fs.existsSync(out), `${file} discovered and built`);
      assert.match(
        fs.readFileSync(out, 'utf8'),
        file === 'dg.dsl.yml' ? /yml-dot/ : file === 'dg.dsl.json' ? /json-dot/ : /site-dot/,
        `${file} content rendered`
      );
    } finally {
      process.chdir(origCwd);
    }
  }
});

test('dg build with no arg in an empty dir fails with a usage-style error', () => {
  // With neither an argv arg nor any default source name present, ensureArg
  // must surface the "No DSL file given" hint and exit 1 — not crash on a
  // nonexistent resolved path. Distinct from the explicit-missing-path branch
  // (which reports "DSL file not found: <name>").
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-empty-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);

  const origErr = console.error;
  const origExit = process.exitCode;
  let msg = '';
  console.error = (s) => { msg += String(s); };
  try {
    cli(['build']);
    assert.match(msg, /No DSL file given; look for dg\.dsl\.yaml \/ site\.yaml\./);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 when no source resolves');
  } finally {
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg build with a missing DSL arg fails with an error', () => {
  // A missing DSL file raises a ParseError deep in ensureArg. The CLI entry
  // point must surface it as a clean "[dashboard-gen] DSL file not found: ..."
  // line with exit code 1 (not an uncaught stack trace).
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-missing-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);

  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  let msg = '';
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { msg += String(s); };
  try {
    cli(['build', 'nope.yaml']);
    assert.match(errMsg, /DSL file not found: nope\.yaml/);
    assert.ok(!errMsg.includes('ParseError'), 'no raw stack trace leaks through');
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on missing DSL');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    // Note: `delete process.exitCode` does NOT reset the code (it stays 1), so
    // an undefined-origin code must be restored by assigning 0 explicitly.
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg build pointing at a directory fails cleanly instead of an EISDIR stack', () => {
  // ensureArg guards existence but the arg can still be a directory; a raw
  // readFileSync EISDIR stack must not leak. The CLI surfaces the same
  // one-line ParseError style with exit code 1 for `dg build <dir>` and for
  // `dg watch <dir>` (both go through ensureArg).
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-dir-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  fs.mkdirSync(path.join(tmp, 'site'));
  fs.mkdirSync(path.join(tmp, 'watchdir'));

  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  try {
    cli(['build', 'site']);
    assert.match(errMsg, /DSL source is a directory, not a file: site/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on directory source');

    errMsg = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    cli(['watch', 'watchdir']);
    assert.match(errMsg, /DSL source is a directory, not a file: watchdir/);
    assert.strictEqual(process.exitCode, 1, 'watch rejects a directory source too');
    assert.ok(!/EISDIR|\bat /.test(errMsg), 'no raw fs stack trace leaks through');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg build fails cleanly when the output path is a directory, not a file', () => {
  // A directory squatting on dist/<name>.html would make writeFileSync throw a
  // raw EISDIR stack; buildOne must reject it with the same one-line
  // DashboardError style used for a directory DSL source. Watch shares buildOne
  // via runBuild, so it must surface the same clean diagnostic.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-outdir-'));
  fs.writeFileSync(path.join(tmp, 'site.yaml'), 'title: t\nsections: []\n');
  fs.mkdirSync(path.join(tmp, 'dist', 'site.html'), { recursive: true });

  const { cli, watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  process.chdir(tmp);
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  let watcher;
  try {
    cli(['build', 'site.yaml']);
    assert.match(errMsg, /Output path is a directory, not a file: dist\/site\.html/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on a directory output path');
    assert.ok(!/EISDIR|\bat /.test(errMsg), 'no raw fs stack trace leaks through');

    errMsg = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    watcher = watch(path.resolve('site.yaml'));
    assert.match(errMsg, /Output path is a directory, not a file: dist\/site\.html/);
    assert.ok(!/EISDIR|\bat /.test(errMsg), 'watch reports the same clean diagnostic');
    assert.strictEqual(process.exitCode, 1, 'watch sets a failing exit code too');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    if (watcher) watcher.close();
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

// ---------------------------------------------------------------------------
// Accessibility + no-external-resource (AC2/AC5 invariants on every example)
// ---------------------------------------------------------------------------

test('dg build fails cleanly when a plain file squats on the output directory', () => {
  // A plain file where dist/ should be makes mkdirSync throw a raw EEXIST
  // stack; buildOne must reject it with the same one-line DashboardError style
  // used for a directory output path. Watch shares buildOne via runBuild, so it
  // must surface the same clean diagnostic.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-outdirfile-'));
  fs.writeFileSync(path.join(tmp, 'site.yaml'), 'title: t\nsections: []\n');
  fs.writeFileSync(path.join(tmp, 'dist'), 'x'); // plain file named dist

  const { cli, watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  process.chdir(tmp);
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  let watcher;
  try {
    cli(['build', 'site.yaml']);
    assert.match(errMsg, /Output directory is a file, not a directory: dist/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on a file squatted output dir');
    assert.ok(!/EEXIST|\bat /.test(errMsg), 'no raw fs stack trace leaks through');

    errMsg = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    watcher = watch(path.resolve('site.yaml'));
    assert.match(errMsg, /Output directory is a file, not a directory: dist/);
    assert.ok(!/EEXIST|\bat /.test(errMsg), 'watch reports the same clean diagnostic');
    assert.strictEqual(process.exitCode, 1, 'watch sets a failing exit code too');

    // Nested output path: with a file squatted on dist/ and DG_OUTPUT pointing
    // into it, the recursive mkdir would throw a raw ENOTDIR; the guard must
    // walk the path and blame the offending ancestor.
    errMsg = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.env.DG_OUTPUT = 'sub/site.html';
    cli(['build', 'site.yaml']);
    delete process.env.DG_OUTPUT;
    assert.match(errMsg, /Output directory is a file, not a directory: dist/);
    assert.ok(!/ENOTDIR|EEXIST|\bat /.test(errMsg), 'no raw ENOTDIR/EEXIST stack leaks');
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on a nested file-squatted output dir');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    if (watcher) watcher.close();
    delete process.env.DG_OUTPUT;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg build fails cleanly on an unreadable DSL source instead of a raw fs stack', () => {
  // ensureArg only checks existence/directory-ness, so a chmod-000 DSL passes
  // it; buildOne's readFileSync would then throw a raw EACCES stack that
  // errorOut's else branch would leak verbatim. The read must be converted into
  // the clean ParseError style used for a missing DSL file. Watch shares
  // buildOne via runBuild and must surface the same clean diagnostic.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-unreadable-'));
  const dsl = path.join(tmp, 'site.yaml');
  fs.writeFileSync(dsl, 'title: t\nsections: []\n');
  fs.chmodSync(dsl, 0o000);

  const { cli, watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  process.chdir(tmp);
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  let watcher;
  try {
    cli(['build', 'site.yaml']);
    assert.match(errMsg, /Could not read DSL source/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on an unreadable DSL file');
    assert.ok(!/EACCES|\sat /.test(errMsg), 'no raw EACCES stack trace leaks through');

    errMsg = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    watcher = watch(path.resolve('site.yaml'));
    assert.match(errMsg, /Could not read DSL source/);
    assert.ok(!/EACCES|\sat /.test(errMsg), 'watch reports the same clean diagnostic');
    assert.strictEqual(process.exitCode, 1, 'watch sets a failing exit code too');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    if (watcher) watcher.close();
    fs.chmodSync(dsl, 0o644);
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg build fails cleanly on an unreadable fetch fixture instead of a raw fs stack', () => {
  // copyLocalFixtures copies local fetch fixtures next to the output; a
  // chmod-000 fixture would make copyFileSync throw a raw EACCES stack that
  // errorOut's else branch would leak verbatim. The copy must throw the clean
  // DataFileError style used for an unreadable chart data file.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-unreadable-fixture-'));
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        data: { fetch: "secret.json" }',
    '',
  ].join('\n'));
  const fixture = path.join(tmp, 'secret.json');
  fs.writeFileSync(fixture, '[{"label":"x","series":{"v":1}}]');
  fs.chmodSync(fixture, 0o000);

  const { cli, watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  process.chdir(tmp);
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  let watcher;
  try {
    cli(['build', 'dg.dsl.yaml']);
    assert.match(errMsg, /Could not read fixture "secret\.json" \(EACCES\)/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on an unreadable fixture');
    assert.ok(!/^\s*at /m.test(errMsg), 'no raw fs stack trace leaks through');

    errMsg = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    watcher = watch(path.resolve('dg.dsl.yaml'));
    assert.match(errMsg, /Could not read fixture "secret\.json" \(EACCES\)/);
    assert.ok(!/^\s*at /m.test(errMsg), 'watch reports the same clean diagnostic');
    assert.strictEqual(process.exitCode, 1, 'watch sets a failing exit code too');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    if (watcher) watcher.close();
    fs.chmodSync(fixture, 0o644);
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg build fails cleanly when the output directory is not writable instead of a raw fs stack', () => {
  // A chmod-000 dist/ dir makes mkdirSync a no-op and writeFileSync throw a raw
  // EACCES stack that errorOut's else branch would leak verbatim. The write
  // must be converted into the clean DashboardError one-line style.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-build-unwritable-out-'));
  fs.writeFileSync(path.join(tmp, 'site.yaml'), 'title: t\nsections: []\n');
  const dist = path.join(tmp, 'dist');
  fs.mkdirSync(dist);
  fs.chmodSync(dist, 0o000);

  const { cli, watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  process.chdir(tmp);
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  let watcher;
  try {
    cli(['build', 'site.yaml']);
    assert.match(errMsg, /Could not write output \(EACCES\): dist\/site\.html/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on an unwritable output dir');
    assert.ok(!/^\s*at /m.test(errMsg), 'no raw fs stack trace leaks through');

    errMsg = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    watcher = watch(path.resolve('site.yaml'));
    assert.match(errMsg, /Could not write output \(EACCES\): dist\/site\.html/);
    assert.ok(!/^\s*at /m.test(errMsg), 'watch reports the same clean diagnostic');
    assert.strictEqual(process.exitCode, 1, 'watch sets a failing exit code too');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    if (watcher) watcher.close();
    fs.chmodSync(dist, 0o755);
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('css tokens are emitted in kebab-case so pages are actually styled', () => {
  const html = buildFixture('landing');
  assert.match(html, /--page-bg: #f6f8fa;/);
  assert.match(html, /--text-color: #3a3f46;/);
  assert.match(html, /--font-family: system-ui/);
  assert.ok(!html.includes('--pageBg:'), 'no camelCase token leftovers');
});

test('custom theme tokens override defaults as page CSS variables', () => {
  // README page schema: `theme:` carries optional Tailwind-like CSS tokens
  // (accent/radius). They must surface as kebab-case custom properties that
  // the component styles reference, not as a dead config object.
  const doc = {
    title: 'theme',
    theme: { accent: '#0ea5e9', radius: '6px' },
    sections: [],
  };
  const html = renderHtml(doc);
  assert.match(html, /--accent: #0ea5e9;/);
  assert.match(html, /--radius: 6px;/);
  assert.match(html, /\.dg-btn--primary \{ background: var\(--accent\)/);
  assert.match(html, /\.dg-card \{ background: var\(--card-bg\); border: 1px solid var\(--border-color\); border-radius: var\(--radius\)/);
  assert.ok(!/--accent:\s*$/.test(html), 'accent token is populated, not empty');
});

test('page theme dark overrides merge into the dark-mode CSS block', () => {
  // README page schema shows `theme:` tokens; the dark variant is a nested
  // `dark:` mapping of the same keys. It must merge over the built-in dark
  // defaults and land inside the prefers-color-scheme block, not leak into the
  // light :root tokens.
  const doc = {
    title: 't',
    theme: { accent: '#0ea5e9', dark: { pageBg: '#0b1220', accent: '#38bdf8' } },
    sections: [],
  };
  const html = renderHtml(doc);
  // light :root keeps its defaults plus the explicit root override only
  assert.match(html, /--page-bg: #f6f8fa;/, 'light pageBg default unchanged');
  assert.match(html, /--accent: #0ea5e9;/, 'light accent override present');
  // dark block holds defaults merged with the page dark overrides
  assert.match(html, /@media \(prefers-color-scheme: dark\) \{/);
  assert.match(html, /--card-bg: #1f2937;/, 'default dark token survives the merge');
  assert.match(html, /--page-bg: #0b1220;/, 'dark pageBg override emitted');
  assert.match(html, /--accent: #38bdf8;/, 'dark accent override emitted');
  assert.ok(
    /@media \(prefers-color-scheme: dark\) \{\s*:root \{[\s\S]*?--accent: #38bdf8;[\s\S]*?\}\s*\}/.test(html),
    'dark overrides sit inside the media block'
  );
});

test('every chart figure carries a role and accessible name', () => {
  const html = buildFixture('chart');
  const figures = html.match(/<div class="dg-figure dg-chart"[^>]*>/g) || [];
  assert.ok(figures.length >= 3, 'at least three chart figures');
  for (const tag of figures) {
    assert.match(tag, /\brole="img"/);
    assert.match(tag, /\baria-label="[^"]+"/, 'figure has accessible name');
  }
});

test('custom dataId on a chart is honored end-to-end', () => {
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'bar', dataId: 'rev', data: [['Q1', 4], ['Q2', 9]] }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /data-chart-data="rev"/);
  const store = JSON.parse(html.match(/window\.__DG_DATA__ = (\{[\s\S]*?\});/)[1]);
  assert.deepEqual(Object.keys(store), ['rev']);
});

test('chart data ids stay aligned when section keys are declared out of render order', () => {
  // The render pass emits widgets in nav -> hero -> content order; the data
  // store must be keyed in the same order even if the DSL author wrote the
  // section keys differently, otherwise a figure points at the wrong rows.
  const doc = {
    title: 'order',
    hero: [{ type: 'chart', kind: 'line', title: 'H', data: [['h', 1]] }],
    sections: [{
      content: [{ type: 'chart', kind: 'bar', title: 'A', data: [['a', 5]] }],
      hero: [{ type: 'chart', kind: 'pie', title: 'B', data: [{ label: 'x', value: 3 }] }],
    }],
  };
  const html = renderHtml(doc);
  const store = JSON.parse(html.match(/window\.__DG_DATA__ = (\{[\s\S]*?\});/)[1]);
  const figureIds = [...html.matchAll(/data-chart-title="([^"]+)"[^>]*data-chart-data="([^"]+)"/g)]
    .map((m) => ({ title: m[1], id: m[2] }));

  assert.strictEqual(figureIds.length, 3, 'all three charts emitted');
  // titles map to their own rows: H -> [[h,1]], B -> [x:3], A -> [[a,5]]
  const storeById = Object.fromEntries(Object.entries(store).map(([id, rows]) => [id, JSON.stringify(rows)]));
  const byTitle = (t) => storeById[figureIds.find((f) => f.title === t).id];
  assert.strictEqual(byTitle('H'), JSON.stringify([['h', 1]]));
  assert.strictEqual(byTitle('A'), JSON.stringify([['a', 5]]));
  assert.ok(storeById[figureIds.find((f) => f.title === 'B').id].includes('"x"'));
});

test('page description is emitted as a meta tag', () => {
  const doc = { title: 't', description: 'A lovely page.', sections: [] };
  const html = renderHtml(doc);
  assert.match(html, /<meta name="description" content="A lovely page.">/);
});

test('page lang maps to html lang and invalid values fall back to en', () => {
  // README-less but load-bearing: the generated <html lang> drives the a11y
  // lint's lang check. A custom BCP-47 value passes through, region tags
  // survive, and anything that is not a plain {lang} or {lang-TAG} shape falls
  // back to en so the page stays valid. Only the default en was pinned before.
  const en = renderHtml({ title: 't', sections: [] });
  assert.match(en, /<html lang="en">/, 'defaults to en');

  const fr = renderHtml({ title: 't', lang: 'fr', sections: [] });
  assert.match(fr, /<html lang="fr">/, 'custom lang passes through');

  const us = renderHtml({ title: 't', lang: 'en-US', sections: [] });
  assert.match(us, /<html lang="en-US">/, 'lang-region form survives');

  const bad = renderHtml({ title: 't', lang: '!!', sections: [] });
  assert.match(bad, /<html lang="en">/, 'invalid lang falls back to en');
});

test('missing title falls back to Dashboard in the page head', () => {
  // renderHtml must not emit an empty <title>: a page without a title key
  // falls back to "Dashboard" so the document always has a name.
  const html = renderHtml({ sections: [] });
  assert.match(html, /<title>Dashboard<\/title>/);
});

test('numeric grid columnWidth is treated as pixels', () => {
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'grid', columnWidth: 240, items: [] }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /minmax\(240px, 1fr\)/);
});

test('chart swatches stay inside an attribute (no raw JSON in markup)', () => {
  const doc = {
    title: 't',
    sections: [{
      content: [{
        type: 'chart', kind: 'pie',
        data: [{ label: 's', series: { Organic: 10 } }],
        swatches: { Organic: '#16a34a' },
      }],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /data-chart-swatches="\{&quot;Organic&quot;:&quot;#16a34a&quot;\}"/);
  assert.ok(!html.includes('data-chart-swatches={"Organic":"#16a34a"}'), 'swatches escaped');
});

test('chart start option is emitted as a data-chart-start attribute', () => {
  const withStart = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'chart', kind: 'line', title: 'Price', start: '2024-01-01', data: [['x', 1]] }],
    }],
  });
  assert.match(withStart, /data-chart-start="2024-01-01"/);

  // absent start must not leave an empty attribute behind
  const without = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', title: 'Price', data: [['x', 1]] }] }],
  });
  assert.ok(!/data-chart-start="/.test(without), 'no data-chart-start without start:');
});

test('unknown chart kind falls back to line with a Chart label', () => {
  // renderChart treats only line/bar/pie as valid; anything else (typo, future
  // kind) must degrade to the line shell so the figure still renders.
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'bogus', title: 'Weird', data: [['Q1', 4]] }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /data-chart-type="line"/,
    'unknown kind falls back to line, not an invalid attribute');
  const label = html.match(/class="dg-figure dg-chart"[^>]*aria-label="([^"]+)"/);
  assert.ok(label && label[1].startsWith('Weird'), `aria-label stays ${label && label[1]}`);
});

test('chart source attribute equals the fetch url (used by the runtime)', () => {
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: { fetch: 'market.json' } }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /data-chart-source="market\.json"/);
});

// ---------------------------------------------------------------------------
// DSL validation + readable errors
// ---------------------------------------------------------------------------

test('extended components (badge, divider, quote) render', () => {
  const doc = {
    title: 'ext',
    sections: [{
      content: [
        { type: 'badge', text: 'Beta', tone: 'success' },
        { type: 'divider' },
        { type: 'quote', text: 'The only way to do great work is to love what you do.', cite: 'Steve Jobs' },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<span class="dg-badge dg-badge--success">Beta<\/span>/);
  assert.match(html, /<hr class="dg-divider">/);
  assert.match(html, /<blockquote class="dg-quote">/);
  assert.match(html, /— Steve Jobs/);
});

test('button style, card intent, badge tone variants render their classes', () => {
  // README component table: button `style`, card `intent`, badge `tone` each
  // accept a set of named variants. Only the defaults were pinned; assert the
  // full documented variant set maps to its class, and invalid values fall back
  // to the default.
  const doc = {
    title: 'variants',
    sections: [{
      content: [
        { type: 'button', text: 'B', style: 'secondary' },
        { type: 'button', text: 'C', style: 'subtle' },
        { type: 'button', text: 'D', style: 'danger' },
        { type: 'button', text: 'E', style: 'bogus' },
        { type: 'card', title: 'S', text: 'x', intent: 'success' },
        { type: 'card', title: 'W', text: 'y', intent: 'warning' },
        { type: 'card', title: 'R', text: 'z', intent: 'danger' },
        { type: 'badge', text: 'n', tone: 'neutral' },
        { type: 'badge', text: 'p', tone: 'primary' },
        { type: 'badge', text: 'w', tone: 'warning' },
        { type: 'badge', text: 'd', tone: 'danger' },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /class="dg-btn dg-btn--secondary">B</);
  assert.match(html, /class="dg-btn dg-btn--subtle">C</);
  assert.match(html, /class="dg-btn dg-btn--danger">D</);
  assert.match(html, /class="dg-btn dg-btn--primary">E</); // unknown -> default
  assert.match(html, /class="dg-card dg-card--success"/);
  assert.match(html, /class="dg-card dg-card--warning"/);
  assert.match(html, /class="dg-card dg-card--danger"/);
  assert.match(html, /class="dg-badge dg-badge--neutral">n</);
  assert.match(html, /class="dg-badge dg-badge--primary">p</);
  assert.match(html, /class="dg-badge dg-badge--warning">w</);
  assert.match(html, /class="dg-badge dg-badge--danger">d</);
});

test('user content is HTML-escaped in text and attributes', () => {
  // All component text goes through esc()/attr(); a <script> payload must never
  // survive into markup as a raw tag, and `"` in an attribute value must not be
  // able to break out and inject attributes.
  const evil = '<script>alert(1)</script>';
  const doc = {
    title: 'esc',
    sections: [{
      content: [
        { type: 'headline', text: evil },
        { type: 'paragraph', text: evil },
        { type: 'list', items: [evil, 'ok'] },
        { type: 'button', text: evil },
        { type: 'button', text: 'bt', href: 'x" onmouseover="bad' },
        { type: 'link', text: evil, href: 'a" onclick="bad' },
        { type: 'card', title: evil, text: evil },
        { type: 'badge', text: evil },
        { type: 'quote', text: evil, cite: evil },
        { type: 'stat', label: evil, value: evil, prefix: evil, suffix: evil, caption: evil },
        { type: 'table', rows: [[evil]] },
        { type: 'grid', items: [evil] },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.ok(!html.includes('<script>alert(1)'), 'no raw payload script tag survives');
  assert.ok(!html.includes('x" onmouseover="bad'), 'button href injection stays escaped');
  assert.ok(!html.includes('a" onclick="bad'), 'link href injection stays escaped');
  assert.match(html, /&lt;script&gt;/, 'text content is escaped');
  assert.match(html, /href="a&quot; onclick=&quot;bad"/, 'attribute injection is escaped');
  assert.match(html, /x&quot; onmouseover=&quot;bad/, 'button href injection is escaped');
});

test('headline id and list ordered render their documented fields', () => {
  // README component table: headline takes `id` (anchor) and list takes
  // `ordered` (ordered vs bullet list). Both were untested.
  const doc = {
    title: 'misc',
    sections: [{
      content: [
        { type: 'headline', text: 'Jump head', id: 'jump', level: 3 },
        { type: 'list', items: ['a', 'b'], ordered: true },
        { type: 'list', items: ['x', 'y'] },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<h3 id="jump" class="dg-headline dg-h3">Jump head<\/h3>/);
  assert.match(html, /<ol class="dg-ol"><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(html, /<ul class="dg-ul"><li>x<\/li><li>y<\/li><\/ul>/);
});

test('list and grid guard against missing items arrays', () => {
  // README: list takes `items[]` and grid takes `items[]`. Both are optional —
  // a missing or non-array value renders the empty container instead of
  // throwing (matching the paragraph/quote optional-text handling).
  const html = renderHtml({
    title: 'empty-collections',
    sections: [{
      content: [
        { type: 'list' },
        { type: 'grid' },
      ],
    }],
  });
  assert.match(html, /<ul class="dg-ul"><\/ul>/);
  assert.match(html, /<div class="dg-grid" style="grid-template-columns: repeat\(auto-fill, minmax\(220px, 1fr\)\);" data-grid-cols="3">\n\n<\/div>/);
});

test('fallbacks: card title object, headline level, badge tone', () => {
  // card `title` may be { text }; headline `level` outside 1-6 falls back to
  // h2; badge `tone` unknown falls back to neutral.
  const html = renderHtml({
    title: 'fallbacks',
    sections: [{
      content: [
        { type: 'card', title: { text: 'Obj Title' }, text: 'body' },
        { type: 'headline', text: 'H', level: 9 },
        { type: 'headline', text: 'H0' },
        { type: 'badge', text: 'b', tone: 'bogus' },
      ],
    }],
  });
  assert.match(html, /<h3 class="dg-card-title">Obj Title<\/h3>/, 'card title object form renders its text');
  const heads = html.match(/class="dg-headline dg-h(\d)"/g) || [];
  assert.ok(heads.every((h) => /dg-h2"/.test(h)), 'invalid and missing levels fall back to h2');
  assert.match(html, /<span class="dg-badge dg-badge--neutral">b<\/span>/, 'unknown badge tone -> neutral');
});

test('sidebar layout renders aside sidebar from first section nav widget', () => {
  const doc = {
    title: 'side',
    layout: 'sidebar',
    sections: [
      {
        nav: [
          { type: 'headline', level: 3, text: 'Jump to' },
          { type: 'link', text: 'Docs', href: '#s-docs' },
        ],
        content: [
          { type: 'paragraph', text: 'main content' },
        ],
      },
      {
        title: 'Docs',
        content: [{ type: 'paragraph', text: 'second section' }],
      },
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /<aside class="dg-sidebar" aria-label="Sidebar">/);
  assert.match(html, /class="dg-sidebar-wrap"/);
  assert.match(html, /Jump to/); // nav widget lives in the sticky aside
  assert.match(html, /second section/);
});

test('sidebar layout keeps chart ids aligned when content precedes nav in the DSL', () => {
  const doc = {
    title: 'side-charts',
    layout: 'sidebar',
    sections: [
      {
        // declared content first, nav second — the store must still key in
        // nav -> content order so both figures resolve their own rows
        content: [{ type: 'chart', kind: 'line', title: 'Main', data: [['m', 7]] }],
        nav: [{ type: 'chart', kind: 'pie', title: 'Mini', data: [{ label: 'z', value: 4 }] }],
      },
    ],
  };
  const html = renderHtml(doc);
  const store = JSON.parse(html.match(/window\.__DG_DATA__ = (\{[\s\S]*?\});/)[1]);
  const ids = [...html.matchAll(/data-chart-title="([^"]+)"[^>]*data-chart-data="([^"]+)"/g)]
    .map((m) => ({ title: m[1], id: m[2] }));
  assert.strictEqual(ids.length, 2);
  const byTitle = (t) => JSON.stringify(store[ids.find((f) => f.title === t).id]);
  assert.strictEqual(byTitle('Main'), JSON.stringify([['m', 7]]));
  assert.ok(byTitle('Mini').includes('"label":"z"'));
});

test('grid layout renders sections as auto-fit columns', () => {
  const doc = {
    title: 'grid',
    layout: 'grid',
    sections: [
      { content: [{ type: 'card', title: 'A', text: 'one' }] },
      { content: [{ type: 'card', title: 'B', text: 'two' }] },
      { content: [{ type: 'card', title: 'C', text: 'three' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /class="dg-layout-grid"/);
  const items = html.match(/class="dg-layout-grid-item"/g) || [];
  assert.strictEqual(items.length, 3);
});

test('layouts render hollow cells for sections with no widget content', () => {
  // A section may carry only a nav/hero widget or nothing at all. Every layout
  // falls back to an empty cell (never "null" text or a crash): grid items,
  // sidebar columns, and default stacked sections stay empty while hero-sub
  // still renders for hero-only sections.
  const grid = renderHtml({
    title: 'g', layout: 'grid',
    sections: [{ content: [{ type: 'card', title: 'A', text: 'x' }] }, {}],
  });
  assert.match(grid, /<div class="dg-layout-grid-item"><div class="dg-card">/);
  assert.match(grid, /<div class="dg-layout-grid-item"><\/div>/, 'empty section -> hollow grid item');

  const sidebar = renderHtml({
    title: 's', layout: 'sidebar',
    sections: [
      { nav: [{ type: 'link', text: 'Docs', href: '#d' }] }, // no content on the first column
      { title: 'Empty' },                                    // no widget at all
    ],
  });
  assert.match(sidebar, /<aside class="dg-sidebar" aria-label="Sidebar">[\s\S]*Docs/);
  assert.match(sidebar, /<h2 class="dg-section-title" id="s-empty">Empty<\/h2>\n<\/div>/,
    'sidebar column without content stays empty after its title');

  const landing = renderHtml({
    title: 'd',
    sections: [{ hero: [{ type: 'headline', level: 2, text: 'SubHero' }] }, {}],
  });
  assert.match(landing, /<section class="dg-section"><div class="dg-hero dg-hero-sub"><h2 class="dg-headline dg-h2">SubHero<\/h2><\/div><\/section>/);
  assert.match(landing, /<section class="dg-section"><\/section>/, 'empty section -> hollow stacked section');
});

test('a multi-word layout value resolves to its first word', () => {
  // The loader validates the first whitespace-delimited token of a layout
  // string and resolveLayout uses the same split, so a value like "hero
  // columns" (an accidental trailing descriptor) renders the hero layout
  // instead of erroring or silently producing the wrong layout.
  const hero = renderHtml({
    title: 'multiword',
    layout: 'hero columns',
    sections: [{ title: 'H', content: [{ type: 'paragraph', text: 'x' }] }],
  });
  assert.match(hero, /class="dg-hero-layout"/, 'first word of a multi-word layout wins');

  const grid = renderHtml({
    title: 'multiword2',
    layout: 'grid layout',
    sections: [{ title: 'G', content: [{ type: 'card', title: 'a', text: 'b' }] }],
  });
  assert.match(grid, /class="dg-layout-grid"/, 'multi-word grid resolves to grid');
});

test('resolveLayout falls back to landing for an unknown layout name', () => {
  // validatePage rejects unknown layout tokens before renderHtml ever calls
  // resolveLayout, so the fallback is only reachable when the exported helper
  // is driven directly. An unrecognized token must resolve to a real layout
  // (landing) rather than leaking an undefined key into the class emission.
  const { resolveLayout } = require('../lib/render');
  assert.strictEqual(resolveLayout({ layout: 'nonsense' }), 'landing',
    'unknown layout token falls back to landing');
  assert.strictEqual(resolveLayout({ layout: 'hero extras' }), 'hero',
    'first word still wins before the unknown-token fallback');
});

test('grid component honors columns as a fixed layout and defaults to auto-fill', () => {
  const doc = {
    title: 'grid-comp',
    layout: 'section',
    sections: [
      {
        title: 'Fixed',
        content: [
          { type: 'grid', columns: 4, items: [{ title: 'a', text: '1' }, { title: 'b', text: '2' }] },
          { type: 'grid', columnWidth: '180px', items: [{ title: 'c', text: '3' }] },
        ],
      },
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /class="dg-grid" style="grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);" data-grid-cols="4"/);
  assert.match(html, /style="grid-template-columns: repeat\(auto-fill, minmax\(180px, 1fr\)\);" data-grid-cols="3"/);
  assert.strictEqual((html.match(/class="dg-cell"/g) || []).length, 3);
});

test('hero layout renders sections as hero columns', () => {
  const doc = {
    title: 'hero-layout',
    layout: 'hero',
    sections: [
      { hero: [{ type: 'headline', level: 1, text: 'Lead' }] },
      { hero: [{ type: 'paragraph', text: 'Supporting text' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /class="dg-hero-layout"/);
  assert.match(html, /class="dg-hero-col dg-hero-col--lead"/);
  assert.match(html, /Supporting text/);
});

test('hero layout falls back to content for columns without a hero widget', () => {
  // Hero-mode layout columns are the section widgets; a section carrying only
  // `content:` (or neither widget) still renders a column via the
  // hero||content fallback and the empty-string default.
  const doc = {
    title: 'hero-mixed',
    layout: 'hero',
    sections: [
      { content: [{ type: 'paragraph', text: 'Lead via content' }] },
      { hero: [{ type: 'headline', level: 2, text: 'Hero col' }] },
      {},
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /class="dg-hero-layout" role="grid"/);
  assert.match(html, /class="dg-hero-col dg-hero-col--lead" aria-label="Lead"><p class="dg-paragraph">Lead via content<\/p>/);
  assert.match(html, /class="dg-hero-col"><h2 class="dg-headline dg-h2">Hero col<\/h2>/);
  assert.match(html, /class="dg-hero-col"><\/div>/, 'empty section renders an empty column');
});

test('single-object section content is normalized like nav/hero', () => {
  // A section may carry `content:` as a single component object (nav/hero
  // accept one via normalizeWidgets); the section must render it instead of
  // silently dropping the widget.
  const doc = {
    title: 'single-content',
    sections: [{
      content: { type: 'paragraph', text: 'Only content object' },
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /Only content object/);
});

test('section hero renders as a sub-hero strip above content', () => {
  // README: sections may carry `hero:` (a sub-hero strip) in addition to
  // `content:`; under the default landing layout it renders inside the section
  // as a dg-hero-sub strip, before the section content.
  const doc = {
    title: 'subhero',
    sections: [{
      hero: [{ type: 'headline', level: 2, text: 'Spotlight' }],
      content: [{ type: 'paragraph', text: 'Body copy' }],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<section class="dg-section">/);
  assert.match(html, /class="dg-hero dg-hero-sub"/);
  assert.ok(html.indexOf('dg-hero dg-hero-sub') < html.indexOf('Body copy'), 'sub-hero strip precedes section content');
  assert.match(html, /Spotlight/);
  assert.match(html, /Body copy/);
});

test('page-level hero accepts the { content: [...] } container form', () => {
  // README: hero is "a component list or { content: [...] }". The container
  // form must render identically to the plain list form (dg-hero header).
  const doc = {
    title: 'container-hero',
    hero: { content: [{ type: 'headline', level: 1, text: 'Container-led hero' }] },
    sections: [],
  };
  const html = renderHtml(doc);
  assert.match(html, /<header class="dg-hero">/);
  assert.match(html, /class="dg-hero-inner"/);
  assert.match(html, /Container-led hero/);
});

test('paragraph inline-link object form renders an anchored paragraph', () => {
  // README: paragraph `text` may be given in the `{ text, href }` inline-link
  // form (or `{ text, link: { href, newtab } }`). It must render a
  // dg-paragraph containing a dg-link anchor to the resolved href.
  const doc = {
    title: 'links',
    sections: [{
      content: [
        { type: 'paragraph', text: 'Read', href: 'https://example.com' },
        { type: 'paragraph', text: 'Open', link: { href: 'https://ext.example.com', newtab: true } },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<p class="dg-paragraph">Read <a href="https:\/\/example.com" class="dg-link">https:\/\/example.com<\/a><\/p>/);
  assert.match(html, /Open <a href="https:\/\/ext.example.com" class="dg-link" target="_blank" rel="noopener">/);
});

test('button and link honour newtab with target/rel', () => {
  // README: button and link expose a `newtab` key; when true the anchor must
  // open in a new tab (target=_blank + rel=noopener), otherwise no target.
  const doc = {
    title: 'newtab',
    sections: [{
      content: [
        { type: 'button', text: 'Open', href: 'https://btn.example.com', newtab: true },
        { type: 'button', text: 'Stay', href: 'https://btn2.example.com' },
        { type: 'link', text: 'Away', href: 'https://link.example.com', newtab: true },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<a href="https:\/\/btn.example.com" class="dg-btn dg-btn--primary" target="_blank" rel="noopener">Open<\/a>/);
  assert.match(html, /<a href="https:\/\/btn2.example.com" class="dg-btn dg-btn--primary">Stay<\/a>/);
  assert.match(html, /<a href="https:\/\/link.example.com" class="dg-link" target="_blank" rel="noopener">Away<\/a>/);
});

test('link with style button renders as a button-styled anchor', () => {
  // README component table: link takes `style` (`button`) — the renderer must
  // merge the dg-btn classes onto the dg-link anchor so it looks like a button
  // without losing its default plain-text appearance.
  const doc = {
    title: 'linkbtn',
    sections: [{
      content: [
        { type: 'link', text: 'Docs', href: '#s-docs', style: 'button' },
        { type: 'link', text: 'Plain', href: '#plain' },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<a href="#s-docs" class="dg-link dg-btn dg-btn--primary">Docs<\/a>/);
  assert.match(html, /<a href="#plain" class="dg-link">Plain<\/a>/);
});

test('link falls back to label key and headline defaults to h2', () => {
  // README: link takes `text`/`label` (the label form must render as the link
  // text); headline takes `level` (1-6) with an implicit default of h2 when
  // absent, and out-of-range levels fall back to h2.
  const doc = {
    title: 'label',
    sections: [{
      content: [
        { type: 'link', label: 'Docs', href: '#docs' },
        { type: 'headline', text: 'Fallback head' },
        { type: 'headline', text: 'Wild head', level: 9 },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<a href="#docs" class="dg-link">Docs<\/a>/);
  assert.match(html, /<h2 class="dg-headline dg-h2">Fallback head<\/h2>/);
  assert.match(html, /<h2 class="dg-headline dg-h2">Wild head<\/h2>/);
  assert.ok(!html.includes('<h9'), 'out-of-range level never renders raw');
});

test('button and link default to placeholder text and href when absent', () => {
  // README: button takes `text`; link takes `text`/`label` and `href`. A
  // missing text falls back to "Button"/"Link" and a missing link href falls
  // back to "#" so the anchor stays well-formed.
  const html = renderHtml({
    title: 'defaults',
    sections: [{
      content: [
        { type: 'button', style: 'primary' },
        { type: 'link' },
      ],
    }],
  });
  assert.match(html, /<button type="button" class="dg-btn dg-btn--primary">Button<\/button>/);
  assert.match(html, /<a href="#" class="dg-link">Link<\/a>/);
});

test('chart and table captions surface as aria-labels and notes', () => {
  // README: table takes a `caption` (rendered as the table aria-label) and
  // chart takes a `caption` (rendered as the figure aria-label plus a visible
  // dg-note line under the chart title).
  const doc = {
    title: 'captions',
    sections: [{
      content: [
        { type: 'table', caption: 'Env table', rows: [['k', 'v'], ['a', 'b']] },
        { type: 'chart', kind: 'line', title: 'CPU', caption: 'Rolling 1h', data: [['x', 1]] },
      ],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<table class="dg-table" aria-label="Env table">/);
  assert.match(html, /class="dg-figure dg-chart"[^>]*aria-label="Rolling 1h"/);
  assert.match(html, /<p class="dg-note">Rolling 1h<\/p>/);
});

test('page-level nav renders a labelled nav from { label, href } items', () => {
  // README a11y: generated pages include "a labelled <nav>". The page-level
  // `nav:` key takes a { label, href } list and renders as a dg-nav landmark
  // with an aria-label, ahead of the main landmark.
  const doc = {
    title: 'nav-page',
    description: 'desc',
    nav: [{ label: 'Metrics', href: '#s-metrics' }, { label: 'Docs', href: '#docs' }],
    sections: [{ title: 'Metrics', content: [{ type: 'paragraph', text: 'hi' }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /<nav class="dg-nav" aria-label="Primary"><ul>/);
  assert.match(html, /<li><a class="dg-navlink" href="#s-metrics">Metrics<\/a><\/li>/);
  assert.match(html, /<li><a class="dg-navlink" href="#docs">Docs<\/a><\/li>/);
  assert.ok(html.indexOf('dg-navlink') < html.indexOf('<main'), 'nav precedes the main landmark');
});

test('explicit nav item label and href fall backs', () => {
  // A page-level `nav:` item may omit the label (the href text is used instead)
  // or the href (falls back to "#"); an item with neither still renders a link
  // with an empty text and a bare "#" instead of crashing.
  const doc = {
    title: 'nav-fb',
    nav: [{ href: '#docs' }, { label: 'Home' }, {}],
    sections: [],
  };
  const html = renderHtml(doc);
  assert.match(html, /<li><a class="dg-navlink" href="#docs">#docs<\/a><\/li>/);
  assert.match(html, /<li><a class="dg-navlink" href="#">Home<\/a><\/li>/);
  assert.match(html, /<li><a class="dg-navlink" href="#"><\/a><\/li>/);
});

test('page-level nav auto-links section titles when no nav key is given', () => {
  // Without `nav:`, the labelled <nav> is still emitted, one link per section,
  // pointing at the slugified section anchor each section renders.
  const doc = {
    title: 'auto-nav',
    description: 'd',
    sections: [
      { title: 'Metrics', content: [{ type: 'paragraph', text: 'hi' }] },
      { title: 'Docs & More', content: [{ type: 'paragraph', text: 'bye' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /<nav class="dg-nav" aria-label="Primary">/);
  assert.match(html, /href="#s-metrics">Metrics<\/a>/);
  assert.match(html, /href="#s-docs-more">Docs &amp; More<\/a>/);
  assert.match(html, /id="s-metrics"/);
  assert.match(html, /id="s-docs-more"/);
});

test('explicit empty nav list suppresses the nav landmark entirely', () => {
  // `nav: []` is a valid (empty) overrides list: it disables the auto-generated
  // section nav but must not emit a hollow <nav> element either — renderNav
  // falls through to the `!links.length` early return when the explicit list is
  // empty and there are no sections left to auto-link.
  const doc = { title: 'nonav', nav: [], sections: [] };
  const html = renderHtml(doc);
  assert.ok(!html.includes('<nav class="dg-nav"'), 'no nav landmark is emitted');
  assert.ok(!html.includes('class="dg-navlink"'), 'no nav links rendered');
});

test('duplicate section titles get deduped anchor ids shared with the auto nav', () => {
  // Two sections titled "Same" must not emit duplicate id="s-same" attributes
  // (invalid HTML with ambiguous anchors); the second becomes s-same-2, and the
  // auto nav links to the deduped id so every anchor still resolves.
  const doc = {
    title: 'dedupe',
    sections: [
      { title: 'Same', content: [{ type: 'paragraph', text: 'a' }] },
      { title: 'Same', content: [{ type: 'paragraph', text: 'b' }] },
      { title: 'Also Same', content: [{ type: 'paragraph', text: 'c' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /<h2 class="dg-section-title" id="s-same">Same<\/h2>/);
  assert.match(html, /<h2 class="dg-section-title" id="s-same-2">Same<\/h2>/);
  assert.match(html, /<h2 class="dg-section-title" id="s-also-same">Also Same<\/h2>/);
  assert.match(html, /<li><a class="dg-navlink" href="#s-same">Same<\/a><\/li>/);
  assert.match(html, /<li><a class="dg-navlink" href="#s-same-2">Same<\/a><\/li>/);
  assert.match(html, /<li><a class="dg-navlink" href="#s-also-same">Also Same<\/a><\/li>/);
  // No duplicate id attributes anywhere on the page.
  const ids = [...html.matchAll(/id="s-([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(new Set(ids).size, ids.length, 'section anchor ids are unique');
});

test('non-ASCII section titles fall back to an s-item slug anchor', () => {
  // components.js slugify strips every non [a-z0-9] char; a title with no
  // ASCII at all (e.g. an emoji-only or CJK title) yields an empty slug, and
  // the section anchor + auto-nav must fall back to "s-item" instead of
  // emitting a broken empty href/id.
  const doc = {
    title: 'i18n',
    sections: [
      { title: '🎉 庆祝', content: [{ type: 'paragraph', text: 'x' }] },
      { title: '数据', content: [{ type: 'paragraph', text: 'y' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.match(html, /<h2 class="dg-section-title" id="s-item">🎉 庆祝<\/h2>/);
  assert.match(html, /<li><a class="dg-navlink" href="#s-item">🎉 庆祝<\/a><\/li>/);
  assert.match(html, /id="s-item-2"/, 'second empty slug falls back with the dedupe suffix');
  assert.match(html, /href="#s-item-2"/);
});

test('null section entries are skipped in nav and layout instead of crashing', () => {
  // `sections` validation only checks it is an array, so a null entry can reach
  // the render pass. collectChartData already skips null sections; renderNav and
  // asWidgets must do the same (s.title on null used to throw a raw TypeError
  // that aborted the whole build). The null entry is omitted — no stub nav link,
  // no hollow section — and following sections still render.
  const doc = {
    title: 'nullsec',
    sections: [
      null,
      { title: 'Reach', content: [{ type: 'paragraph', text: 'hi' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.strictEqual((html.match(/<section class="dg-section">/g) || []).length, 1,
    'only the real section renders');
  assert.strictEqual((html.match(/class="dg-navlink"/g) || []).length, 1,
    'the null entry gets no nav link');
  assert.match(html, /<li><a class="dg-navlink" href="#s-reach">Reach<\/a><\/li>/);
  assert.match(html, /<h2 class="dg-section-title" id="s-reach">Reach<\/h2>/);
  assert.match(html, /<p class="dg-paragraph">hi<\/p>/);
});

test('unknown component type raises readable error', () => {
  const doc = { title: 'x', sections: [{ content: [{ type: 'nope' }] }] };
  assert.throws(
    () => renderHtml(doc),
    (err) => err.name === 'StyleError' && /Unknown component type/.test(err.message)
  );
});

test('stat component renders KPI value, label, prefix/suffix, delta and progress', () => {
  const doc = {
    title: 'stats',
    sections: [{
      content: [{
        type: 'stat',
        label: 'Requests/min',
        value: '1180',
        prefix: '~',
        suffix: '/m',
        delta: { value: 12.4, tone: 'good' },
        progress: 73,
        progressTone: 'success',
        caption: 'Rolling 1h average',
      }],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /class="dg-stat"/);
  assert.match(html, /class="dg-stat-value"[^>]*>~1180\/m</);
  assert.match(html, /class="dg-stat-label"[^>]*>Requests\/min</);
  assert.match(html, /class="dg-stat-delta dg-stat-delta--good"[^>]*>▲ 12.4</);
  assert.match(html, /class="dg-stat-progress"/);
  assert.match(html, /class="dg-stat-progress-fill dg-stat-progress-fill--success" style="width:73%"/);
  assert.match(html, /class="dg-stat-caption"[^>]*>Rolling 1h average</);
  assert.match(html, /role="img"/); // a11y: figure has a label
});

test('stat delta renders neutral for numeric without tone and honors bad tone', () => {
  const html = renderHtml({
    title: 'stats',
    sections: [{
      content: [
        { type: 'stat', label: 'A', value: '1', delta: -8 },
        { type: 'stat', label: 'B', value: '2', delta: { value: -0.5, tone: 'bad' } },
        { type: 'stat', label: 'C', value: '3', delta: 0 },
        { type: 'stat', label: 'D', value: '4', delta: '8' },
      ],
    }],
  });
  assert.match(html, /class="dg-stat-delta"[^>]*>▼ 8</); // neutral, arrow carries the sign
  assert.match(html, /class="dg-stat-delta dg-stat-delta--bad"[^>]*>▼ 0.5</);
  // A zero delta renders the bare "0" with no direction arrow; a numeric-string
  // delta is coerced through Number and rendered on the same scale (▲ 8).
  assert.match(html, /class="dg-stat-delta"[^>]*>0</);
  assert.match(html, /class="dg-stat-delta"[^>]*>▲ 8</);
  let zeroDelta = html.match(/class="dg-stat-delta"[^>]*>0</);
  assert.ok(zeroDelta, 'zero delta rendered without a glyph');
  assert.ok(!/>▲ 0<|>▼ 0</.test(html), 'no arrow glyphs preface the zero delta');
});

test('button icon adds an inline SVG and stat progressLabel overrides the aria label', () => {
  // README: buttons take `icon: true` (leading arrow glyph) and the stat
  // progress bar defaults its accessible label to "N%" unless `progressLabel`
  // is given. Both were documented but unpinned.
  const html = renderHtml({
    title: 'details',
    sections: [{
      content: [
        { type: 'button', text: 'Go', style: 'primary', icon: true },
        { type: 'button', text: 'Plain', style: 'primary' },
        { type: 'stat', label: 'Rate', value: '42', progress: 63, progressLabel: '63 percent complete' },
        { type: 'stat', label: 'Fill', value: '1', progress: 8 },
      ],
    }],
  });
  const withIcon = /<button type="button" class="dg-btn dg-btn--primary">Go<svg class="dg-icon" viewBox="0 0 24 24"/.test(html);
  assert.ok(withIcon, 'icon button embeds the arrow svg');
  assert.match(html, /<button type="button" class="dg-btn dg-btn--primary">Plain<\/button>/, 'no icon without the flag');
  assert.match(html, /class="dg-stat-progress" aria-label="63 percent complete" role="img"/, 'progressLabel drives the aria label');
  assert.match(html, /class="dg-stat-progress" aria-label="8%" role="img"/, 'progress defaults to N% when no label');
});

test('stat drops non-numeric delta/progress and clamps progress to 0-100', () => {
  // components.js renderStat: a delta string Number() can't parse and a
  // non-numeric progress value are silently dropped, progress is clamped into
  // 0-100, and unknown delta/progressTone values fall back to neutral/primary.
  // All were implied by the README but unpinned.
  const html = renderHtml({
    title: 'stats',
    sections: [{
      content: [
        { type: 'stat', label: 'A', value: '5', delta: 'abc' },
        { type: 'stat', label: 'B', value: '6', progress: 'fifty' },
        { type: 'stat', label: 'C', value: '7', progress: 110, progressTone: 'glow' },
        { type: 'stat', label: 'D', value: '8', progress: -20 },
        { type: 'stat', label: 'E', value: '9', delta: { value: 3, tone: 'glow' } },
      ],
    }],
  });
  // Scope to <main> so the embedded style block's class markers can't pollute
  // the counts.
  const body = html.slice(html.indexOf('<main'));
  assert.strictEqual(
    (body.match(/class="dg-stat-delta/g) || []).length,
    1,
    'only the finite delta renders (abc and the object delta both settle on one)'
  );
  assert.match(body, /class="dg-stat-delta"[^>]*>▲ 3</, 'object delta with unknown tone renders neutral');
  assert.strictEqual(
    (body.match(/class="dg-stat-progress"/g) || []).length,
    2,
    'only finite progress values render (fifty is dropped)'
  );
  assert.match(body, /dg-stat-progress-fill dg-stat-progress-fill--primary" style="width:100%"/, 'progress clamps above 100');
  assert.match(body, /dg-stat-progress-fill dg-stat-progress-fill--primary" style="width:0%"/, 'progress clamps below 0');
  assert.ok(!/dg-stat-progress-fill--glow/.test(body), 'unknown progressTone falls back to primary');
});

test('stat falls back to title label and to a bare stat aria-label', () => {
  // components.js renderStat: the figure label is `c.label || c.title || ''`.
  // A stat given only a `title:` uses it as the label, and one with neither
  // still renders with the accessible name "stat" and an empty label line
  // instead of an unlabeled figure.
  const html = renderHtml({
    title: 'stat-labels',
    sections: [{
      content: [
        { type: 'stat', title: 'Sessions', value: '12' },
        { type: 'stat', value: '99' },
      ],
    }],
  });
  assert.match(html, /class="dg-stat" role="img" aria-label="Sessions"/);
  assert.match(html, /class="dg-stat-label">Sessions<\/div>/);
  assert.match(html, /class="dg-stat" role="img" aria-label="stat"/);
  assert.match(html, /class="dg-stat-label"><\/div>/);
});

test('grid card shorthand and quote cite object render their cell forms', () => {
  // README: a grid `items` entry may be `{ card: {...} }` (full card inside a
  // cell) and a quote `cite` may be `{ text }`. Both were unpinned.
  const html = renderHtml({
    title: 'shorthands',
    sections: [{
      content: [
        {
          type: 'grid',
          columns: 2,
          items: [
            { card: { title: 'C1', text: 'one', intent: 'success' } },
            'plain text item',
          ],
        },
        { type: 'quote', text: 'Measure twice.', cite: { text: 'Ops Handbook' } },
      ],
    }],
  });
  assert.match(
    html,
    /<div class="dg-cell"><div class="dg-card dg-card--success"><h3 class="dg-card-title">C1<\/h3>one<\/div>/,
    'card shorthand renders a full card inside the cell'
  );
  assert.match(html, /<div class="dg-cell">plain text item<\/div>/, 'string items render escaped text');
  assert.match(html, /<footer class="dg-quote-cite">— Ops Handbook<\/footer>/, 'cite object form renders its text');
});

test('grid cells render any full component object via item.type', () => {
  // README: a grid `items` entry may be a full component object; the cell
  // delegates to that component's renderer. The dashboard example already
  // slots stats into a grid, but this branch was unpinned in the unit suite.
  const html = renderHtml({
    title: 'grid-components',
    sections: [{
      content: [{
        type: 'grid',
        items: [
          { type: 'stat', label: 'Rate', value: '42' },
          { type: 'button', text: 'Go', style: 'primary' },
          { type: 'badge', text: 'stable', tone: 'success' },
        ],
      }],
    }],
  });
  assert.match(html, /<div class="dg-cell"><div class="dg-stat" role="img" aria-label="Rate">/, 'stat component renders inside the cell');
  assert.match(html, /<div class="dg-cell"><button type="button" class="dg-btn dg-btn--primary">Go<\/button><\/div>/, 'button component renders inside the cell');
  assert.match(html, /<div class="dg-cell"><span class="dg-badge dg-badge--success">stable<\/span><\/div>/, 'badge component renders inside the cell');
});

test('invalid chart data shape raises StyleError', () => {
  const doc = {
    title: 'x',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: 42 }] }],
  };
  assert.throws(
    () => renderHtml(doc),
    (err) => err.name === 'StyleError' && /chart/.test(err.message)
  );
});

test('bad fetch URL raises FetchSpecError', () => {
  const doc = {
    title: 'x',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: { fetch: 'ftp://bad' } }] }],
  };
  assert.throws(
    () => renderHtml(doc),
    (err) => err.name === 'FetchSpecError'
  );
});

test('relative fetch URL is allowed for local fixtures', () => {
  const doc = {
    title: 'x',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: { fetch: 'market.json' } }] }],
  };
  const html = renderHtml(doc);
  assert.ok(html.includes('market.json'));
});

test('self:// fetch specs embed as relative paths for the runtime', () => {
  // README: "self://<path> is treated as a local relative path". fetch()
  // rejects the self scheme at page-open, so the embedded runtime manifest
  // must carry the plain relative fixture path only.
  const doc = {
    title: 'x',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: { fetch: 'self://data/market.json' } }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /data-chart-source="self:\/\/data\/market\.json"/, 'attribute keeps the authored spec');
  assert.ok(!html.includes('fetch("self:'), 'runtime never calls fetch on a self: URL');
  assert.match(
    html,
    /\{"key":"chart-0","url":"data\/market\.json"\}/,
    'runtime manifest embeds the normalized relative path'
  );
});

test('self:// absolute-ish path still normalizes to a relative fixture path', () => {
  const doc = {
    title: 'x',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: { fetch: 'self://fixtures/market.json' } }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /"url":"fixtures\/market\.json"/);
  assert.ok(!html.includes('fetch("self:'));
});

test('bad YAML raises ParseError with position', () => {
  assert.throws(
    () => buildFromSource('title: [unclosed\n  sections:\n  - {', 'bad.yaml'),
    (err) => err.name === 'ParseError' && /YAML|JSON/.test(err.message)
  );
});

test('bad JSON raises ParseError', () => {
  assert.throws(
    () => buildFromSource('{ "title": ', 'bad.json'),
    (err) => err.name === 'ParseError' && /JSON parse error/.test(err.message)
  );
});

test('parseDsl without a filename falls back to "." in parse-error locations', () => {
  // parseDsl is exported for direct in-memory use (watch mode re-parses the DSL
  // source); a caller that passes no filename must still get a ParseError whose
  // location reads "." rather than "undefined" in the formatted message.
  const { parseDsl } = require('../lib/loader');
  const cases = [
    { source: '{ "title": ', desc: 'JSON' },
    { source: 'title: [unclosed\n  sections:\n  - {', desc: 'YAML' },
  ];
  for (const { source, desc } of cases) {
    assert.throws(
      () => parseDsl(source),
      (err) => {
        assert.strictEqual(err.name, 'ParseError', `${desc} raises ParseError`);
        assert.strictEqual(err.path, '.', `${desc} location falls back to "."`);
        assert.ok(err.format().endsWith('\n  at: .'), `${desc} formats the fallback location`);
        return true;
      }
    );
  }
});

test('YAML flow-style DSL starting with { or [ parses as YAML, not JSON', () => {
  // A "{"- or "["-leading document is ambiguous: it could be JSON or YAML
  // flow style ({title: t}). detectSpec guesses JSON; when JSON.parse fails the
  // loader must fall back to YAML instead of surfacing a confusing JSON error.
  const { parseDsl } = require('../lib/loader');
  const { buildFromSource } = require('../lib/build');

  const data = parseDsl('{title: flow, sections: []}');
  assert.strictEqual(data.data.title, 'flow');
  assert.deepStrictEqual(data.data.sections, []);

  // The flow-style source must actually build into a rendered page.
  const html = buildFromSource('{title: flow, sections: []}', 'flow.yaml');
  assert.match(html, /<title>flow<\/title>/);
  assert.ok(html.includes('dg-section'), 'renders the section surface');

  // A BOM before the brace must not break the fallback either.
  const bom = parseDsl('\uFEFF{title: bom, sections: []}');
  assert.strictEqual(bom.data.title, 'bom');
});

// ---------------------------------------------------------------------------
// Page-level validation (lib/loader.js validatePage)
// ---------------------------------------------------------------------------

test('unsupported layout raises StyleError listing supported layouts', () => {
  const doc = { title: 'x', layout: 'wacky', sections: [] };
  assert.throws(
    () => renderHtml(doc),
    (err) =>
      err.name === 'StyleError' &&
      /Unsupported layout "wacky"/.test(err.message) &&
      /hero, grid, sidebar, section, landing/.test(err.message) &&
      err.path === 'page.layout'
  );
});

test('non-string title and description raise StyleError', () => {
  assert.throws(
    () => renderHtml({ title: 42, sections: [] }),
    (err) => err.name === 'StyleError' && /"title" must be a string/.test(err.message) && err.path === 'page.title'
  );
  assert.throws(
    () => renderHtml({ title: 'x', description: [1], sections: [] }),
    (err) => err.name === 'StyleError' && /"description" must be a string/.test(err.message) && err.path === 'page.description'
  );
});

test('non-mapping theme raises StyleError', () => {
  assert.throws(
    () => renderHtml({ title: 'x', theme: '#fff', sections: [] }),
    (err) => err.name === 'StyleError' && /"theme" must be a mapping of CSS tokens/.test(err.message) && err.path === 'page.theme'
  );
});

test('non-list sections, hero, and nav shapes raise StyleError', () => {
  assert.throws(
    () => renderHtml({ title: 'x', sections: {} }),
    (err) => err.name === 'StyleError' && /"sections" must be a list/.test(err.message) && err.path === 'page.sections'
  );
  assert.throws(
    () => renderHtml({ title: 'x', hero: 'nope', sections: [] }),
    (err) => err.name === 'StyleError' && /"hero" must be a component list or \{ content: \[\.\.\.\] \}/.test(err.message) && err.path === 'page.hero'
  );
  assert.throws(
    () => renderHtml({ title: 'x', nav: {}, sections: [] }),
    (err) => err.name === 'StyleError' && /"nav" must be a list of \{ label, href \} items/.test(err.message) && err.path === 'page.nav'
  );
});

// ---------------------------------------------------------------------------
// CSV + JSON inline + file bindings
// ---------------------------------------------------------------------------

test('inline CSV data binds to chart store', () => {
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'bar', data: { csv: 'label,val\nQ1,4\nQ2,9' } }] }],
  };
  const html = renderHtml(doc);
  assert.match(html, /window\.__DG_DATA__ = \{.*"Q1"/);
});

test('inline JSON data binds to chart store', () => {
  const doc = {
    title: 't',
    sections: [{
      content: [{ type: 'chart', kind: 'bar', data: { json: [{ label: 'a', v: 1 }, { label: 'b', v: 2 }] } }],
    }],
  };
  const html = renderHtml(doc);
  assert.match(html, /window\.__DG_DATA__ = \{"chart-0":\[\{"label":"a","v":1\},\{"label":"b","v":2\}\]\}/);
});

test('local data file binding is resolved into the store', () => {
  const tmp = path.join(ExampleTmp(), 'data');
  const fileDir = path.join(tmp, 'fixtures');
  fs.mkdirSync(fileDir, { recursive: true });
  fs.writeFileSync(path.join(fileDir, 'data.json'), JSON.stringify([{ label: 'a', series: { v: 1 } }]));
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', file: 'data.json' }] }],
  };
  const html = renderHtml(doc, { fileDir });
  assert.match(html, /window\.__DG_DATA__ = \{"chart-0":\[\{"label":"a"/);
});

test('absolute data file binding resolves without fileDir', () => {
  // A file: path that is absolute is used as-is — fileDir is ignored — so a
  // temp fixture outside the DSL directory still binds into the store.
  const tmp = path.join(ExampleTmp(), 'abs');
  const dir = path.join(tmp, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const absPath = path.join(dir, 'abs.json');
  fs.writeFileSync(absPath, JSON.stringify([{ label: 'abs', series: { v: 7 } }]));
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', file: absPath }] }],
  };
  // fileDir points nowhere in particular; the absolute binding must win.
  const html = renderHtml(doc, { fileDir: path.join(tmp, 'nowhere') });
  assert.match(html, /window\.__DG_DATA__ = \{"chart-0":\[\{"label":"abs"/);
});

test('relative data file binding falls back to the cwd without fileDir', () => {
  // With no fileDir option the relative file path joins against '.' — the
  // process cwd — so a fixture next to the current directory still binds
  // (mirrors the absolute path treating fileDir as optional).
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-rel-filedir-'));
  fs.writeFileSync(path.join(tmp, 'data.json'), JSON.stringify([{ label: 'cwd', series: { v: 5 } }]));
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', file: 'data.json' }] }],
  };
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    const html = renderHtml(doc); // no fileDir option at all
    assert.match(
      html,
      /window\.__DG_DATA__ = \{"chart-0":\[\{"label":"cwd","series":\{"v":5\}\}\]\}/,
      'relative binding resolves against the cwd and binds the rows'
    );
  } finally {
    process.chdir(origCwd);
  }
});

test('CSV data file binding is parsed into rows at build time', () => {
  const tmp = path.join(ExampleTmp(), 'csv');
  const fileDir = path.join(tmp, 'fixtures');
  fs.mkdirSync(fileDir, { recursive: true });
  fs.writeFileSync(path.join(fileDir, 'data.csv'), 'label,val\nQ1,4\nQ2,9\n');
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', file: 'data.csv' }] }],
  };
  const html = renderHtml(doc, { fileDir });
  assert.match(html, /window\.__DG_DATA__ = \{"chart-0":\[\["label","val"\],\["Q1","4"\],\["Q2","9"\]\]\}/);
});

test('file binding validation errors raise DataFileError with the chart file path', () => {
  const fileDir = path.join(ExampleTmp(), 'err-fixtures');
  fs.mkdirSync(fileDir, { recursive: true });
  const chart = (extra) => ({
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', ...extra }] }],
  });

  // chart with no data and no file is legal (runtime "no data"), but an empty
  // file path, an unreadable file, malformed JSON, and a bad extension fail.
  assert.throws(
    () => renderHtml(chart({ file: '' }), { fileDir }),
    (err) => err.name === 'DataFileError'
      && /file" must be a non-empty path/.test(err.message)
      && err.path === 'page.sections[0].content.file'
  );
  assert.throws(
    () => renderHtml(chart({ file: 'missing.json' }), { fileDir }),
    (err) => err.name === 'DataFileError'
      && /Could not read data file "missing\.json" \(ENOENT\)/.test(err.message)
      && err.path === 'page.sections[0].content.file'
  );
  fs.writeFileSync(path.join(fileDir, 'bad.json'), '{ nope');
  assert.throws(
    () => renderHtml(chart({ file: 'bad.json' }), { fileDir }),
    (err) => err.name === 'DataFileError'
      && /"bad\.json" is not valid JSON/.test(err.message)
      && err.path === 'page.sections[0].content.file'
  );
  fs.writeFileSync(path.join(fileDir, 'data.txt'), 'x');
  assert.throws(
    () => renderHtml(chart({ file: 'data.txt' }), { fileDir }),
    (err) => err.name === 'DataFileError'
      && /Unsupported data file extension "\.txt"/.test(err.message)
      && err.path === 'page.sections[0].content.file'
  );
});

test('chart with unsupported data shape raises StyleError at the data path', () => {
  // data may be inline rows, { csv }, { json }, { fetch }, or a file: binding
  // — any other shape (here a bare mapping) must fail loudly, not silently
  // render an empty chart.
  const doc = {
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: { bogus: 1 } }] }],
  };
  assert.throws(
    () => renderHtml(doc),
    (err) => err.name === 'StyleError'
      && /chart "data" must be inline rows/.test(err.message)
      && err.path === 'page.sections[0].content.data'
  );
});

test('content item without a string type raises StyleError', () => {
  // renderComponents requires every section content item to carry a "type";
  // a stray non-object or typeless entry must fail at build time.
  const doc = { title: 't', sections: [{ content: [42] }] };
  assert.throws(
    () => renderHtml(doc),
    (err) => err.name === 'StyleError'
      && /Every content item must be an object with a "type"/.test(err.message)
      && err.path === 'component'
  );
});

function ExampleTmp() {
  const os = require('node:os');
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dg-fixture-'));
}

test('JSON DSL source builds like YAML', () => {
  const doc = {
    title: 'json site',
    description: 'from json',
    sections: [{ content: [{ type: 'card', title: 'C', text: 'ok' }] }],
  };
  const html = buildFromSource(JSON.stringify(doc), 'site.json');
  assert.match(html, /<title>json site<\/title>/);
  assert.strictEqual(html.includes('<meta name="generator"'), true);
  assert.match(html, /class="dg-card"/);
  // A JSON array at top level is not a valid page — must fail as a style error.
  assert.throws(
    () => buildFromSource(JSON.stringify([{ title: 'bad' }]), 'list.json'),
    (err) => err.name === 'StyleError'
  );
});

// ---------------------------------------------------------------------------
// fetch example
// ---------------------------------------------------------------------------

test('fetch example keeps runtime fetch specs but no inline data', () => {
  const html = buildFixture('fetch');
  assert.match(html, /market\.json/); // runtime fetch manifest
  assert.ok(!/window\.__DG_DATA__ = \{[^}]*'label'/.test(html), 'no inline rows embedded');
  assert.match(html, /data-chart-data="chart-0"/);
});

// ---------------------------------------------------------------------------
// CLI behaviors: serve path resolution, dg new scaffolds, fixture copying
// ---------------------------------------------------------------------------

test('serve resolves nested paths inside the served dir and blocks traversal', async () => {
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-'));
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>root</h1>');
  fs.writeFileSync(path.join(root, 'sub', 'a.html'), '<h1>nested</h1>');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'top secret');

  // Listen on an ephemeral port (0) so parallel runs / leftover servers can
  // never collide with a shared fixed port (was an intermittent EADDRINUSE flake).
  const origLog = console.log;
  console.log = () => {};
  const server = cmdServe({ _: [root], port: 0 });
  while (!server.address()) {
    await new Promise((r) => setTimeout(r, 5));
  }
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  const get = (p) => new Promise((resolvePromise) => {
    // http.get(URL) normalizes ".." away before sending; use a raw request
    // path so the server's traversal guard is the thing under test.
    const req = http.request({ host: 'localhost', port, path: p, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolvePromise({ status: res.statusCode, body }));
    });
    req.on('error', rejectOnce);
    req.end();
    function rejectOnce(e) { console.log = origLog; reject(e); }
  });
  await new Promise((r) => setTimeout(r, 150));
  try {
    const ok = await get('/');
    const nested = await get('/sub/a.html');
    const dir = await get('/sub');
    const dirSlash = await get('/sub/');
    const escape = await get('/../secret.txt');
    const encoded = await get('/%E0%A4%A');
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body, '<h1>root</h1>');
    assert.strictEqual(nested.status, 200);
    assert.strictEqual(nested.body, '<h1>nested</h1>');
    assert.strictEqual(dir.status, 404, 'request resolving to a directory is 404');
    assert.strictEqual(dir.body, 'not found');
    assert.strictEqual(dirSlash.status, 404, 'directory request with trailing slash is 404');
    assert.strictEqual(escape.status, 403, 'path traversal blocked');
    assert.strictEqual(encoded.status, 400, 'malformed encoding rejected');
  } finally {
    server.close();
    console.log = origLog;
  }
});

test('serve blocks percent-encoded traversal and sibling-prefix escapes', async () => {
  // Beyond the literal ".." raw-path guard, percent-encoding must not smuggle
  // a traversal through: "%2e%2e" (both dots encoded) trips the raw-path check,
  // while a mixed form that survives it (literal dots, slash encoded as "%2f")
  // must still be caught by the path.resolve prefix guard after decoding. And
  // that prefix guard must be exact (dir + path.sep): a sibling directory that
  // merely shares the root's name prefix must stay unreachable, not leak.
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-enc-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>root</h1>');
  const sibling = root + 'x'; // shares the root's name prefix
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(path.join(sibling, 'leak.txt'), 'sibling secret');

  const origLog = console.log;
  console.log = () => {};
  const server = cmdServe({ _: [root], port: 0 });
  while (!server.address()) {
    await new Promise((r) => setTimeout(r, 5));
  }
  const port = server.address().port;
  const get = (p) => new Promise((resolvePromise) => {
    const req = http.request({ host: 'localhost', port, path: p, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolvePromise({ status: res.statusCode, body }));
    });
    req.on('error', rejectOnce);
    req.end();
    function rejectOnce(e) { console.log = origLog; reject(e); }
  });
  await new Promise((r) => setTimeout(r, 150));
  try {
    // both dots percent-encoded -> raw-path %2e%2e guard (lowercase and uppercase)
    assert.strictEqual((await get('/%2e%2e/leak.txt')).status, 403);
    assert.strictEqual((await get('/%2E%2E/leak.txt')).status, 403);
    // every component encoded -> raw %2e%2e guard
    assert.strictEqual((await get('/%2e%2e%2fsecret.txt')).status, 403);
    // slash encoded with literal dots -> survives the raw check; the decoded
    // path.resolve prefix guard must still reject the escape
    assert.strictEqual((await get('/..%2fsecret.txt')).status, 403);
    // sibling dir sharing the root's name prefix: reachable only if the guard
    // wrongly used startsWith(dir) instead of startsWith(dir + path.sep)
    const sib = await get('/..%2f' + path.basename(sibling) + '%2fleak.txt');
    assert.strictEqual(sib.status, 403, 'sibling-prefix dir is not served');
    assert.ok(!sib.body.includes('sibling secret'), 'no sibling content leaks');
    // the served tree itself still works after the guard spam
    const ok = await get('/');
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body, '<h1>root</h1>');
  } finally {
    server.close();
    console.log = origLog;
    fs.rmSync(sibling, { recursive: true, force: true });
  }
});

test('serve answers 404 for missing files and sets content types by extension', async () => {
  // The static-file path past the traversal/encoding guards: an absent file
  // must be a 404 with text/plain (a build hint), while served files carry a
  // per-extension Content-Type (.html/.json/.csv/.js/.css/.png/.svg) and
  // unknown extensions fall back to application/octet-stream. None of these
  // paths were pinned before.
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-mime-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>root</h1>');
  fs.writeFileSync(path.join(root, 'a.json'), '[]');
  fs.writeFileSync(path.join(root, 'a.csv'), 'x,y');
  fs.writeFileSync(path.join(root, 'a.xyz'), 'raw');
  fs.writeFileSync(path.join(root, 'a.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, 'a.css'), 'body{}');
  fs.writeFileSync(path.join(root, 'a.png'), 'png');
  fs.writeFileSync(path.join(root, 'a.svg'), '<svg/>');

  const origLog = console.log;
  console.log = () => {};
  const server = cmdServe({ _: [root], port: 0 });
  while (!server.address()) {
    await new Promise((r) => setTimeout(r, 5));
  }
  const port = server.address().port;
  const get = (p) => new Promise((resolvePromise) => {
    const req = http.request({ host: 'localhost', port, path: p, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () =>
        resolvePromise({ status: res.statusCode, body, type: res.headers['content-type'] }));
    });
    req.on('error', rejectOnce);
    req.end();
    function rejectOnce(e) { console.log = origLog; reject(e); }
  });
  await new Promise((r) => setTimeout(r, 150));
  try {
    const html = await get('/');
    const json = await get('/a.json');
    const csv = await get('/a.csv');
    const raw = await get('/a.xyz');
    const js = await get('/a.js');
    const css = await get('/a.css');
    const png = await get('/a.png');
    const svg = await get('/a.svg');
    const miss = await get('/nope.html');
    assert.strictEqual(html.status, 200);
    assert.strictEqual(html.type, 'text/html; charset=utf-8');
    assert.strictEqual(json.status, 200);
    assert.strictEqual(json.type, 'application/json');
    assert.strictEqual(csv.status, 200);
    assert.strictEqual(csv.type, 'text/plain; charset=utf-8');
    assert.strictEqual(raw.status, 200);
    assert.strictEqual(raw.type, 'application/octet-stream', 'unknown extension falls back');
    assert.strictEqual(js.status, 200);
    assert.strictEqual(js.type, 'text/javascript; charset=utf-8');
    assert.strictEqual(css.status, 200);
    assert.strictEqual(css.type, 'text/css; charset=utf-8');
    assert.strictEqual(png.status, 200);
    assert.strictEqual(png.type, 'image/png');
    assert.strictEqual(svg.status, 200);
    assert.strictEqual(svg.type, 'image/svg+xml');
    assert.strictEqual(miss.status, 404, 'missing file is 404');
    assert.strictEqual(miss.type, 'text/plain');
    assert.strictEqual(miss.body, 'not found');
  } finally {
    server.close();
    console.log = origLog;
  }
});

test('serve rejects an invalid port with a clean error, not a raw listen() stack', () => {
  // A non-numeric or out-of-range port (--port abc, --port 70000, PORT=abc)
  // previously crashed with a raw ERR_SOCKET_BAD_PORT stack from server.listen.
  // It must fail with a clean diagnostic and no server started — the same error
  // style the other guard paths use.
  const { cmdServe } = require('../lib/cli');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-port-bad-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>port</h1>');
  const origPort = process.env.PORT;

  const origExit = process.exitCode;
  const origWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = (s) => { stderr += String(s); return true; };
  try {
    // --port abc is NaN -> rejected
    const a = cmdServe({ _: [root], port: 'abc' });
    assert.strictEqual(a, null, 'no server started for a NaN port');
    assert.match(stderr, /\[dashboard-gen\] Invalid port "abc"/, 'clean diagnostic reports the bad value');
    assert.ok(!/ERR_SOCKET_BAD_PORT|\s+at /.test(stderr), 'no raw listen() stack leaks out');
    assert.strictEqual(process.exitCode, 1, 'failing exit code set');

    stderr = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    // out-of-range port -> rejected
    const b = cmdServe({ _: [root], port: '70000' });
    assert.strictEqual(b, null, 'no server started for an out-of-range port');
    assert.match(stderr, /\[dashboard-gen\] Invalid port "70000"/);

    stderr = '';
    process.exitCode = origExit === undefined ? 0 : origExit;
    // PORT env with a bad value -> rejected the same way
    process.env.PORT = 'not-a-port';
    const c = cmdServe({ _: [root] });
    assert.strictEqual(c, null, 'no server started for a bad PORT env');
    assert.match(stderr, /\[dashboard-gen\] Invalid port "not-a-port"/);

    // a valid port still serves after the rejections
    delete process.env.PORT;
    const ok = cmdServe({ _: [root], port: 0 });
    assert.ok(ok && ok.close, 'valid port starts a server');
    ok.close();
  } finally {
    process.stderr.write = origWrite;
    if (origPort === undefined) delete process.env.PORT;
    else process.env.PORT = origPort;
    process.exitCode = origExit === undefined ? 0 : origExit;
  }
});

test('serve prints a clean diagnostic, not a stack, when the port is occupied', async () => {
  // server.listen fires an async unhandled 'error' event (EADDRINUSE) that
  // bypasses the dispatch try/catch; without an explicit error listener dg serve
  // on a busy port crashed with a raw "node:events:497 throw er" stack dump.
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-busy-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>busy</h1>');

  // Occupy a real port first so cmdServe's listen cannot bind it.
  const blocker = http.createServer((req, res) => { res.end('occupied'); });
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const usedPort = blocker.address().port;

  const origExit = process.exitCode;
  const origPort = process.env.PORT;
  const origWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = (s) => { stderr += String(s); return true; };
  try {
    const server = cmdServe({ _: [root], port: usedPort });
    // The EADDRINUSE 'error' event fires asynchronously from server.listen;
    // a second listener here both awaits that emission and proves the event is
    // handled (a listener is what prevents the uncaught-exception crash).
    await new Promise((resolve) => server.on('error', resolve));
    assert.match(stderr, /\[dashboard-gen\] Port \d+ already in use\./, 'clean diagnostic reports the busy port');
    assert.ok(!/^\s*at /m.test(stderr), 'no raw listen() stack leaks out');
    assert.strictEqual(process.exitCode, 1, 'failing exit code set');
  } finally {
    process.stderr.write = origWrite;
    if (origPort === undefined) delete process.env.PORT;
    else process.env.PORT = origPort;
    process.exitCode = origExit === undefined ? 0 : origExit;
    blocker.close();
  }
});

test('serve does not crash when a file disappears after the stat, just truncates that response', async () => {
  // createReadStream spills an open/read failure (file removed or unreadable
  // between fs.stat and the open) as an async 'error' event. With no listener
  // that is an uncaught exception: raw "node:events:N throw er" stack dump and
  // the whole serve process dies (same async class as the EADDRINUSE listen
  // failure). The served process must survive and other requests keep working.
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const { PassThrough } = require('node:stream');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-strm-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>ok</h1>');
  fs.writeFileSync(path.join(root, 'gone.html'), '<h1>gone</h1>');

  const origCS = fs.createReadStream;
  fs.createReadStream = (p, ...args) => {
    if (String(p).endsWith('gone.html')) {
      const s = new PassThrough();
      setImmediate(() => s.emit('error', { code: 'ENOENT' }));
      return s;
    }
    return origCS(p, ...args);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let server;
  try {
    server = cmdServe({ _: [root], port: 0 });
    while (!server.address()) await wait(5);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    assert.strictEqual((await fetch(`${base}/index.html`)).status, 200, 'normal file still serves');
    await fetch(`${base}/gone.html`).catch(() => {});
    await wait(25);
    // The process must NOT have crashed: a follow-up request still succeeds.
    assert.strictEqual((await fetch(`${base}/index.html`)).status, 200, 'serve survives a mid-stream file error');
  } finally {
    fs.createReadStream = origCS;
    if (server) server.close();
  }
});

test('serve rejects path traversal with 403 and still serves normal and dot-prefixed files', async () => {
  // The serve handler guards against escaping the served tree two ways: a raw
  // request that contains a ".." segment (or the %2e%2e percent-encoding) is
  // rejected before any URL normalization, and the decoded path must resolve
  // inside the served dir. Global fetch() normalizes ".." away before sending,
  // so these hit the raw-path regex via http.request, which sends the path
  // verbatim. A dot-prefixed basename like "..nope.html" must NOT be caught by
  // the ".." regex (it requires a following slash or end-of-path).
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-trav-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>ok</h1>');
  fs.writeFileSync(path.join(root, 'secret.html'), '<h1>secret</h1>');
  fs.writeFileSync(path.join(root, '..nope.html'), '<h1>dot-prefixed</h1>');

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let server;
  try {
    server = cmdServe({ _: [root], port: 0 });
    while (!server.address()) await wait(5);
    const port = server.address().port;
    const status = (hitPath) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: hitPath }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(await status('/index.html'), 200, 'normal file still serves');
    assert.strictEqual(await status('/../secret.html'), 403, 'raw .. segment rejected');
    assert.strictEqual(await status('/..%2fsecret.html'), 403, 'mixed .. + encoded slash rejected');
    assert.strictEqual(await status('/%2e%2e/secret.html'), 403, 'percent-encoded .. rejected');
    assert.strictEqual(await status('/%2e%2e%2fsecret.html'), 403, 'fully encoded ../ rejected');
    assert.strictEqual(await status('/..nope.html'), 200, 'dot-prefixed basename is not traversal');
  } finally {
    if (server) server.close();
  }
});

test('serve prints a clean diagnostic for a non-EADDRINUSE listen failure (e.g. EACCES)', async () => {
  // Beyond the occupied-port case, server.listen can also fail with other
  // errors - e.g. EACCES binding a privileged port as a non-root user. Both
  // land in the same async 'error' channel; the handler's else branch must
  // still surface the clean one-line diagnostic instead of a raw stack.
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-eacces-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>eacces</h1>');

  // Force the listen call itself to fail with EACCES deterministically (a real
  // privileged-port bind needs root, which the test must not assume).
  const origListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (...args) {
    process.nextTick(() => this.emit('error', { code: 'EACCES' }));
    return this;
  };

  const origExit = process.exitCode;
  const origPort = process.env.PORT;
  const origWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = (s) => { stderr += String(s); return true; };
  try {
    const server = cmdServe({ _: [root], port: 0 });
    await new Promise((resolve) => server.on('error', resolve));
    assert.match(stderr, /\[dashboard-gen\] Could not start server \(EACCES\)/, 'clean diagnostic names the errno');
    assert.ok(!/^\s*at /m.test(stderr), 'no raw listen() stack leaks out');
    assert.strictEqual(process.exitCode, 1, 'failing exit code set');
  } finally {
    process.stderr.write = origWrite;
    http.Server.prototype.listen = origListen;
    if (origPort === undefined) delete process.env.PORT;
    else process.env.PORT = origPort;
    process.exitCode = origExit === undefined ? 0 : origExit;
  }
});

test('serve picks the port from PORT env, the --port flag, or 4173', () => {
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-port-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>port</h1>');

  const origLog = console.log;
  console.log = () => {}; // silence "serving ..." banner
  const origListen = http.Server.prototype.listen;
  const origPort = process.env.PORT;
  const ports = [];
  // Record the port cmdServe passes to listen(), then bind an ephemeral port
  // instead so the assertions never collide with a real fixed port.
  http.Server.prototype.listen = function (port) {
    ports.push(port);
    return origListen.call(this, 0);
  };
  try {
    const a = cmdServe({ _: [root] });
    assert.strictEqual(ports[0], 4173, 'defaults to the documented 4173');
    a.close();

    process.env.PORT = '0';
    const b = cmdServe({ _: [root] });
    assert.strictEqual(ports[1], 0, 'PORT env overrides the default');
    b.close();

    process.env.PORT = '0';
    const c = cmdServe({ _: [root], port: '41730' });
    assert.strictEqual(ports[2], 0, 'PORT env wins over the --port flag');
    c.close();

    delete process.env.PORT;
    const d = cmdServe({ _: [root], port: '0' });
    assert.strictEqual(ports[3], 0, '--port flag applies without PORT env');
    d.close();
  } finally {
    console.log = origLog;
    http.Server.prototype.listen = origListen;
    if (origPort === undefined) delete process.env.PORT;
    else process.env.PORT = origPort;
  }
});

test('dg serve with a missing dir fails with an error', () => {
  // README CLI: "dg serve [dir]" serves dist/ (or dir). An absent dir must
  // fail fast with a build-first hint, not start a broken server.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-missing-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);

  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origLog = console.log;
  const origExit = process.exitCode;
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  console.log = () => {};
  try {
    cli(['serve']);
    assert.match(errMsg, /Serve dir missing: .*\. Build first \(dg build\)\./);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 when serve dir is missing');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    console.log = origLog;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg new with an unknown template fails and scaffolds nothing', () => {
  // README CLI: templates are landing|table|chart|dashboard|fetch. An unknown
  // --template must be rejected without creating a directory.
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-unknown-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);

  const origErr = console.error;
  const origExit = process.exitCode;
  let errMsg = '';
  console.error = (s) => { errMsg += String(s); };
  try {
    cli(['new', 'bogus-proj', '--template=bogus']);
    assert.match(errMsg, /Unknown template "bogus"\. Choose from: landing, table, chart, dashboard, fetch/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on unknown template');
    assert.ok(!fs.existsSync(path.join(cwd, 'bogus-proj')), 'no directory scaffolded');
  } finally {
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg new with a bare --template/-t flag (no value) fails cleanly', () => {
  // parseArgs treats a trailing flag with no value as boolean true. A bare
  // `--template` or `-t` therefore must not silently pick a default template:
  // cmdNew rejects the boolean as an unknown template and scaffolds nothing.
  const { cli } = require('../lib/cli');
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-bareflag-'));
  const origCwd = process.cwd();
  process.chdir(cwd);

  const origErr = console.error;
  const origExit = process.exitCode;
  let errMsg = '';
  console.error = (s) => { errMsg += String(s); };
  try {
    cli(['new', 'bareproj', '--template']);
    cli(['new', 'bareproj2', '-t']);
    assert.strictEqual(
      (errMsg.match(/Unknown template "true"/g) || []).length,
      2,
      'one rejection per bare template flag'
    );
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on a bare template flag');
    assert.ok(!fs.existsSync(path.join(cwd, 'bareproj')), 'no directory for bare --template');
    assert.ok(!fs.existsSync(path.join(cwd, 'bareproj2')), 'no directory for bare -t');
  } finally {
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg new refuses to overwrite an existing directory', () => {
  // `dg new <name>` must not clobber a directory that is already there (the
  // name may hold real work); it fails with a hint and leaves every file alone.
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-exist-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);
  fs.mkdirSync(path.join(cwd, 'taken'));
  fs.writeFileSync(path.join(cwd, 'taken', 'keep.txt'), 'do not touch');

  const origErr = console.error;
  const origExit = process.exitCode;
  let errMsg = '';
  console.error = (s) => { errMsg += String(s); };
  try {
    cli(['new', 'taken']);
    assert.match(errMsg, /Directory "taken" already exists\./);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 when the dir exists');
    assert.strictEqual(fs.readFileSync(path.join(cwd, 'taken', 'keep.txt'), 'utf8'), 'do not touch', 'existing contents untouched');
    assert.ok(!fs.existsSync(path.join(cwd, 'taken', 'dg.dsl.yaml')), 'no scaffold files written');
    assert.ok(!fs.existsSync(path.join(cwd, 'taken', 'package.json')), 'no package.json injected');
  } finally {
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg new refuses a project path squatted by a file with a clean error', () => {
  // `dg new block/site` where "block" is a plain file would make the recursive
  // mkdir throw a raw ENOTDIR stack; the CLI must surface a clean one-line
  // diagnostic (matching the build output-directory guard) with exit code 1
  // and must not leave a partially scaffolded project behind.
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-squat-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);
  fs.writeFileSync(path.join(cwd, 'block'), 'a file');
  fs.mkdirSync(path.join(cwd, 'ndir'), { recursive: true });

  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  try {
    cli(['new', 'block/site']);
    assert.match(errMsg, /Project path is a file, not a directory: block/);
    assert.ok(!errMsg.includes('ENOTDIR'), 'no raw ENOTDIR stack leaks through');
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on a file-squatted path');
    assert.ok(!fs.existsSync(path.join(cwd, 'block', 'site')), 'no scaffold written under the file');
    assert.ok(!fs.existsSync(path.join(cwd, 'block', 'dg.dsl.yaml')), 'no dg.dsl.yaml leaked');

    // A legitimate nested path (all ancestors are directories) must not trip
    // the guard: the walk passes and the scaffold lands as usual.
    errMsg = '';
    process.exitCode = 0;
    cli(['new', 'ndir/sub']);
    assert.strictEqual(process.exitCode, 0, 'nested dir scaffolding still succeeds');
    assert.ok(!errMsg, 'no error output for a directory-backed nested path');
    assert.ok(fs.existsSync(path.join(cwd, 'ndir', 'sub', 'dg.dsl.yaml')), 'nested scaffold written');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg new fails cleanly when the project dir cannot be written instead of a raw fs stack', () => {
  // cmdNew writes with bare fs calls; a chmod-000 parent dir would make the
  // recursive mkdir throw a raw EACCES stack that errorOut's else branch would
  // leak verbatim. The write block must convert filesystem errors into the
  // clean one-line diagnostic style (matching the build output-write guard)
  // and must not leave a partially scaffolded project behind.
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-unwritable-'));
  const blocked = path.join(cwd, 'blocked');
  fs.mkdirSync(blocked);
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);
  fs.chmodSync(blocked, 0o000);

  const origWrite = process.stderr.write;
  const origErr = console.error;
  const origExit = process.exitCode;
  let errMsg = '';
  process.stderr.write = (s) => { errMsg += String(s); return true; };
  console.error = (s) => { errMsg += String(s); };
  try {
    cli(['new', 'blocked/site']);
    assert.match(errMsg, /Could not create project \(EACCES\): blocked\/site/);
    assert.ok(!/^\s*at /m.test(errMsg), 'no raw EACCES stack trace leaks through');
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on an unwritable project path');
    assert.ok(!fs.existsSync(path.join(blocked, 'site')), 'no scaffold written under the blocked dir');
  } finally {
    process.stderr.write = origWrite;
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    fs.chmodSync(blocked, 0o755);
    process.chdir(origCwd);
  }
});

test('unknown CLI command fails with an error', () => {
  // The dispatch default prints an unknown-command error plus help text.
  const { cli } = require('../lib/cli');
  const origErr = console.error;
  const origOut = console.log;
  const origExit = process.exitCode;
  let msg = '';
  let out = '';
  console.error = (s) => { msg += String(s); };
  console.log = (s) => { out += String(s); };
  try {
    cli(['frobnicate']);
    assert.match(msg, /Unknown command "frobnicate"\./);
    assert.match(out, /Usage:/, 'help text printed');
    assert.strictEqual(process.exitCode, 1, 'exit code 1 on unknown command');
  } finally {
    console.error = origErr;
    console.log = origOut;
    process.exitCode = origExit === undefined ? 0 : origExit;
  }
});

test('bare cli and -h/--help/help all print usage without failing', () => {
  // README CLI: `dg` with no arguments (and the -h / --help / help spellings)
  // must print the usage block and not touch the exit code. The help text is
  // also the place users first learn the four commands and the offline output,
  // so the core commands and the single-file guarantee are pinned verbatim.
  const { cli } = require('../lib/cli');
  const origOut = console.log;
  const origExit = process.exitCode;
  const captures = [];
  for (const argv of [[], ['help'], ['--help'], ['-h']]) {
    let out = '';
    console.log = (s) => { out += String(s); };
    try {
      cli(argv);
    } finally {
      console.log = origOut;
    }
    captures.push({ argv, out });
  }
  try {
    for (const { argv, out } of captures) {
      assert.match(out, /^dashboard-gen — declarative YAML\/JSON -> static single-file page/, `help header for ${JSON.stringify(argv)}`);
      assert.match(out, /dg new <name>/, `new command listed for ${JSON.stringify(argv)}`);
      assert.match(out, /dg build \[src\]/, `build command listed for ${JSON.stringify(argv)}`);
      assert.match(out, /dg watch \[src\]/, `watch command listed for ${JSON.stringify(argv)}`);
      assert.match(out, /dg serve \[dir\]/, `serve command listed for ${JSON.stringify(argv)}`);
      assert.match(out, /--template=<t>/, `template flag documented for ${JSON.stringify(argv)}`);
      assert.match(out, /dist\/<name>\.html\s+single self-contained page \(no CDN, offline-openable\)/, `offline guarantee stated for ${JSON.stringify(argv)}`);
    }
    assert.strictEqual(process.exitCode, 0, 'no exit code set by help paths');
  } finally {
    process.exitCode = origExit === undefined ? 0 : origExit;
  }
});

test('bin/dg entry point dispatches help and build as a subprocess', () => {
  // The packaged CLI is the "dg" bin (package.json / README: `npx dg build`).
  // The unit tests call cli() directly; the bin shim itself must still resolve
  // to lib/cli and exit with a clean code on both the help path and a real
  // build, so its wiring is pinned through the actual entry file.
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const binDg = path.join(__dirname, '..', 'bin', 'dg');

  const help = execFileSync(process.execPath, [binDg, '--help'], { encoding: 'utf8' });
  assert.match(help, /^dashboard-gen — declarative YAML\/JSON -> static single-file page/, 'help prints usage header');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-bin-'));
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), 'title: from-bin\nsections: []\n');
  const stdout = execFileSync(process.execPath, [binDg, 'build', 'dg.dsl.yaml'], {
    cwd: tmp,
    encoding: 'utf8',
  });
  assert.match(stdout, /built dist\/site\.html/, 'bin build reports the output file');
  assert.ok(fs.existsSync(path.join(tmp, 'dist', 'site.html')), 'bin build writes the page');
  const html = fs.readFileSync(path.join(tmp, 'dist', 'site.html'), 'utf8');
  assert.match(html, /from-bin/, 'bin build renders the DSL title');

  assert.throws(
    () => execFileSync(process.execPath, [binDg, 'build'], { cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'dg-bin-empty-')), encoding: 'utf8' }),
    (err) => err.status === 1,
    'bin build with no DSL source exits 1'
  );
});

test('dg new scaffolds a README runbook that names the template', () => {
  // A scaffolded repo ships only dg.dsl.yaml + package.json + a Pages workflow;
  // the README completes it with the build/serve/edit/deploy loop so a visitor
  // does not need the dashboard-gen docs to run the project.
  const os = require('node:os');
  const { cmdNew } = require('../lib/cli');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-readme-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['rd'], template: 'chart' });
    const readme = fs.readFileSync(path.join(cwd, 'rd', 'README.md'), 'utf8');
    assert.match(readme, /# rd-site/, 'title derives from the project name');
    assert.match(readme, /chart template/, 'names the scaffolded template');
    assert.match(readme, /npm run build/, 'documents the build command');
    assert.match(readme, /dg\.dsl\.yaml/, 'points at the DSL as the source of truth');
    assert.match(readme, /pages\.yml/, 'points at the Pages workflow for deploy');
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new -t fetch scaffolds a project with fixture, workflow, and deps', () => {
  const { cmdNew } = require('../lib/cli');
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['demo'], t: 'fetch' });
    assert.ok(fs.existsSync(path.join(cwd, 'demo', 'dg.dsl.yaml')));
    assert.ok(fs.existsSync(path.join(cwd, 'demo', 'market.json')), 'fetch fixture copied');
    assert.ok(fs.existsSync(path.join(cwd, 'demo', '.github', 'workflows', 'pages.yml')));
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'demo', 'package.json'), 'utf8'));
    assert.match(pkg.scripts.build, /dg build dg\.dsl\.yaml --check/, 'build lints for a11y');
    assert.match(pkg.scripts.build, /dist\/site\.html/);
    assert.ok(pkg.dependencies && pkg.dependencies['dashboard-gen'], 'scaffold depends on dashboard-gen');
    const action = fs.readFileSync(path.join(cwd, 'demo', '.github', 'workflows', 'pages.yml'), 'utf8');
    assert.match(action, /npm install/);
    assert.match(action, /npm run build/);
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new defaults to the landing template and the scaffold builds', () => {
  const { cmdNew, cmdBuild } = require('../lib/cli');
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-landing-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['lan'] }); // no --template => landing
    const dslPath = path.join(cwd, 'lan', 'dg.dsl.yaml');
    assert.ok(fs.existsSync(dslPath), 'landing DSL scaffolded');
    const dsl = fs.readFileSync(dslPath, 'utf8');
    assert.match(dsl, /layout:\s+landing/);
    assert.doesNotMatch(
      dsl,
      /fetch:/,
      'landing template binds no runtime fetch fixture'
    );
    assert.ok(!fs.existsSync(path.join(cwd, 'lan', 'market.json')), 'no fetch fixture for landing');
    assert.ok(fs.existsSync(path.join(cwd, 'lan', '.github', 'workflows', 'pages.yml')));
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'lan', 'package.json'), 'utf8'));
    assert.match(pkg.scripts.build, /dg build dg\.dsl\.yaml/);
    assert.match(pkg.scripts.serve, /dg serve/);
    assert.ok(pkg.dependencies && pkg.dependencies['dashboard-gen']);

    // The scaffolded page must build and render the landing layout. A DSL
    // file named dg.dsl.yaml builds to dist/site.html.
    cmdBuild({ _: [dslPath] });
    const html = fs.readFileSync(path.join(cwd, 'dist', 'site.html'), 'utf8');
    assert.match(html, /<section class="dg-section">/, 'landing renders stacked sections');
    assert.match(html, /Your data, shipped in one YAML file/, 'hero headline rendered');
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new with no name scaffolds into the default "site" dir', () => {
  // `dg new` without a name argument resolves to the "site" project directory,
  // matching the documented default output dist/site.html for dg.dsl.yaml.
  const os = require('node:os');
  const { cmdNew } = require('../lib/cli');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-nodefault-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: [] });
    const dslPath = path.join(cwd, 'site', 'dg.dsl.yaml');
    assert.ok(fs.existsSync(dslPath), 'default "site" project scaffolded');
    const pkgName = JSON.parse(fs.readFileSync(path.join(cwd, 'site', 'package.json'), 'utf8')).name;
    assert.strictEqual(pkgName, 'site-site', 'package name derives from the default site name');
    assert.ok(fs.existsSync(path.join(cwd, 'site', '.github', 'workflows', 'pages.yml')));
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new scaffolds a deployable GitHub Pages workflow for any template', () => {
  // SPEC AC #6: the generated project must be deployable to GitHub Pages, so
  // cmdNew writes a pages.yml that (1) runs build+deploy on push to main or
  // master and via manual dispatch, (2) grants Pages write + id-token
  // permissions, (3) uploads the dist/ artifact and deploys it with the Pages
  // actions, and (4) names the deployment environment so the Pages URL echoes
  // back. The npm install/build steps alone are not enough to publish.
  const { cmdNew } = require('../lib/cli');
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-pages-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['site'], template: 'fetch' });
    const action = fs.readFileSync(path.join(cwd, 'site', '.github', 'workflows', 'pages.yml'), 'utf8');
    // Triggers: push to main/master and manual dispatch.
    assert.match(action, /on:\n\s+push:\n\s+branches: \[main, master\]/);
    assert.match(action, /workflow_dispatch:/, 'manual dispatch available');
    // Harden the deploy job's permissions.
    assert.match(action, /permissions:\n\s+contents: read\n\s+pages: write\n\s+id-token: write/);
    assert.match(action, /concurrency:\n\s+group: pages\n\s+cancel-in-progress: true/);
    // The build + Pages upload/deploy actions, with node 22 and the dist/ dir
    // as the artifact path.
    assert.match(action, /uses: actions\/configure-pages@v5/);
    assert.match(action, /uses: actions\/upload-pages-artifact@v3[\s\S]*path: dist/);
    assert.match(action, /uses: actions\/deploy-pages@v4/);
    assert.match(action, /setup-node@v4[\s\S]*node-version: 22/);
    assert.match(action, /npm install/);
    assert.match(action, /npm run build/);
    // The deployment environment exposes the published Pages URL.
    assert.match(action, /environment:\n\s+name: github-pages[\s\S]*steps\.deployment\.outputs\.page_url/);
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new strips a .yaml extension from the project name', () => {
  // `dg new site.yaml` must scaffold into "site/" (not a "site.yaml/" dir with
  // a dot in its name): cmdNew strips the last extension before resolving the
  // output directory and derives the package name from the cleaned name.
  const os = require('node:os');
  const { cmdNew } = require('../lib/cli');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-ext-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['site.yaml'] });
    assert.ok(fs.existsSync(path.join(cwd, 'site', 'dg.dsl.yaml')), 'scaffold lands in the stripped-name dir');
    assert.ok(!fs.existsSync(path.join(cwd, 'site.yaml')), 'no dotted directory is created');
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'site', 'package.json'), 'utf8'));
    assert.strictEqual(pkg.name, 'site-site', 'package name comes from the stripped name');
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new --template=<t> is accepted', () => {
  const { cmdNew } = require('../lib/cli');
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new2-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['demo2'], template: 'table' });
    assert.ok(fs.existsSync(path.join(cwd, 'demo2', 'dg.dsl.yaml')));
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new accepts the space-separated --template flag through cli dispatch', () => {
  // README/help show `dg new --template=<t>`; the arg parser must also handle
  // `--template <t>` (space form) so `dg new site --template chart` works as
  // typed. This exercises parseArgs + cmdNew, not just cmdNew with a preset map.
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new3-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cli(['new', 'chartsite', '--template', 'chart']);
    const dsl = fs.readFileSync(path.join(cwd, 'chartsite', 'dg.dsl.yaml'), 'utf8');
    assert.match(dsl, /type: chart/, 'chart template scaffolded via --template <t>');
    assert.match(dsl, /kind: line/, 'chart DSL content present');
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new accepts the short -t template flag through cli dispatch', () => {
  // `-t <template>` is the short form the arg parser accepts alongside
  // --template. The existing -t test calls cmdNew directly with a preset map,
  // so the parseArgs value branch (a starts-with-dash short flag followed by a
  // non-dash value) has no coverage through cli() dispatch.
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new5-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);
  const origExit = process.exitCode;
  try {
    cli(['new', 'shortsite', '-t', 'chart']);
    assert.strictEqual(process.exitCode, origExit === undefined ? 0 : origExit, 'no exit code set');
    const dsl = fs.readFileSync(path.join(cwd, 'shortsite', 'dg.dsl.yaml'), 'utf8');
    assert.match(dsl, /kind: line/, 'chart template scaffolded via -t chart');
    assert.ok(fs.existsSync(path.join(cwd, 'shortsite', '.github', 'workflows', 'pages.yml')), 'workflow included');
  } finally {
    process.chdir(origCwd);
    process.exitCode = origExit === undefined ? 0 : origExit;
  }
});

test('dg new applies the chart template distinctly from landing', () => {
  // Sanity: the chart template ships chart components rather than the landing
  // hero, so the --template flag selects real, distinct content per template.
  const os = require('node:os');
  const { cmdNew } = require('../lib/cli');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new4-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['chartonly'], template: 'chart' });
    const dsl = fs.readFileSync(path.join(cwd, 'chartonly', 'dg.dsl.yaml'), 'utf8');
    assert.match(dsl, /kind: line/);
    assert.doesNotMatch(dsl, /Your data, shipped in one YAML file/, 'not the landing hero');
  } finally {
    process.chdir(origCwd);
  }
});

test('dg new table/dashboard/fetch templates ship distinct content', () => {
  // Every template must scaffold content true to its purpose, not the landing
  // hero. table -> table rows, dashboard -> sidebar nav, fetch -> runtime
  // fetch fixture (also copied into the project).
  const os = require('node:os');
  const { cmdNew } = require('../lib/cli');
  const cases = [
    { template: 'table', proj: 'tblproj', marker: /caption: Current deployment status per service/ },
    { template: 'dashboard', proj: 'dashproj', marker: /layout: sidebar/ },
    { template: 'fetch', proj: 'fproj', marker: /fetch: market\.json/ },
  ];
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-templates-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    for (const { template, proj, marker } of cases) {
      cmdNew({ _: [proj], template });
      const dslPath = path.join(cwd, proj, 'dg.dsl.yaml');
      assert.ok(fs.existsSync(dslPath), `${template} project scaffolded`);
      const dsl = fs.readFileSync(dslPath, 'utf8');
      assert.match(dsl, marker, `${template} has its template marker`);
      assert.doesNotMatch(dsl, /Your data, shipped in one YAML file/, `${template} is not the landing hero`);
    }
    // fetch template binds a local fixture that must be copied alongside
    assert.ok(fs.existsSync(path.join(cwd, 'fproj', 'market.json')), 'fetch fixture copied into the project');
  } finally {
    process.chdir(origCwd);
  }
});

test('build copies nested local fetch fixtures next to the output', () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-copy-'));
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        data: { fetch: "data/market.json" }',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'data', 'market.json'), '[]');

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['dg.dsl.yaml'] });
    assert.ok(fs.existsSync(path.join(tmp, 'dist', 'site.html')), 'page built');
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'data', 'market.json')),
      'nested fixture mirrored into dist/data'
    );
  } finally {
    process.chdir(origCwd);
  }
});

test('build resolves self:// fixtures as local relative paths', () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-self-'));
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        data: { fetch: "self://data/market.json" }',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'data', 'market.json'), '[]');

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['dg.dsl.yaml'] });
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'data', 'market.json')),
      'self:// fixture mirrored into dist/data'
    );
    const html = fs.readFileSync(path.join(tmp, 'dist', 'site.html'), 'utf8');
    assert.match(
      html,
      /"url":"data\/market\.json"/,
      'built page fetches the mirrored relative path, not a self: URL'
    );
    assert.ok(!html.includes('fetch("self:'), 'runtime manifest carries no self: URLs');
  } finally {
    process.chdir(origCwd);
  }
});

test('build copies flat fixtures, mirrors fixture directories, and skips absolute URLs', () => {
  // cmdBuild's copyLocalFixtures has three branches the earlier fixture tests
  // did not pin: a flat URL (no "/") copies next to the page root, a fixture
  // that is a directory is mirrored recursively, and an absolute http(s) URL
  // fetches at runtime (nothing is copied).
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-fixture-kinds-'));
  fs.mkdirSync(path.join(tmp, 'data', 'nested'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'deep'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        title: A',
    '        data: { fetch: "data/market.json" }',
    '      - type: chart',
    '        kind: line',
    '        title: B',
    '        data: { fetch: "https://api.example.com/remote.json" }',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'data', 'market.json'), '[]');
  fs.writeFileSync(path.join(tmp, 'deep', 'a.bin'), 'x');
  fs.writeFileSync(path.join(tmp, 'deep', 'b.csv'), 'y');
  // A directory fixture mirror: "deep/" maps to dist/deep with contents.
  fs.writeFileSync(path.join(tmp, 'dg-extra.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        title: C',
    '        data: { fetch: "deep/" }',
    '',
  ].join('\n'));

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['dg.dsl.yaml'] });
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'data', 'market.json')),
      'nested fixture mirrored'
    );

    cmdBuild({ _: ['dg-extra.yaml'], output: 'dir.yaml' }); // exercises dir copy
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'deep', 'a.bin')),
      'directory fixture contents copied recursively'
    );
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'deep', 'b.csv')),
      'second directory fixture file copied'
    );

    const html = fs.readFileSync(path.join(tmp, 'dist', 'site.html'), 'utf8');
    assert.ok(
      html.includes('"https://api.example.com/remote.json"'),
      'absolute URL kept in the runtime manifest'
    );
    assert.ok(!fs.existsSync(path.join(tmp, 'dist', 'remote.json')), 'no remote fixture copied');
    assert.ok(
      html.includes('"data/market.json"'),
      'relative URL embedded in the runtime manifest'
    );
  } finally {
    process.chdir(origCwd);
  }
});

test('build copies a flat root-level fetch fixture next to the page', () => {
  // The flat branch of copyLocalFixtures (a fetch URL with no path separator)
  // was the only fixture kind not pinned: it copies the file next to the page
  // root instead of mirroring a subpath or recursing a directory. A "./"-prefixed
  // relative URL must land flat too (the prefix is stripped before matching).
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-flat-'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        title: A',
    '        data: { fetch: "market.json" }',
    '      - type: chart',
    '        kind: line',
    '        title: B',
    '        data: { fetch: "./rates.json" }',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'market.json'), '[]');
  fs.writeFileSync(path.join(tmp, 'rates.json'), '[]');

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['dg.dsl.yaml'] });
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'market.json')),
      'flat fixture copied to the page root'
    );
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'rates.json')),
      '"./"-prefixed flat fixture copied to the page root'
    );
    assert.ok(
      !fs.existsSync(path.join(tmp, 'dist', 'market', 'market.json')),
      'no spurious subdirectory created for a flat URL'
    );
    const html = fs.readFileSync(path.join(tmp, 'dist', 'site.html'), 'utf8');
    assert.match(
      html,
      /"url":"market\.json"|"market\.json"/,
      'flat URL kept in the runtime manifest'
    );
  } finally {
    process.chdir(origCwd);
  }
});

test('build skips a fetch fixture that does not exist on disk, keeping its URL', () => {
  // copyLocalFixtures quietly skips relative fixture paths that are absent —
  // the built page still carries the URL in the runtime manifest (the browser
  // deciding to 404 at fetch time is a runtime concern, not a build failure).
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-fixture-missing-'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        title: A',
    '        data: { fetch: "data/missing.json" }',
    '',
  ].join('\n'));

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['dg.dsl.yaml'] });
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'site.html')),
      'build still succeeds with a missing fixture'
    );
    assert.ok(
      !fs.existsSync(path.join(tmp, 'dist', 'data', 'missing.json')),
      'absent fixture is not copied (no spurious dir/file created)'
    );
    const html = fs.readFileSync(path.join(tmp, 'dist', 'site.html'), 'utf8');
    assert.match(
      html,
      /"url":"data\/missing\.json"/,
      'URL kept in the runtime manifest for the browser to resolve'
    );
  } finally {
    process.chdir(origCwd);
  }
});

test('build mirrors a fixture directory containing nested subdirectories', () => {
  // copyDirRecursive recurses into subdirectories of a fixture URL that points
  // at a directory; a nested folder must be recreated relative to the output
  // root rather than flattened or dropped.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-fixture-nested-'));
  fs.mkdirSync(path.join(tmp, 'assets', 'icons'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'assets', 'logo.svg'), '<svg/>');
  fs.writeFileSync(path.join(tmp, 'assets', 'icons', 'ok.png'), 'x');
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        title: A',
    '        data: { fetch: "assets/" }',
    '',
  ].join('\n'));

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['dg.dsl.yaml'] });
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'assets', 'logo.svg')),
      'top-level fixture file copied'
    );
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'assets', 'icons', 'ok.png')),
      'nested subdirectory mirrored with its file'
    );
  } finally {
    process.chdir(origCwd);
  }
});

test('fixture-copy walk skips null section entries past which fixtures still copy', () => {
  // copyLocalFixtures walks the doc with collectFetchSpecs (render.js), whose
  // visit() guard skips null / non-object entries before recursing. A null
  // section (validated only as an array, pinned by the render-path test) must
  // not crash the CLI fixture copy; a sibling section's fetch fixture must
  // still be copied next to the output.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-fixture-null-'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'market.json'), '[]');
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - null',
    '  - content:',
    '      - type: chart',
    '        kind: line',
    '        title: A',
    '        data: { fetch: "market.json" }',
    '',
  ].join('\n'));

  const { cmdBuild } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cmdBuild({ _: ['dg.dsl.yaml'] });
    assert.ok(
      fs.existsSync(path.join(tmp, 'dist', 'market.json')),
      'fixture copied despite a null section entry before it'
    );
    const html = fs.readFileSync(path.join(tmp, 'dist', 'site.html'), 'utf8');
    assert.ok(
      html.includes('"url":"market.json"'),
      'runtime fetch after the null section kept its manifest URL'
    );
  } finally {
    process.chdir(origCwd);
  }
});

// ---------------------------------------------------------------------------
// dg build --check lints the built page with the shared a11y checks and fails
// the build (exit 1) when a hard invariant is violated
// ---------------------------------------------------------------------------

test('dg build --check passes on a compliant page and leaves exit code 0', () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-check-ok-'));
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'sections:',
    '  - title: S',
    '    content:',
    '      - type: paragraph',
    '        text: hi',
    '',
  ].join('\n'));

  const { cli } = require('../lib/cli');
  const origExit = process.exitCode;
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cli(['build', 'dg.dsl.yaml', '--check']);
    assert.ok(fs.existsSync(path.join(tmp, 'dist', 'site.html')), 'page built');
    assert.strictEqual(process.exitCode, origExit === undefined ? 0 : origExit, 'no failure exit code set');
  } finally {
    process.chdir(origCwd);
    process.exitCode = origExit === undefined ? 0 : origExit;
  }
});

test('dg build --check fails with exit code 1 when the page violates a11y invariants', () => {
  // A compliant page that only violates contrast (AA 4.5:1) must still be
  // written to dist, but --check must fail the build with a diagnostic.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-check-bad-'));
  fs.writeFileSync(path.join(tmp, 'dg.dsl.yaml'), [
    'title: t',
    'theme:',
    '  pageBg: "#ffffff"',
    '  textColor: "#f5f5f5"',
    'sections:',
    '  - title: S',
    '    content:',
    '      - type: paragraph',
    '        text: hi',
    '',
  ].join('\n'));

  const { cli } = require('../lib/cli');
  const origExit = process.exitCode;
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    cli(['build', 'dg.dsl.yaml', '--check']);
    assert.ok(fs.existsSync(path.join(tmp, 'dist', 'site.html')), 'page still written before the check fails');
    assert.strictEqual(process.exitCode, 1, 'failing a11y check sets exit code 1');
  } finally {
    process.chdir(origCwd);
    process.exitCode = origExit === undefined ? 0 : origExit;
  }
});

// ---------------------------------------------------------------------------
// Watch rebuilds on bound data changes (chart file: bindings + local fetch
// fixtures live outside the DSL and are edited independently of it)
// ---------------------------------------------------------------------------

test('watch rebuilds when a chart file-binding data file changes', async () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-data-'));
  const src = path.join(tmp, 'site.yaml');
  const dataFile = path.join(tmp, 'data.json');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(dataFile, '[["Jan",5],["Feb",10]]\n');
  fs.writeFileSync(src, [
    'title: DataPage',
    'sections:',
    '  - title: Metrics',
    '    content:',
    '      - type: chart',
    '        kind: line',
    '        title: R',
    '        file: data.json',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    await new Promise((r) => setTimeout(r, 250)); // initial build
    fs.writeFileSync(dataFile, '[["Jan",5],["Feb",99]]\n');
    let rebuilt = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.readFileSync(out, 'utf8').includes('99')) { rebuilt = true; break; }
    }
    assert.ok(rebuilt, 'watch rebuilt when the bound data file changed');
  } finally {
    if (watcher) watcher.close();
    process.chdir(origCwd);
  }
});

test('watch rebuilds when a local fetch fixture changes', async () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-fetch-'));
  const src = path.join(tmp, 'site.yaml');
  const fixture = path.join(tmp, 'market.json');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(fixture, '[[1],[2]]\n');
  fs.writeFileSync(src, [
    'title: FetchPage',
    'sections:',
    '  - title: M',
    '    content:',
    '      - type: chart',
    '        kind: line',
    '        title: R',
    '        data: { fetch: "market.json" }',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    await new Promise((r) => setTimeout(r, 250)); // initial build
    // The fixture is copied next to the output by the build; rewriting the
    // source fixture must re-copy it and rebuild the manifest.
    fs.writeFileSync(fixture, '[[1],[7]]\n');
    let rebuilt = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.readFileSync(path.join(tmp, 'dist', 'market.json'), 'utf8').includes('7')) {
        rebuilt = true;
        break;
      }
    }
    assert.ok(rebuilt, 'watch re-copied and rebuilt when the local fixture changed');
    assert.ok(
      fs.readFileSync(out, 'utf8').includes('market.json'),
      'the rebuilt page still carries the fetch manifest URL'
    );
  } finally {
    if (watcher) watcher.close();
    process.chdir(origCwd);
  }
});

test('watch stays live when a data-file rebuild fails, then rebuilds on the fix', async () => {
  // A change to a bound data file that breaks the build (here invalid JSON)
  // must surface the same clean DataFileError diagnostic as a one-shot build —
  // never a raw stack — and the watcher must keep watching. In particular the
  // data-ref watchers from the successful initial build must NOT be torn down by
  // the failed rebuild (the failure path never runs watchDataRefs' cleanup, which
  // would close the very watcher needed to notice the file being fixed).
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-dfail-'));
  const src = path.join(tmp, 'site.yaml');
  const dataFile = path.join(tmp, 'data.json');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(dataFile, '[["Jan",5],["Feb",10]]\n');
  fs.writeFileSync(src, [
    'title: DataPage',
    'sections:',
    '  - title: Metrics',
    '    content:',
    '      - type: chart',
    '        kind: line',
    '        title: R',
    '        file: data.json',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  let stderr = '';
  const origWrite = process.stderr.write;
  process.stderr.write = (s) => { stderr += String(s); return true; };
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    const waitFor = async (fn, tries = 25) => {
      for (let i = 0; i < tries; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (fn()) return true;
      }
      return false;
    };
    await waitFor(() => fs.existsSync(out) && fs.readFileSync(out, 'utf8').includes('Jan'));

    // Corrupt the bound file: the rebuild fails with the clean diagnostic.
    stderr = '';
    fs.writeFileSync(dataFile, 'not json at all\n');
    const failed = await waitFor(() => stderr.includes('is not valid JSON'));
    assert.ok(failed, 'failed rebuild reported the data-file error');
    // The clean diagnostic may carry the dashboard-style location anchor
    // ("\n  at: page.sections..."), but a raw v8 stack traces indents its frames
    // with four spaces — that must never leak out of the failed rebuild.
    assert.ok(!/\n {4}at /.test(stderr), 'no raw stack trace leaks out of the failed rebuild');

    // Fix the file: the SAME watcher must still be alive and rebuild it.
    stderr = '';
    fs.writeFileSync(dataFile, '[["Jan",5],["Feb",99]]\n');
    const recovered = await waitFor(() => {
      if (!fs.existsSync(out)) return false;
      const html = fs.readFileSync(out, 'utf8');
      return html.includes('99');
    });
    assert.ok(recovered, 'watcher survived the failed rebuild and rebuilt on the fix');
  } finally {
    process.stderr.write = origWrite;
    if (watcher) watcher.close();
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('watch drops a data-file watcher when the DSL stops binding that file', async () => {
  // watchDataRefs rebinds data watchers after every successful build and closes
  // watchers for refs the current DSL no longer references. A stale watcher must
  // not keep firing '(data)' rebuilds for an unbound file (a leak that would
  // rebuild the page when an editor touches an unrelated row file), while the
  // DSL source watcher itself must stay live.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-drop-'));
  const src = path.join(tmp, 'site.yaml');
  const dataFile = path.join(tmp, 'data.json');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(dataFile, '[["Jan",5],["Feb",10]]\n');
  fs.writeFileSync(src, [
    'title: DataPage',
    'sections:',
    '  - title: Metrics',
    '    content:',
    '      - type: chart',
    '        kind: line',
    '        title: R',
    '        file: data.json',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  const origExit = process.exitCode;
  let stdout = '';
  const origOutWrite = process.stdout.write;
  // Tee, don't swallow (same reason as the sibling tests above).
  process.stdout.write = (s) => { stdout += String(s); return origOutWrite.call(process.stdout, s); };
  process.chdir(tmp);
  let watcher;
  const waitFor = async (fn, tries = 25) => {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fn()) return true;
    }
    return false;
  };
  try {
    watcher = watch(path.resolve('site.yaml'));
    const dataBuilds = () => (stdout.match(/built site\.html \(data\)/g) || []).length;
    const watchBuilds = () => (stdout.match(/built site\.html \(watch\)/g) || []).length;

    // The binding is alive: editing the bound data file rebuilds the page.
    await waitFor(() => stdout.includes('built site.html'));
    const dataBefore = dataBuilds();
    fs.writeFileSync(dataFile, '[["Jan",5],["Feb",99]]\n');
    const dataBound = await waitFor(() => dataBuilds() > dataBefore);
    assert.ok(dataBound, 'the bound data file triggers a rebuild');

    // Drop the binding: the '(watch)' rebuild also runs watchDataRefs, which
    // synchronously closes the now-stale data-file watcher.
    fs.writeFileSync(src, [
      'title: DataPage',
      'sections:',
      '  - title: Text',
      '    content:',
      '      - type: paragraph',
      '        text: no chart anymore',
      '',
    ].join('\n'));
    const dropped = await waitFor(() => watchBuilds() >= 1 && !fs.readFileSync(out, 'utf8').includes('data-chart-data='));
    assert.ok(dropped, 'the DSL edit rebuilt the page without the chart');

    // The stale watcher is gone: touching the unbound data file must not produce
    // a '(data)' rebuild within the polling window.
    const dataAfterDrop = dataBuilds();
    fs.writeFileSync(dataFile, '[["Mar",1]]\n');
    const leaked = await waitFor(() => dataBuilds() > dataAfterDrop);
    assert.ok(!leaked, 'no rebuild for a data file the DSL no longer binds');

    // False-pass guard: the source watcher is still live, so a later DSL edit
    // triggers a normal rebuild.
    const watchAfterDrop = watchBuilds();
    fs.writeFileSync(src, 'title: DataPage\nsections:\n  - title: Text\n    content:\n      - type: paragraph\n        text: still watching\n');
    const stillLive = await waitFor(() => watchBuilds() > watchAfterDrop);
    assert.ok(stillLive, 'the source watcher stayed live after dropping the binding');
  } finally {
    process.stdout.write = origOutWrite;
    if (watcher) watcher.close();
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('watch follows an absolute-path chart file binding', async () => {
  // collectLocalDataRefs adds an absolute `file:` path as-is (no fileDir join),
  // and watchDataFile watches that absolute path's parent dir. So a data file
  // living outside the DSL directory must still rebuild the page on edit —
  // distinct from the relative-binding watch tests.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-watch-abs-'));
  const dataDir = path.join(tmp, 'elsewhere');
  fs.mkdirSync(dataDir, { recursive: true });
  const absData = path.join(dataDir, 'rows.json');
  const src = path.join(tmp, 'site.yaml');
  const out = path.join(tmp, 'dist', 'site.html');
  fs.writeFileSync(absData, '[["Jan",5],["Feb",10]]\n');
  fs.writeFileSync(src, [
    'title: AbsData',
    'sections:',
    '  - title: Metrics',
    '    content:',
    '      - type: chart',
    '        kind: line',
    '        title: R',
    '        file: ' + JSON.stringify(absData),
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });

  const { watch } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(tmp);
  let watcher;
  try {
    watcher = watch(path.resolve('site.yaml'));
    await new Promise((r) => setTimeout(r, 250)); // initial build
    fs.writeFileSync(absData, '[["Jan",5],["Feb",77]]\n');
    let rebuilt = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.readFileSync(out, 'utf8').includes('77')) { rebuilt = true; break; }
    }
    assert.ok(rebuilt, 'watch rebuilt when the absolute-path data file changed');
  } finally {
    if (watcher) watcher.close();
    process.chdir(origCwd);
  }
});

test('collectLocalDataRefs resolves an absolute file binding as-is without fileDir', () => {
  // With no fileDir option, a relative `file:` path joins against '.' (staying
  // a cwd-relative ref, mirroring loadDataFile), while an absolute binding is
  // used as-is — so the watch ref set stays consistent with what the build
  // actually reads even when no fileDir is supplied.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-refs-nofiledir-'));
  const absFile = path.join(tmp, 'abs.json');
  fs.writeFileSync(absFile, '[["Feb",7]]\n');

  const { collectLocalDataRefs } = require('../lib/render');
  const origCwd = process.cwd();
  process.chdir(tmp);
  try {
    const refs = collectLocalDataRefs({
      title: 't',
      sections: [
        { content: [{ type: 'chart', kind: 'line', file: 'data.json' }] },
        { content: [{ type: 'chart', kind: 'line', file: absFile }] },
      ],
    });
    assert.deepStrictEqual([...refs].sort(), ['data.json', absFile].sort(),
      'relative binding stays cwd-relative, absolute binding used as-is');
  } finally {
    process.chdir(origCwd);
  }
});

test('collectLocalDataRefs guards a missing sections key and null section entries', () => {
  // The watch-path collector walks (doc.sections || []) with null-entry skips,
  // mirroring the render pass guards. A doc that omits `sections` entirely, or
  // one with a null section (YAML "- "), must yield the same ref set instead of
  // crashing on iterating undefined / reading a property of null.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-refs-guards-'));
  const absFile = path.join(tmp, 'abs.json');
  fs.writeFileSync(absFile, '[["Mar",3]]\n');

  const { collectLocalDataRefs } = require('../lib/render');

  assert.deepStrictEqual(collectLocalDataRefs({ title: 't' }), [],
    'missing sections key walks an empty list');
  assert.deepStrictEqual(
    collectLocalDataRefs({
      title: 't',
      sections: [
        null,
        { content: [{ type: 'chart', kind: 'line', file: absFile }] },
      ],
    }),
    [absFile],
    'null section skipped, surviving binding still collected'
  );
});

test('collectLocalDataRefs falls back when a doc has no sections key', () => {
  // Isolates the (sections || []) fallback in the watch collector: a hero-only
  // doc has no sections key, and the walker must still collect the hero's file
  // binding without throwing on undefined sections. The empty sections list
  // simply contributes nothing extra.
  const { collectLocalDataRefs } = require('../lib/render');
  assert.deepStrictEqual(
    collectLocalDataRefs({ title: 't', hero: [{ type: 'chart', kind: 'line', file: 'nope.csv' }] }),
    ['nope.csv'],
    'hero walk runs, missing sections key contributes no extra refs'
  );
});

test('collectLocalDataRefs resolves fetch bindings relative to fileDir and skips missing fixtures', () => {
  // The watch collector resolves a relative fetch fixture against fileDir and
  // only keeps refs that exist on disk (the same existence check decides which
  // absolute http(s) URLs are excluded as non-local). A relative spec with no
  // fileDir falls back to ".", and a fixture that does not exist there is left
  // out of the watch set entirely.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-refs-fetch-'));
  const present = path.join(tmp, 'present.json');
  fs.writeFileSync(present, '[["Mar",3]]\n');

  const { collectLocalDataRefs } = require('../lib/render');

  assert.deepStrictEqual(
    collectLocalDataRefs(
      { title: 't', sections: [{ content: [
        { type: 'chart', kind: 'line', data: { fetch: 'present.json' } },
        { type: 'chart', kind: 'line', data: { fetch: 'missing.json' } },
      ] }] },
      tmp
    ),
    [present],
    'present fixture is watched, missing fixture is skipped'
  );

  assert.deepStrictEqual(
    collectLocalDataRefs({ title: 't', sections: [{ content: [
      { type: 'chart', kind: 'line', data: { fetch: 'nope.json' } },
    ] }] }),
    [],
    'no fileDir falls back to cwd and a fixture absent there is skipped'
  );

  assert.deepStrictEqual(
    collectLocalDataRefs({ title: 't', sections: [{ content: [
      { type: 'chart', kind: 'line', data: { fetch: present } },
    ] }] }),
    [present],
    'an absolute fetch fixture is used as-is, independent of fileDir'
  );
});

test('collectLocalDataRefs recurses through nested non-chart components', () => {
  // The walker descends through arbitrary intermediate objects before reaching a
  // chart: here a grid holds an item that holds the chart, so ref collection
  // must survive the nested-object recursion instead of only visiting top-level
  // content. The grid itself is skipped from the ref set (no file/data), only
  // the innermost binding is collected.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-refs-nested-'));
  const dataFile = path.join(tmp, 'nested.json');
  fs.writeFileSync(dataFile, '[["Apr",4]]\n');

  const { collectLocalDataRefs } = require('../lib/render');

  assert.deepStrictEqual(
    collectLocalDataRefs(
      {
        title: 't',
        sections: [{
          content: [
            { type: 'grid', items: [
              { type: 'chart', kind: 'line', file: dataFile },
            ] },
          ],
        }],
      },
      tmp
    ),
    [dataFile],
    'nested chart binding is collected through the grid/items recursion'
  );
});

test('collectLocalDataRefs skips non-object comps and rejects an empty file binding', () => {
  // The walker's guard at the top of visit() treats primitives as leaves, so a
  // stray string in a slot that normally holds components cannot crash the
  // watch scan. A chart with an empty file binding is the one input the walker
  // rejects outright: the render pass throws the same DataFileError, and the
  // watch path must not silently drop the bound file from the ref set.
  const { collectLocalDataRefs } = require('../lib/render');
  const { DataFileError } = require('../lib/errors');
  assert.deepStrictEqual(
    collectLocalDataRefs({ title: 't', hero: 'plain-text-string' }),
    [],
    'non-object comps are leaves and contribute no refs'
  );

  assert.throws(
    () => collectLocalDataRefs({ title: 't', sections: [{ content: [
      { type: 'chart', kind: 'line', file: '' },
    ] }] }),
    (err) => err instanceof DataFileError && /non-empty path/.test(err.message),
    'empty file binding is rejected with the same DataFileError as rendering'
  );
});

// ---------------------------------------------------------------------------
// Component coverage: paragraph, grid, quote, divider
// ---------------------------------------------------------------------------

test('paragraph component renders plain text and inline-link forms', () => {
  const html = renderHtml({
    title: 't',
    sections: [
      {
        content: [
          { type: 'paragraph', text: 'Plain body copy.' },
          { type: 'paragraph', text: 'Read more at', href: 'https://docs.example.com', newtab: true },
          { type: 'paragraph', text: 'About', link: { href: '/about', newtab: false } },
          { type: 'paragraph' },
        ],
      },
    ],
  });
  assert.match(html, /<p class="dg-paragraph">Plain body copy\.<\/p>/);
  assert.match(html, /<p class="dg-paragraph">Read more at <a href="https:\/\/docs\.example\.com" class="dg-link" target="_blank" rel="noopener">/);
  assert.match(html, /<p class="dg-paragraph">About <a href="\/about" class="dg-link">\/about<\/a><\/p>/);
  assert.match(html, /<p class="dg-paragraph"><\/p>/);
});

test('grid component honors columns and columnWidth inline styles', () => {
  const html = renderHtml({
    title: 't',
    hero: [
      {
        type: 'grid',
        columns: 2,
        items: [
          { title: 'A', text: 'bee', intent: 'success' },
          { type: 'card', title: 'C', text: 'dee', intent: 'primary' },
          { title: 'E', text: 'eff' },
          'just text',
        ],
      },
    ],
  });
  assert.match(html, /class="dg-grid" style="grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);" data-grid-cols="2"/);
  assert.match(html, /<div class="dg-cell"><div class="dg-card dg-card--success"><h3 class="dg-card-title">A<\/h3>bee<\/div><\/div>/);
  assert.match(html, /<div class="dg-cell"><div class="dg-card dg-card--primary"><h3 class="dg-card-title">C<\/h3>dee<\/div><\/div>/);
  assert.match(html, /<div class="dg-cell"><div class="dg-card"><h3 class="dg-card-title">E<\/h3>eff<\/div><\/div>/);
  assert.match(html, /<div class="dg-cell">just text<\/div>/);
});

test('headline null text renders an empty heading body', () => {
  // normalizeText maps null/undefined to '' so a headline with an explicit
  // null text still renders a well-formed heading instead of "null".
  const html = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'headline', level: 2, text: null }] }],
  });
  assert.match(html, /<h2 class="dg-headline dg-h2"><\/h2>/);
});

test('list maps null items to empty cells instead of "null" text', () => {
  // items pass through normalizeText (null/undefined -> ''), so a sparse
  // items list renders empty cells, not the literal word "null".
  const html = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'list', items: ['a', null, 'b'] }] }],
  });
  assert.match(html, /<ul class="dg-ul"><li>a<\/li><li><\/li><li>b<\/li><\/ul>/);
});

test('table object rows keep scalar rows as repeated raw cells', () => {
  // Object-row tables align to the union-of-keys header; a scalar row (not an
  // object) cannot be keyed, so each cell repeats the raw scalar value rather
  // than crashing or dropping the row.
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'table', rows: [{ name: 'api', v: 2 }, 'scalar-row'] }],
    }],
  });
  assert.match(
    html,
    /<tbody><tr><td>api<\/td><td>2<\/td><\/tr><tr><td>scalar-row<\/td><td>scalar-row<\/td><\/tr><\/tbody>/,
    'scalar row repeats its value across the union columns'
  );
});

test('grid component defaults to auto-fill with a columnWidth minimum', () => {
  const html = renderHtml({
    title: 't',
    sections: [
      {
        content: [
          {
            type: 'grid',
            columnWidth: 180,
            items: [{ title: 'X', text: 'y', intent: 'danger' }],
          },
        ],
      },
    ],
  });
  assert.match(html, /style="grid-template-columns: repeat\(auto-fill, minmax\(180px, 1fr\)\);" data-grid-cols="3"/);
});

test('quote component renders text with optional cite footer', () => {
  const html = renderHtml({
    title: 't',
    sections: [
      {
        content: [
          { type: 'quote', text: 'Ship early, ship often.' },
          { type: 'quote', text: 'Measure twice.', cite: 'Operations Handbook' },
          { type: 'quote' },
        ],
      },
    ],
  });
  assert.match(html, /<blockquote class="dg-quote"><p>Ship early, ship often\.<\/p><\/blockquote>/);
  assert.match(html, /<blockquote class="dg-quote"><p>Measure twice\.<\/p><footer class="dg-quote-cite">— Operations Handbook<\/footer><\/blockquote>/);
  assert.match(html, /<blockquote class="dg-quote"><p><\/p><\/blockquote>/, 'missing text renders an empty quote body');
});

test('divider component emits a horizontal rule', () => {
  const html = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'divider' }] }],
  });
  assert.match(html, /<hr class="dg-divider">/);
});

test('table header:false treats numeric first rows as body data', () => {
  // rowsToTableData auto-detects a header for array-of-arrays only when the
  // first row is strings; `header: false` must also suppress the header for
  // numeric rows (which the string heuristic would not touch).
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'table', header: false, rows: [[2026, 42], [2025, 38]] }],
    }],
  });
  assert.match(html, /<table class="dg-table"><tbody><tr><th scope="row">2026<\/th><td>42<\/td><\/tr><tr><th scope="row">2025<\/th><td>38<\/td><\/tr><\/tbody><\/table>/);
  assert.ok(!html.includes('<thead>'), 'no header row is emitted');
});

test('table numeric first row is body data by default, header:true forces it', () => {
  // A label+value row like [2026, 42] or ["Q1", 10] is data: without a `header`
  // key the first row must not be promoted to <thead>. `header: true` still
  // forces the first row to be the header.
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'table', rows: [[2026, 42], [2025, 38]] }],
    }],
  });
  assert.match(
    html,
    /<table class="dg-table"><tbody><tr><th scope="row">2026<\/th><td>42<\/td><\/tr><tr><th scope="row">2025<\/th><td>38<\/td><\/tr><\/tbody><\/table>/,
    'numeric first row stays in the body as a row header'
  );
  assert.ok(!html.includes('<thead>'), 'no auto header for a numeric first row');

  const forced = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'table', header: true, rows: [[2026, 42], [2025, 38]] }],
    }],
  });
  assert.match(
    forced,
    /<thead><tr><th scope="col">2026<\/th><th scope="col">42<\/th><\/tr><\/thead><tbody><tr><td>2025<\/td><td>38<\/td><\/tr><\/tbody>/,
    'header: true forces the first row into the header'
  );
});

// ---------------------------------------------------------------------------
// Fetch URL validation (lib/loader.js validateFetchUrl + render fetch binding)
// ---------------------------------------------------------------------------

test('chart data.fetch rejects malformed and unsupported URLs', () => {
  const chart = (fetch) => ({
    title: 't',
    sections: [{ content: [{ type: 'chart', kind: 'line', data: { fetch } }] }],
  });
  // Looks like a URL but the URL constructor rejects it.
  assert.throws(
    () => renderHtml(chart('http://')),
    (err) =>
      err.name === 'FetchSpecError' &&
      /Invalid fetch URL/.test(err.message) &&
      err.path === 'data.fetch'
  );
  // A scheme other than http(s) / self is not fetchable in-browser.
  assert.throws(
    () => renderHtml(chart('ftp://cdn.example.com/data.json')),
    (err) =>
      err.name === 'FetchSpecError' &&
      /Fetch URL scheme "ftp" not supported/.test(err.message) &&
      err.path === 'data.fetch'
  );
  // fetch() requires a real hostname; localhost would resolve in dev only.
  assert.throws(
    () => renderHtml(chart('http://localhost/data.json')),
    (err) =>
      err.name === 'FetchSpecError' &&
      /Fetch URL must include a valid hostname/.test(err.message) &&
      err.path === 'data.fetch'
  );
  // self: must name a fixture path; an empty path normalizes to "" and would
  // bind the fixture source directory itself (copying the whole tree at build).
  assert.throws(
    () => renderHtml(chart('self://')),
    (err) =>
      err.name === 'FetchSpecError' &&
      /"self:" must name a fixture path/.test(err.message) &&
      err.path === 'data.fetch'
  );
});

test('non-string data.fetch raises StyleError at the chart data path', () => {
  assert.throws(
    () =>
      renderHtml({
        title: 't',
        sections: [{ content: [{ type: 'chart', kind: 'line', data: { fetch: 42 } }] }],
      }),
    (err) =>
      err.name === 'StyleError' &&
      /data\.fetch must be a string URL/.test(err.message) &&
      err.path === 'page.sections[0].content.data.fetch'
  );
});

test('non-mapping top-level DSL and non-string layout raise StyleError', () => {
  assert.throws(
    () => renderHtml([{ title: 'x' }]),
    (err) =>
      err.name === 'StyleError' &&
      /Top-level DSL must be a mapping/.test(err.message) &&
      err.path === '.'
  );
  assert.throws(
    () => renderHtml({ title: 'x', layout: 7, sections: [] }),
    (err) =>
      err.name === 'StyleError' &&
      /"layout" must be a string/.test(err.message) &&
      err.path === 'page.layout'
  );
});

test('table object rows render union-of-keys header and cells', () => {
  // rowsToTableData falls back to object rows: the header is the union of the
  // objects keys in first-seen order, and each row aligns to that order.
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [{
        type: 'table',
        rows: [{ name: 'api', v: 2 }, { name: 'auth', v: 1 }],
      }],
    }],
  });
  assert.match(
    html,
    /<thead><tr><th scope="col">name<\/th><th scope="col">v<\/th><\/tr><\/thead><tbody><tr><td>api<\/td><td>2<\/td><\/tr><tr><td>auth<\/td><td>1<\/td><\/tr><\/tbody>/,
    'object rows produce a union header and aligned cells'
  );
});

test('empty or absent table rows render a no-data note instead of a hollow table', () => {
  // An empty rows list has no header and no body, so a bare <table> with an
  // empty <tbody> (or nothing at all) would be an invisible hollow element.
  // Match the chart runtime: emit the no-data note only.
  for (const rows of [[], undefined]) {
    const html = renderHtml({
      title: 't',
      sections: [{ content: [{ type: 'table', rows }] }],
    });
    assert.match(
      html,
      /<p class="dg-note">No data to draw\.<\/p>/,
      `empty table (rows=${JSON.stringify(rows)}) shows the no-data note`
    );
    assert.ok(
      !/<table class="dg-table"><tbody>/.test(html),
      `empty table (rows=${JSON.stringify(rows)}) renders no hollow table`
    );
    assert.ok(
      !/<td>/.test(html) && !/<th>/.test(html),
      `empty table (rows=${JSON.stringify(rows)}) renders no cells`
    );
  }
});

test('repo-level Pages workflow builds every example and copies landing to index.html', () => {
  // README's "GitHub Pages" section documents the repo-root workflow at
  // .github/workflows/pages.yml: it builds every examples/*.yaml into dist/
  // and copies the landing page to dist/index.html so the Pages root shows it.
  // The scaffolded-project workflow (cmdNew) is pinned elsewhere; this one —
  // which owns the actual examples/ output — is not. Pin its build contract
  // and prove the input side holds: every example DSL builds and the landing
  // example produces exactly the file the cp target expects.
  const wf = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'pages.yml'),
    'utf8'
  );
  // The build loop: iterate every example DSL and emit it into dist/.
  assert.match(wf, /mkdir -p dist/);
  assert.match(wf, /for f in examples\/\*\.yaml; do/);
  assert.match(wf, /npx dg build "\$f" --check/, 'deploys gate on a11y checks');
  // The landing page becomes the Pages root index (dg build landing.yaml ->
  // dist/landing.html, matching siteNameFrom's basename derivation).
  assert.match(wf, /cp dist\/landing\.html dist\/index\.html/);
  // The deploy chain uploads the whole dist/ dir with the Pages actions.
  assert.match(wf, /uses: actions\/configure-pages@v5/);
  assert.match(wf, /uses: actions\/upload-pages-artifact@v3[\s\S]*path: dist/);
  assert.match(wf, /uses: actions\/deploy-pages@v4/);

  // Executable half: the loop's input side must hold today. Every example
  // DSL builds through the real public pipeline (no fileDir/cwd pollution),
  // and the landing example renders the hero the workflow promotes to root.
  const yamls = fs
    .readdirSync(EXAMPLE_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort();
  assert.ok(yamls.length >= 5, 'examples dir holds the documented templates');
  for (const f of yamls) {
    const src = fs.readFileSync(path.join(EXAMPLE_DIR, f), 'utf8');
    const html = buildFromSource(src, f, { fileDir: 'examples' });
    assert.match(html, /<!DOCTYPE html>/, `${f} builds a full page`);
  }
  const landing = fs.readFileSync(path.join(EXAMPLE_DIR, 'landing.yaml'), 'utf8');
  const landingHtml = buildFromSource(landing, 'landing.yaml', { fileDir: 'examples' });
  assert.match(
    landingHtml,
    /Your data, shipped in one YAML file/,
    'landing example carries the hero text the Pages root will show'
  );
  // Name derivation: "dg build examples/landing.yaml" writes dist/landing.html
  // (siteNameFrom strips the extension), which is why the cp target is valid.
  assert.strictEqual(path.basename('landing.yaml', path.extname('landing.yaml')), 'landing');
});

test('card, badge, and grid shorthand tolerate empty text fields', () => {
  // The card `text`, badge `text`, and grid item {title, text} shorthand are
  // all optional in the DSL. A card carrying only a title, a badge with no
  // text, and a grid item with only title or only text must still render — no
  // "null" text and no empty-card crash — each falling back to an empty string.
  const html = buildFromSource(
    JSON.stringify({
      title: 't',
      sections: [
        {
          title: 'S',
          content: [
            { type: 'card', title: 'Only Title' },
            { type: 'badge', tone: 'success' },
            {
              type: 'grid',
              items: [{ title: 'THead' }, { text: 'TBody' }],
            },
          ],
        },
      ],
    }),
    'empty-text.yaml'
  );
  assert.match(
    html,
    /<div class="dg-card"><h3 class="dg-card-title">Only Title<\/h3><\/div>/,
    'card with a title but no text renders an empty body'
  );
  assert.match(
    html,
    /<span class="dg-badge dg-badge--success"><\/span>/,
    'badge with no text renders an empty badge'
  );
  assert.match(
    html,
    /<div class="dg-cell"><div class="dg-card"><h3 class="dg-card-title">THead<\/h3><\/div><\/div>/,
    'title-only grid item renders the card title and an empty body'
  );
  assert.match(html, /<div class="dg-cell"><div class="dg-card">TBody<\/div><\/div>/, 'text-only grid item');
  assert.ok(!/>null</.test(html), 'no literal "null" leaks into a rendered text node');
});

test('chart with no data and no file binds an empty store and renders the figure', () => {
  // A chart that omits both data (or a { csv } / { json } / { fetch } wrapper)
  // and file is legal — the data key still resolves so the runtime renders its
  // "No data to draw." note. The collect pass must not throw, the figure must
  // carry the resolved dataId, and with nothing bound the inline store must be
  // empty (the undefined value drops out of JSON.stringify).
  const doc = {
    title: 't',
    sections: [{ title: 'S', content: [{ type: 'chart', kind: 'line' }] }],
  };
  let html;
  assert.doesNotThrow(() => { html = renderHtml(doc); }, 'building a data-less chart does not throw');
  assert.match(
    html,
    /class="dg-figure dg-chart" data-chart-type="line" data-chart-title="Chart" data-chart-data="chart-0"/,
    'figure carries the resolved dataId from the collect pass'
  );
  assert.match(html, /window\.__DG_DATA__ = \{\};/, 'no bound data leaves an empty inline store');
  assert.ok(!/data-chart-source=/.test(html), 'no fetch source wired for a chart without data');
});

test('file binding takes precedence over an unrecognized data object', () => {
  // A chart that carries BOTH an unparseable data object ({ bogus: 1 }) and a
  // file binding must resolve through the file, not fail: the collect pass
  // treats an unrecognized data shape as absent and falls back to the file
  // (render.js line 108) before the "data must be inline rows, { csv }, ..."
  // StyleError. This keeps a file binding authoritative over a bad data field
  // while bare unrecognized data still throws (pinned separately).
  const tmp = path.join(ExampleTmp(), 'file-wins');
  const fileDir = path.join(tmp, 'fixtures');
  fs.mkdirSync(fileDir, { recursive: true });
  fs.writeFileSync(path.join(fileDir, 'data.json'), JSON.stringify([{ label: 'fw', series: { v: 3 } }]));
  const doc = {
    title: 't',
    sections: [{ title: 'S', content: [{ type: 'chart', kind: 'line', data: { bogus: 1 }, file: 'data.json' }] }],
  };
  let html;
  assert.doesNotThrow(() => { html = renderHtml(doc, { fileDir }); }, 'file wins over an unrecognized data shape');
  assert.match(
    html,
    /window\.__DG_DATA__ = \{"chart-0":\[\{"label":"fw","series":\{"v":3\}\}\]\}/,
    'the store binds the file rows'
  );
});

