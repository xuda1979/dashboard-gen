// Execute the embedded chart runtime with a minimal DOM stub and assert that
// real SVG elements (line paths, bars, pie slices) are produced. This proves
// charts are self-implemented (no chart library) and data-bound correctly.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildFromSource } = require('../lib/build');

function extractRuntime(html) {
  const scripts = html.match(/<script>([\s\S]*?)<\/script>/g);
  const runtime = scripts && scripts.find((s) => s.includes('querySelectorAll'));
  if (!runtime) throw new Error('runtime script not found');
  return runtime.replace(/^<script>/, '').replace(/<\/script>$/, '');
}

function extractData(html) {
  const m = html.match(/window\.__DG_DATA__ = (\{[\s\S]*?\});/);
  if (!m) throw new Error('data store not found');
  return JSON.parse(m[1]);
}

// Minimal DOM: querySelectorAll returns stubs; setAttribute / innerHTML / addEventListener.
function makeDom(figures) {
  const figureEls = figures.map((attrs) => ({
    attrs: { ...attrs },
    innerHTML: '',
    getAttribute(name) { return this.attrs[name] !== undefined ? this.attrs[name] : null; },
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html || ''; },
  }));
  return {
    figureEls,
    dom: {
      readyState: 'complete',
      addEventListener() {},
      querySelectorAll() { return figureEls; },
    },
  };
}

function runRuntime(code, dom, data, opts) {
  const o = opts || {};
  const sandbox = {
    document: dom,
    console,
    fetch: o.fetch || (() => Promise.reject(new Error('no fetch in test'))),
    Promise,
    setTimeout,
    clearTimeout,
    __DG_DATA__: data,
  };
  sandbox.window = sandbox;
  sandbox.window.__DG_DATA__ = data;
  const fn = new Function('window', 'document', code);
  fn.call(sandbox.window, sandbox.window, sandbox.document);
}

// ---------------------------------------------------------------------------

test('runtime renders inline line chart into SVG', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'chart.yaml'), 'utf8');
  const html = buildFromSource(src, 'chart.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);
  const data = extractData(html);

  const figs = [
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'DAU this week' },
    { 'data-chart-type': 'bar', 'data-chart-data': 'chart-1', 'data-chart-title': 'Quarterly revenue' },
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-2', 'data-chart-title': 'Share of traffic' },
  ];
  const { dom } = makeDom(figs);

  const els = dom.querySelectorAll();
  runRuntime(extractRuntime(html), dom, data);

  assert.ok(els[0].innerHTML.includes('<svg'), 'line chart produced svg');
  assert.ok(els[0].innerHTML.includes('class="dg-svg"'), 'svg has class');
  assert.ok(els[0].innerHTML.includes('<path'), 'svg has path elements');
  assert.ok(els[0].innerHTML.includes('dg-legend-wrap'), 'legend present');
  assert.ok(els[0].innerHTML.includes('role="img"'), 'aria role set');
  assert.ok(els[0].innerHTML.includes('aria-label="DAU this week line chart"'));

  assert.ok(els[1].innerHTML.includes('<svg'), 'bar chart produced svg');
  assert.ok(els[1].innerHTML.includes('<rect'), 'bar chart has rect elements');

  assert.ok(els[2].innerHTML.includes('<svg'), 'pie chart produced svg');
  assert.ok(els[2].innerHTML.includes('class="dg-slice"'), 'pie has slice paths');
  assert.ok(els[2].innerHTML.includes('%'), 'pie shows percentages');
});

test('runtime renders multi-row pie data as slices', () => {
  // 2-column object rows ([{label,value}] shape) and array rows are both valid
  // pie inputs; the runtime must draw one slice per row, not only row 0.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: pie\n        title: Occupancy\n        data:\n          - { label: core, value: 12 }\n          - { label: edge, value: 8 }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'pie', 'data-chart-data': 'chart-0', 'data-chart-title': 'Occupancy' }]);
  runRuntime(code, dom, { 'chart-0': [{ label: 'core', value: 12 }, { label: 'edge', value: 8 }] });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('class="dg-slice"'), 'pie renders slices');
  assert.strictEqual((out.match(/class="dg-slice"/g) || []).length, 2, 'one slice per row');
  assert.ok(out.includes('core 60.0%') && out.includes('edge 40.0%'), 'slice labels show computed shares');
  assert.ok(out.includes('<svg'), 'pie produced svg');
});

test('runtime shows no-data note when chart has empty data', () => {
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: pie',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'pie', 'data-chart-data': 'chart-0', 'data-chart-title': 'Empty' }]);
  runRuntime(code, dom, {});
  assert.ok(figureEls[0].innerHTML.includes('No data to draw'), 'shows no-data note');
});

test('runtime extracts fetch specs and attempts fetch for missing data', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'fetch.yaml'), 'utf8');
  const html = buildFromSource(src, 'fetch.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);
  assert.ok(code.includes('fetch('), 'runtime performs fetch');
  assert.ok(/FETCH_BY_KEY\[s\.key\] = s\.url/.test(code), 'fetch metadata embedded');
  assert.ok(code.includes('market.json'), 'url embedded');

  // data store for fetch-only page is empty at load; runtime must call fetch
  const { dom } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Price' },
  ]);
  let fetched = null;
  const myFetch = (url) => { fetched = url; return Promise.resolve({ ok: true, json: () => Promise.resolve([]) }); };
  const sandbox = {
    document: dom,
    console,
    fetch: myFetch,
    Promise,
  };
  sandbox.window = sandbox;
  sandbox.window.__DG_DATA__ = {};
  const fn = new Function('window', 'document', 'fetch', code);
  fn.call(sandbox.window, sandbox.window, sandbox.document, myFetch);
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(fetched, 'market.json');
});
