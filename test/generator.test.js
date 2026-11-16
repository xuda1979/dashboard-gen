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

// ---------------------------------------------------------------------------
// Accessibility + no-external-resource (AC2/AC5 invariants on every example)
// ---------------------------------------------------------------------------

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
      ],
    }],
  });
  assert.match(html, /class="dg-stat-delta"[^>]*>▼ 8</); // neutral, arrow carries the sign
  assert.match(html, /class="dg-stat-delta dg-stat-delta--bad"[^>]*>▼ 0.5</);
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
    const escape = await get('/../secret.txt');
    const encoded = await get('/%E0%A4%A');
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body, '<h1>root</h1>');
    assert.strictEqual(nested.status, 200);
    assert.strictEqual(nested.body, '<h1>nested</h1>');
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
    assert.match(pkg.scripts.build, /dg build dg\.dsl\.yaml/);
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
        ],
      },
    ],
  });
  assert.match(html, /<blockquote class="dg-quote"><p>Ship early, ship often\.<\/p><\/blockquote>/);
  assert.match(html, /<blockquote class="dg-quote"><p>Measure twice\.<\/p><footer class="dg-quote-cite">— Operations Handbook<\/footer><\/blockquote>/);
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

