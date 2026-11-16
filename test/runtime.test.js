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

test('runtime renders pie from [label, value] array rows', () => {
  // README: pie charts accept one row per slice, including the two-column
  // array-row form [label, value]. Each row must draw one slice using its own
  // label, with share percentages computed across all rows.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: pie\n        title: Src\n        data:\n          - [Organic, 45]\n          - [Paid, 30]\n          - [Referral, 25]',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'pie', 'data-chart-data': 'chart-0', 'data-chart-title': 'Src' }]);
  runRuntime(code, dom, { 'chart-0': [['Organic', 45], ['Paid', 30], ['Referral', 25]] });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('<svg'), 'pie produced svg');
  assert.strictEqual((out.match(/class="dg-slice"/g) || []).length, 3, 'one slice per row');
  assert.ok(out.includes('Organic 45.0%') && out.includes('Paid 30.0%') && out.includes('Referral 25.0%'), 'slice labels show computed shares');
});

test('runtime applies custom swatches to slice and legend colors', () => {
  // A swatches map on the chart component is serialized into data-chart-swatches;
  // the runtime must parse it and use the named colors for both the slice fill
  // and the legend swatch, instead of the palette hash fallback.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: pie\n        title: Share\n        swatches: { Organic: "#16a34a", Paid: "#2563eb" }\n        data:\n          - { label: Organic, value: 60 }\n          - { label: Paid, value: 40 }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-0', 'data-chart-title': 'Share', 'data-chart-swatches': '{"Organic":"#16a34a","Paid":"#2563eb"}' },
  ]);
  runRuntime(code, dom, { 'chart-0': [{ label: 'Organic', value: 60 }, { label: 'Paid', value: 40 }] });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('fill="#16a34a"'), 'slice uses the custom swatch color');
  assert.ok(out.includes('background:#2563eb'), 'legend swatch shows the custom color');
  assert.ok(!out.includes('fill="#3b82f6"') && !out.includes('fill="#f59e0b"'), 'palette fallback not used');
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

test('runtime honors numeric start as the line chart baseline', () => {
  // `start` is documented on the chart component. It was parsed into
  // data-chart-start but never applied; a numeric value must pin the y-axis
  // baseline, so the polyline position changes when it is present.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Temp\n        data:\n          - { label: Jan, series: { t: 20 } }\n          - { label: Feb, series: { t: 24 } }\n          - { label: Mar, series: { t: 28 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const data = { 'chart-0': [{ label: 'Jan', series: { t: 20 } }, { label: 'Feb', series: { t: 24 } }, { label: 'Mar', series: { t: 28 } }] };

  function ysFor(fig) {
    const { dom, figureEls } = makeDom([fig]);
    runRuntime(code, dom, data);
    const out = figureEls[0].innerHTML;
    const d = /<path class="dg-series" d="([^"]+)"/.exec(out);
    assert.ok(d, 'line chart produced a series path');
    const nums = d[1].match(/-?\d+(\.\d+)?/g).map(Number);
    return nums.filter((_, i) => i % 2 === 1);
  }

  const base = ysFor({ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Temp' });
  const anchored = ysFor({ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Temp', 'data-chart-start': '10' });
  assert.notDeepStrictEqual(anchored, base, 'numeric start re-anchors the y-axis baseline');
  // Anchoring the baseline to 10 (below the 20-28 data) widens the y range, so
  // the line sits lower on the plot than with the data-only range: y grows
  // downward in SVG.
  assert.ok(Math.max(...anchored) > Math.max(...base), 'lower baseline shifts the polyline down');
});

test('runtime scales line chart by data range, not numeric x-labels', () => {
  // Numeric x-labels (years, timestamps) used to be mistaken for a y-axis
  // anchor: min = first label set the baseline above every series value, which
  // inverted the range and flattened the polyline into the top of the plot.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Temp\n        data:\n          - label: 2023\n            series: { t: 20 }\n          - label: 2024\n            series: { t: 24 }\n          - label: 2025\n            series: { t: 28 }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Temp' }]);
  runRuntime(code, dom, { 'chart-0': [{ label: 2023, series: { t: 20 } }, { label: 2024, series: { t: 24 } }, { label: 2025, series: { t: 28 } }] });
  const out = figureEls[0].innerHTML;
  const d = /<path class="dg-series" d="([^"]+)"/.exec(out);
  assert.ok(d, 'line chart produced a series path');
  const ys = d[1].match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
  assert.strictEqual(ys.length, 3, 'one point per row');
  // Plot area is y 22..300. The data values (20..28) must produce a line that
  // spans a visible range inside it — the regression squashed it flat above the
  // plot (all ys < 22, spread ~1px).
  const spread = Math.max(...ys) - Math.min(...ys);
  assert.ok(spread > 10, `line spans the data range (y spread ${spread.toFixed(1)}px)`);
  assert.ok(Math.min(...ys) >= 22, 'polyline stays inside the plot area');
});

