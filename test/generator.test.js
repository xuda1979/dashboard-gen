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

// ---------------------------------------------------------------------------
// DSL validation + readable errors
// ---------------------------------------------------------------------------

test('unknown component type raises readable error', () => {
  const doc = { title: 'x', sections: [{ content: [{ type: 'nope' }] }] };
  assert.throws(
    () => renderHtml(doc),
    (err) => err.name === 'StyleError' && /Unknown component type/.test(err.message)
  );
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

test('bad YAML raises ParseError with position', () => {
  assert.throws(
    () => buildFromSource('title: [unclosed\n  sections:\n  - {', 'bad.yaml'),
    (err) => err.name === 'ParseError' && /YAML|JSON/.test(err.message)
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

function ExampleTmp() {
  const os = require('node:os');
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dg-fixture-'));
}

// ---------------------------------------------------------------------------
// fetch example
// ---------------------------------------------------------------------------

test('fetch example keeps runtime fetch specs but no inline data', () => {
  const html = buildFixture('fetch');
  assert.match(html, /market\.json/); // runtime fetch manifest
  assert.ok(!/window\.__DG_DATA__ = \{[^}]*'label'/.test(html), 'no inline rows embedded');
  assert.match(html, /data-chart-data="chart-0"/);
});