test('runtime renders array-of-arrays with a header row into a labelled series', () => {
  // README: inline `data:` accepts an array of arrays "optionally with a header
  // row". The embedded store keeps the raw rows (header included); the runtime
  // must strip the header, derive the series name from it, and draw one point
  // per data row.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Growth\n        data:\n          - [Month, revenue]\n          - [Jan, 10]\n          - [Feb, 14]\n          - [Mar, 18]',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Growth' }]);
  const embedded = extractData(html)['chart-0'];
  assert.deepStrictEqual(embedded, [['Month', 'revenue'], ['Jan', 10], ['Feb', 14], ['Mar', 18]], 'store keeps the header row');
  runRuntime(code, dom, { 'chart-0': embedded });
  const out = figureEls[0].innerHTML;
  const d = /<path class="dg-series" d="([^"]+)"/.exec(out);
  assert.ok(d, 'line chart produced a series path');
  const ys = d[1].match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
  assert.strictEqual(ys.length, 3, 'one point per data row, header row dropped');
  assert.ok(out.includes('revenue'), 'legend uses the header-derived series name');
  assert.ok(!out.includes('Month'), 'header label is not drawn as a data point');
});

test('runtime draws headerless multi-column array rows as auto-named series', () => {
  // README: inline `data:` accepts "an array of arrays optionally with a header
  // row". When the header row is absent, the first column is the label and each
  // remaining column becomes its own series. The runtime must derive the series
  // names (series1..N) and draw one line per column.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Trend\n        data:\n          - [Jan, 10, 5]\n          - [Feb, 14, 7]\n          - [Mar, 18, 9]',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Trend' }]);
  const embedded = extractData(html)['chart-0'];
  assert.deepStrictEqual(embedded, [['Jan', 10, 5], ['Feb', 14, 7], ['Mar', 18, 9]], 'store keeps the raw rows');
  runRuntime(code, dom, { 'chart-0': embedded });
  const out = figureEls[0].innerHTML;
  const paths = out.match(/<path class="dg-series" d="[^"]+"/g);
  assert.ok(paths, 'line chart produced series paths');
  assert.strictEqual(paths.length, 2, 'one line per data column');
  for (const p of paths) {
    const ys = p.match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
    assert.strictEqual(ys.length, 3, 'one point per row on each series');
  }
  assert.ok(out.includes('series1') && out.includes('series2'), 'legend uses auto-derived series names');
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

test('runtime draws a line chart from fetch-resolved array data', async () => {
  // init() fetches only when the store has no rows for the figure's id; on
  // success it stashes the resolved JSON in window.__DG_DATA__ and re-renders
  // with renderOne. This pins the happy path: resolved rows must draw, never
  // the no-data note and never the fetch-failure message.
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'fetch.yaml'), 'utf8');
  const html = buildFromSource(src, 'fetch.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);

  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Widget price (USD)' },
  ]);
  const rows = [
    { label: '2024-01', series: { price: 120 } },
    { label: '2024-02', series: { price: 132 } },
    { label: '2024-03', series: { price: 128 } },
  ];
  let fetched = null;
  const myFetch = (url) => { fetched = url; return Promise.resolve({ ok: true, json: () => Promise.resolve(rows) }); };
  const sandbox = {
    document: dom,
    console,
    fetch: myFetch,
    Promise,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.window.__DG_DATA__ = {};
  const fn = new Function('window', 'document', 'fetch', code);
  fn.call(sandbox.window, sandbox.window, sandbox.document, myFetch);
  await new Promise((r) => setTimeout(r, 0));

  assert.strictEqual(fetched, 'market.json', 'runtime fetches the embedded fixture url');
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('<svg'), 'fetched data produced an svg');
  assert.ok(out.includes('class="dg-series"'), 'fetched rows are drawn as a series path');
  assert.ok(out.includes('price'), 'legend uses the fetched series name');
  assert.ok(!out.includes('No data to draw'), 'chart is not left empty');
  assert.ok(!out.includes('Failed to load chart data'), 'resolved fetch shows no error');
});

test('runtime draws from a fetch response wrapped as {data: rows}', async () => {
  // Some endpoints return {data: [...]} instead of a bare array; init supports
  // both shapes when it stashes the resolved JSON. The wrapper must unwrap.
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'fetch.yaml'), 'utf8');
  const html = buildFromSource(src, 'fetch.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);

  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Widget price (USD)' },
  ]);
  const myFetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: [{ label: 'Jan', series: { price: 10 } }, { label: 'Feb', series: { price: 14 } }] }),
  });
  const sandbox = {
    document: dom,
    console,
    fetch: myFetch,
    Promise,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.window.__DG_DATA__ = {};
  const fn = new Function('window', 'document', 'fetch', code);
  fn.call(sandbox.window, sandbox.window, sandbox.document, myFetch);
  await new Promise((r) => setTimeout(r, 0));

  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('class="dg-series"'), 'wrapper rows drawn as a series path');
  assert.ok(!out.includes('No data to draw'), 'wrapper data is not treated as empty');
});

test('runtime shows a load error when a fetched chart fails', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'fetch.yaml'), 'utf8');
  const html = buildFromSource(src, 'fetch.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);

  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Price' },
  ]);
  const { window } = await (async () => {
    const w = {
      document: dom,
      console,
      fetch: () => Promise.reject(new Error('network down')),
      Promise,
      setTimeout,
      clearTimeout,
    };
    w.window = w;
    w.__DG_DATA__ = {};
    return { window: w };
  })();
  const fn = new Function('window', 'document', 'fetch', code);
  fn.call(window, window, dom, window.fetch);
  await new Promise((r) => setTimeout(r, 0));
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('Failed to load chart data'), 'fetch failure surfaces an error message');
  assert.ok(out.includes('network down'), 'error detail is incorporated');
  assert.ok(out.includes('dg-error'), 'error is marked with the dg-error class');
});

test('runtime shows a parse error when chart data is malformed', () => {
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line',
    'x.yaml'
  );
  const code = extractRuntime(html);
  // A null row makes the shape walker throw (Object.keys on null), which
  // renderOne reports as a parse failure instead of rendering garbage.
  const data = { 'chart-0': [null] };
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Broken' },
  ]);
  runRuntime(code, dom, data);
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('Chart data parse failed'), 'malformed data surfaces a parse error');
  assert.ok(out.includes('dg-error'), 'parse failure is marked with the dg-error class');
});

test('runtime renders multi-series bar chart into SVG bars', () => {
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: bar\n        title: Sales\n        data:\n          - { label: Q1, series: { a: 10, b: 5 } }\n          - { label: Q2, series: { a: 20, b: 8 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const data = {
    'chart-0': [
      { label: 'Q1', series: { a: 10, b: 5 } },
      { label: 'Q2', series: { a: 20, b: 8 } },
    ],
  };
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'bar', 'data-chart-data': 'chart-0', 'data-chart-title': 'Sales' },
  ]);
  runRuntime(code, dom, data);
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('class="dg-svg"'), 'bar chart produces an svg');
  assert.ok(out.includes(' bar chart"'), 'svg carries a "bar chart" accessible name');
  const bars = (out.match(/<rect class="dg-bar" /g) || []).length;
  assert.strictEqual(bars, 4, '2 labels x 2 series => 4 bars');
  assert.ok(out.includes('>Q1 a: 10<'), 'bar title names the label, series and value');
  assert.ok(out.includes('>Q2 b: 8<'), 'later bar carries its own title');
  // height must scale with value: value 20 is taller (smaller y, larger height)
  // than value 10 once parsed out of the rect geometry.
  const heights = out.match(/height="([\d.]+)"/g).map((s) => Number(s.match(/[\d.]+/)[0]));
  assert.ok(Math.max(...heights) > Math.min(...heights), 'bar heights differ by value');
  assert.ok(out.includes('>a</span>') && out.includes('>b</span>'), 'legend lists both series');
});
