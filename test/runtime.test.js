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

test('runtime pins the line SVG chrome: grid, axes, legend names, viewBox', () => {
  // Beyond the svg/legend/aria presence checks above, the rendering surface
  // must actually include the axis chrome: horizontal grid lines, a y-axis of
  // numeric ticks, x-axis category labels for every row, series paths with
  // per-series strokes, a legend naming each series, and the svg root carrying
  // class/viewBox/role/aria-label together.
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'chart.yaml'), 'utf8');
  const html = buildFromSource(src, 'chart.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);
  const data = extractData(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'DAU this week' },
  ]);
  runRuntime(code, dom, data);
  const out = figureEls[0].innerHTML;

  assert.ok(/<svg class="dg-svg" viewBox="0 0 \d+ \d+"/.test(out), 'svg root has class and a viewBox');
  assert.ok(out.includes('role="img"'), 'svg carries the img role');
  assert.ok(out.includes('aria-label="DAU this week line chart"'), 'aria-label composes title and kind');

  const grid = (out.match(/class="dg-grid-h"/g) || []).length;
  assert.ok(grid >= 3, `horizontal grid lines rendered (got ${grid})`);

  const yTicks = out.match(/<text class="dg-axis"(?! dg-axis-x)[^>]*>[-\d.]+<\/text>/g) || [];
  assert.ok(yTicks.length >= 3, `y-axis numeric ticks rendered (got ${yTicks.length})`);
  assert.ok(yTicks.every((t) => /[-\d.]+/.test(t)), 'y ticks are numeric values');

  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    assert.ok(out.includes(`>${day}</text>`), `x-axis label for ${day}`);
  }

  const paths = out.match(/<path class="dg-series"[^>]*stroke="#[0-9a-f]{6}"/g) || [];
  assert.ok(paths.length >= 2, `one stroked path per series (got ${paths.length})`);

  assert.ok(out.includes('>you</span>') && out.includes('>competitors</span>'),
    'legend names every series');
  assert.ok(out.includes('class="dg-legend-swatch" style="background:#'), 'legend swatches carry colors');
});

test('runtime escapes hostile chart labels instead of injecting markup', () => {
  // Hostile labels and series names land in x-axis labels, legend entries and
  // bar tooltips; the runtime must HTML-escape them so no element can break
  // out of a generated page that mixes user data and charts.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: bar\n        title: Sales\n        data:\n          - { label: Q1, series: { a: 10 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'bar', 'data-chart-data': 'chart-0', 'data-chart-title': 'Sales' },
  ]);
  runRuntime(code, dom, {
    'chart-0': [
      { label: '<b>Q1</b>', series: { 'a&b': 10 } },
      { label: 'Q2</text><script>alert(1)</script>', series: { 'a&b': 4 } },
    ],
  });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('&lt;b&gt;Q1&lt;/b&gt;'), 'x-axis label escapes tags');
  assert.ok(out.includes('Q2&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;'),
    'script-close payload stays text, never closes the text element');
  assert.ok(out.includes('a&amp;b'), 'legend escapes the ampersand in a series name');
  assert.ok(out.includes('<title>&lt;b&gt;Q1&lt;/b&gt; a&amp;b: 10</title>'),
    'bar tooltip escapes label and series name together');
  // The svg legitimately emits </text> and </title> close tags, so the negative
  // control only scans for raw hostile markers, never generic element closers.
  assert.ok(!out.includes('<b>') && !out.includes('<script') && !out.includes('</script>'),
    'no raw markup survives');
});

test('runtime compacts large y-axis ticks with k/M shorthand', () => {
  // fmt() renders ticks >= 1e3 with a k suffix and >= 1e6 with M; the line
  // chart's y-axis must surface those compacted labels so a 2.5k-value series
  // does not crowd the axis with long numbers.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Revenue\n        data:\n          - { label: Q1, series: { rev: 1500 } }\n          - { label: Q2, series: { rev: 2500 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Revenue' },
  ]);
  runRuntime(code, dom, {
    'chart-0': [
      { label: 'Q1', series: { rev: 1500 } },
      { label: 'Q2', series: { rev: 2500 } },
    ],
  });
  const out = figureEls[0].innerHTML;
  const ticks = out.match(/<text class="dg-axis"(?! dg-axis-x)[^>]*>[^<]+<\/text>/g) || [];
  assert.ok(ticks.length >= 3, `y-axis ticks rendered (got ${ticks.length})`);
  const texts = ticks.map((t) => t.replace(/<[^>]+>/g, ''));
  assert.ok(texts.some((t) => /k$/.test(t)), `ticks use k shorthand for thousands: ${texts.join(', ')}`);
  assert.ok(texts.some((t) => /^-?\d+(\.\d+)?$/.test(t)), 'smaller ticks stay plain numbers');
});

test('runtime compacts million-scale y-axis ticks with the M suffix', () => {
  // fmt() switches from k to M at 1e6; a million-scale series must render
  // compact 1.8M/2.8M/3.9M style ticks instead of 8-digit numbers that would
  // crowd the axis.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Revenue\n        data:\n          - { label: Q1, series: { rev: 2200000 } }\n          - { label: Q2, series: { rev: 3500000 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Revenue' },
  ]);
  runRuntime(code, dom, {
    'chart-0': [
      { label: 'Q1', series: { rev: 2200000 } },
      { label: 'Q2', series: { rev: 3500000 } },
    ],
  });
  const out = figureEls[0].innerHTML;
  const ticks = out.match(/<text class="dg-axis"(?! dg-axis-x)[^>]*>[^<]+<\/text>/g) || [];
  assert.ok(ticks.length >= 3, `y-axis ticks rendered (got ${ticks.length})`);
  const texts = ticks.map((t) => t.replace(/<[^>]+>/g, ''));
  assert.ok(texts.every((t) => /M$/.test(t) || /k$/.test(t)), `all million-scale ticks are compacted: ${texts.join(', ')}`);
  assert.ok(texts.some((t) => /M$/.test(t)), `at least one tick uses M shorthand: ${texts.join(', ')}`);
  assert.ok(!texts.some((t) => /^\d{6,}$/.test(t)), 'no 6+ digit plain ticks survive');
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

  // Pie chrome: the flex wrapper, the pie-sized svg root with viewBox and
  // accessible name, per-slice <title> tooltips, dg-label percent texts, and a
  // legend naming every slice with a color swatch.
  assert.ok(out.includes('<div class="dg-pie-flex">'), 'pie wrapped in a flex row');
  assert.ok(/<svg class="dg-svg dg-svg-pie" viewBox="0 0 240 240" role="img" aria-label="Occupancy pie chart"/.test(out),
    'pie svg root carries class, viewBox, role and aria-label');
  const tips = out.match(/<title>[^<]*<\/title>/g) || [];
  assert.strictEqual(tips.length, 2, 'one title tooltip per slice');
  assert.ok(out.includes('<title>core: 12 (60.0%)</title>'), 'core tooltip names label, value and share');
  assert.ok(out.includes('<title>edge: 8 (40.0%)</title>'), 'edge tooltip names label, value and share');
  assert.ok((out.match(/class="dg-label"/g) || []).length === 2, 'slice percent labels rendered');
  assert.ok(out.includes('>core</span>') && out.includes('>edge</span>'), 'legend names every slice');
  assert.ok(out.includes('class="dg-legend-swatch" style="background:#'), 'pie legend swatches carry colors');
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

test('runtime drops non-positive pie values and shows no-data when all are non-positive', () => {
  // Pie slice sources are filtered to values > 0: a zero-value row contributes
  // no wedge (a 0% slice is noise) and a negative-value row is noise dropped the
  // same way, with shares computed over the surviving positive total. When every
  // row is non-positive there is nothing to draw, so the chart must degrade to
  // the no-data note instead of emitting a hollow (or NaN-laden) svg.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: pie\n        title: Mix\n        data:\n          - [a, 5]\n          - [b, 0]\n          - [c, -3]\n      - type: chart\n        kind: pie\n        title: None\n        data:\n          - [x, 0]\n          - [y, -1]',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-0', 'data-chart-title': 'Mix' },
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-1', 'data-chart-title': 'None' },
  ]);
  runRuntime(code, dom, { 'chart-0': [['a', 5], ['b', 0], ['c', -3]], 'chart-1': [['x', 0], ['y', -1]] });
  const mix = figureEls[0].innerHTML;
  assert.strictEqual((mix.match(/class="dg-slice"/g) || []).length, 1, 'only the positive row draws a slice');
  assert.ok(mix.includes('>a</span>'), 'surviving slice keeps its legend name');
  assert.ok(!mix.includes('>b</span>') && !mix.includes('>c</span>'), 'non-positive rows are absent from the legend');
  assert.ok(mix.includes('a 100.0%'), 'shares recomputed over the positive total');
  const none = figureEls[1].innerHTML;
  assert.ok(none.includes('No data to draw'), 'all-non-positive pie shows the no-data note');
  assert.ok(!none.includes('<svg'), 'no hollow svg for an empty pie');
  assert.ok(!none.includes('NaN'), 'no NaN leaks into the empty pie');
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

test('runtime treats explicit empty array data as no-data for every chart kind', () => {
  // data: [] parses fine (toPoints returns empty points/series, never throws).
  // Every kind must show the no-data note instead of a hollow chart shell or a
  // misleading "parse failed" error, so line/bar/pie degrade identically.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: L\n        data: []\n      - type: chart\n        kind: bar\n        title: B\n        data: []\n      - type: chart\n        kind: pie\n        title: P\n        data: []',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const figs = [
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'L' },
    { 'data-chart-type': 'bar', 'data-chart-data': 'chart-1', 'data-chart-title': 'B' },
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-2', 'data-chart-title': 'P' },
  ];
  const { dom, figureEls } = makeDom(figs);
  runRuntime(code, dom, { 'chart-0': [], 'chart-1': [], 'chart-2': [] });
  figureEls.forEach((el, i) => {
    assert.ok(el.innerHTML.includes('No data to draw'), `kind ${['line', 'bar', 'pie'][i]} shows no-data note`);
    assert.ok(!el.innerHTML.includes('Chart data parse failed'), `kind ${['line', 'bar', 'pie'][i]} is not a parse error`);
    assert.ok(!el.innerHTML.includes('<svg'), `kind ${['line', 'bar', 'pie'][i]} renders no hollow svg`);
    assert.ok(!el.innerHTML.includes('NaN'), `kind ${['line', 'bar', 'pie'][i]} leaks no NaN`);
  });
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

test('runtime keeps a line y-axis right-way-up when start sits above the data', () => {
  // A numeric start above the padded data max used to pin minV >= maxV, so
  // y() divided by a negative span and inverted the axis: higher data mapped
  // to a LARGER y (drifting off-plot downward) instead of a smaller one. The
  // baseline may legitimately sit above the data, but the axis must keep a
  // positive, correctly oriented range.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Temp\n        data:\n          - { label: Jan, series: { t: 20 } }\n          - { label: Feb, series: { t: 24 } }\n          - { label: Mar, series: { t: 28 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  // The padded data max here is 30.8 (minV 0 -> maxV 28, pad 2.8); start 35
  // lands above it, which used to leave maxV - minV negative.
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Temp', 'data-chart-start': '35' }]);
  runRuntime(code, dom, { 'chart-0': [{ label: 'Jan', series: { t: 20 } }, { label: 'Feb', series: { t: 24 } }, { label: 'Mar', series: { t: 28 } }] });
  const out = figureEls[0].innerHTML;
  const d = /<path class="dg-series" d="([^"]+)"/.exec(out);
  assert.ok(d, 'line chart produced a series path');
  const ys = d[1].match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
  assert.strictEqual(ys.length, 3, 'one point per row');
  assert.ok(ys.every(Number.isFinite), 'every mapped y stays finite');
  assert.ok(!/NaN|Infinity/.test(out), 'chart leaks no NaN/Infinity');
  // Data rises 20 -> 28, so mapped y must fall: the axis stays right-way-up.
  assert.ok(ys[0] > ys[ys.length - 1], 'axis is not inverted: higher data maps to a smaller y');
});

test('runtime does not divide by zero when start equals the padded data max', () => {
  // start value was clamped into minV without checking the span: when it landed
  // exactly on the padded maximum the y scale was zero width and y() divided
  // by zero, leaking NaN/Infinity into the axis, grid and series coordinates.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Solo\n        data:\n          - { label: Only, series: { t: 20 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  // Single value 20: minV 0 -> maxV 20, pad 2 -> padded max exactly 22.
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Solo', 'data-chart-start': '22' }]);
  runRuntime(code, dom, { 'chart-0': [{ label: 'Only', series: { t: 20 } }] });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('<svg'), 'single point still produces an svg');
  assert.ok(!/NaN|Infinity/.test(out), 'zero-span start leaks no NaN/Infinity');
});

test('runtime centers a single-point line instead of dividing by zero', () => {
  // With one data point the x-scale has no span, so the naive x(i) formula
  // would divide by (points.length - 1) = 0 and leak NaN coordinates. The
  // runtime must center the lone point (and its x-axis label) in the plot
  // instead, keeping the series path and everything else NaN-free.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Solo\n        data:\n          - { label: Only, series: { t: 20 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([{ 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Solo' }]);
  runRuntime(code, dom, { 'chart-0': [{ label: 'Only', series: { t: 20 } }] });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('<svg'), 'single point still produces an svg');
  assert.ok(/<path class="dg-series" d="M398\.0 \d+\.\d+/.test(out),
    'the lone point is centered horizontally at x=398 (plot mid)');
  assert.ok(/<text class="dg-axis dg-axis-x" x="398" /.test(out), 'the x-label sits at the same centered x');
  assert.ok(out.includes('>t</span>'), 'legend names the single series');
  assert.ok(!/<path class="dg-series" d="[^"]*NaN|NaN/.test(out), 'no NaN leaks into the single-point chart');
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

  // Bar chrome: grid lines, numeric y ticks, an x-axis category label per
  // row, and the svg root's viewBox — the same surface pinned for line charts.
  assert.ok(/<svg class="dg-svg" viewBox="0 0 \d+ \d+"/.test(out), 'bar svg root has class and a viewBox');
  assert.ok((out.match(/class="dg-grid-h"/g) || []).length >= 3, 'horizontal grid lines rendered');
  const yTicks = out.match(/<text class="dg-axis"(?! dg-axis-x)[^>]*>[-\d.]+<\/text>/g) || [];
  assert.ok(yTicks.length >= 3, `y-axis numeric ticks rendered (got ${yTicks.length})`);
  assert.ok(out.includes('>Q1</text>') && out.includes('>Q2</text>'), 'x-axis labels every category');
});

test('runtime draws one pie slice per series key in a single data row', () => {
  // README: pie accepts "a single row with a multi-key series: map (one slice
  // per series key)". The runtime must explode that one row into slices, not
  // drop every key but the first.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: pie\n        title: Share\n        data:\n          - label: Q1\n            series: { Organic: 60, Paid: 40 }\n',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-0', 'data-chart-title': 'Share' },
  ]);
  runRuntime(code, dom, { 'chart-0': [{ label: 'Q1', series: { Organic: 60, Paid: 40 } }] });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('<svg'), 'pie produced svg');
  assert.strictEqual((out.match(/class="dg-slice"/g) || []).length, 2, 'one slice per series key');
  assert.ok(out.includes('Organic 60.0%') && out.includes('Paid 40.0%'), 'slice labels use the series keys with computed shares');
});

test('runtime applies custom swatches to line and bar series paths', () => {
  // data-chart-swatches must color each line/bar series stroke/fill (and the
  // legend swatch) just as it does pie slices, instead of the palette hash
  // fallback.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Trend\n        swatches: { a: "#16a34a", b: "#2563eb" }\n        data:\n          - { label: Jan, series: { a: 10, b: 4 } }\n          - { label: Feb, series: { a: 14, b: 6 } }\n      - type: chart\n        kind: bar\n        title: Sales\n        swatches: { a: "#f59e0b", b: "#8b5cf6" }\n        data:\n          - { label: Q1, series: { a: 10, b: 5 } }\n      - type: chart\n        kind: pie\n        title: Share\n        swatches: { Organic: "#16a34a", Paid: "#2563eb" }\n        data:\n          - { label: Organic, value: 60 }\n          - { label: Paid, value: 40 }\n',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Trend', 'data-chart-swatches': '{"a":"#16a34a","b":"#2563eb"}' },
    { 'data-chart-type': 'bar', 'data-chart-data': 'chart-1', 'data-chart-title': 'Sales', 'data-chart-swatches': '{"a":"#f59e0b","b":"#8b5cf6"}' },
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-2', 'data-chart-title': 'Share', 'data-chart-swatches': '{"Organic":"#16a34a","Paid":"#2563eb"}' },
  ]);
  const data = {
    'chart-0': [
      { label: 'Jan', series: { a: 10, b: 4 } },
      { label: 'Feb', series: { a: 14, b: 6 } },
    ],
    'chart-1': [{ label: 'Q1', series: { a: 10, b: 5 } }],
    'chart-2': [{ label: 'Organic', value: 60 }, { label: 'Paid', value: 40 }],
  };
  runRuntime(code, dom, data);
  const lineOut = figureEls[0].innerHTML;
  const barOut = figureEls[1].innerHTML;
  const pieOut = figureEls[2].innerHTML;
  assert.ok(lineOut.includes('stroke="#16a34a"') && lineOut.includes('stroke="#2563eb"'), 'each line series gets its swatch stroke');
  assert.ok(lineOut.includes('background:#16a34a') && lineOut.includes('background:#2563eb'), 'line legend swatches use the custom colors');
  assert.ok(barOut.includes('fill="#f59e0b"') && barOut.includes('fill="#8b5cf6"'), 'each bar series gets its swatch fill');
  assert.ok(barOut.includes('background:#f59e0b'), 'bar legend swatch uses the custom color');
  assert.ok(pieOut.includes('fill="#16a34a"'), 'pie slices still honor swatches alongside line/bar');
  // The palette hash fallback must not leak in where swatches are set: line
  // strokes, bar fills and pie fills are all covered by their own swatch maps.
  assert.ok(!lineOut.includes('stroke="#3b82f6"'), 'line uses no palette fallback stroke');
  assert.ok(!barOut.includes('fill="#3b82f6"'), 'bar uses no palette fallback fill');
  assert.ok(!pieOut.includes('fill="#3b82f6"') && !pieOut.includes('fill="#f59e0b"'), 'pie uses no palette fallback fill');
});

test('runtime derives series colors from a deterministic palette hash when no swatches are set', () => {
  // Without data-chart-swatches the runtime picks each series stroke (and its
  // legend swatch) from a fixed 8-color palette by hashing the series name, so
  // the same name always gets the same color across charts and rebuilds while
  // distinct names in one chart get distinct palette slots.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Trend\n        data:\n          - { label: Jan, series: { rev: 10, other: 4 } }\n          - { label: Feb, series: { rev: 14, other: 6 } }\n      - type: chart\n        kind: line\n        title: Trend Again\n        data:\n          - { label: Jan, series: { rev: 2 } }\n          - { label: Feb, series: { rev: 7 } }\n',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Trend' },
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-1', 'data-chart-title': 'Trend Again' },
  ]);
  runRuntime(code, dom, {
    'chart-0': [
      { label: 'Jan', series: { rev: 10, other: 4 } },
      { label: 'Feb', series: { rev: 14, other: 6 } },
    ],
    'chart-1': [
      { label: 'Jan', series: { rev: 2 } },
      { label: 'Feb', series: { rev: 7 } },
    ],
  });
  const out0 = figureEls[0].innerHTML;
  const out1 = figureEls[1].innerHTML;
  // Stroke colors on the paths must come from the fixed palette.
  const strokes0 = out0.match(/class="dg-series"[^>]*stroke="(#[0-9a-f]{6})"/g) || [];
  const strokes1 = out1.match(/class="dg-series"[^>]*stroke="(#[0-9a-f]{6})"/g) || [];
  assert.strictEqual(strokes0.length, 2, 'two series in chart one');
  assert.strictEqual(strokes1.length, 1, 'one series in chart two');
  const color0a = strokes0[0].match(/#[0-9a-f]{6}/)[0];
  const color0b = strokes0[1].match(/#[0-9a-f]{6}/)[0];
  assert.notStrictEqual(color0a, color0b, 'rev and other hash to different palette slots');
  assert.match(color0a, /^#(3b82f6|a855f7|f59e0b|10b981|ef4444|8b5cf6|14b8a6|f97316)$/, 'uses the documented palette');
  // Legend swatch of a series always matches its path stroke.
  const legend0 = out0.match(/dg-legend-swatch" style="background:(#[0-9a-f]{6})"/g) || [];
  assert.strictEqual(legend0.length, 2, 'two legend swatches in chart one');
  assert.strictEqual(legend0[0].match(/#[0-9a-f]{6}/)[0], color0a, 'first legend swatch matches first stroke');
  // rev appears in both charts; its color must be identical in both.
  const revColor1 = strokes1[0].match(/#[0-9a-f]{6}/)[0];
  assert.strictEqual(revColor1, color0a, 'same series name colors identically across charts');
  assert.ok(out1.includes(`background:${revColor1}`), 'chart two legend swatch matches too');
});

test('runtime falls back to the palette when data-chart-swatches is invalid JSON', () => {
  // data-chart-swatches mirrors a serialized swatches map, but a hand-edited or
  // mismatched page could carry malformed JSON there. The parse must not throw
  // or poison the chart: it falls back to the deterministic palette hash, and
  // every series still draws with a valid color.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Trend\n        data:\n          - { label: Jan, series: { a: 10, b: 4 } }\n          - { label: Feb, series: { a: 14, b: 6 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Trend', 'data-chart-swatches': '{oops: not json' },
  ]);
  runRuntime(code, dom, { 'chart-0': [{ label: 'Jan', series: { a: 10, b: 4 } }, { label: 'Feb', series: { a: 14, b: 6 } }] });
  const out = figureEls[0].innerHTML;
  assert.ok(out.includes('<svg'), 'chart still renders with malformed swatches');
  const strokes = out.match(/<path class="dg-series" d="[^"]+" fill="none" stroke="(#[0-9a-f]{6})"/g) || [];
  assert.strictEqual(strokes.length, 2, 'both series drew');
  for (const s of strokes) {
    const hex = s.match(/#[0-9a-f]{6}/)[0];
    assert.match(hex, /^#(3b82f6|a855f7|f59e0b|10b981|ef4444|8b5cf6|14b8a6|f97316)$/, `stroke ${hex} comes from the palette`);
  }
  assert.ok(!out.includes('Chart data parse failed'), 'no parse error banner');
  assert.ok(!out.includes('NaN'), 'no NaN leaks');
});

test('runtime narrows bars below the 36px cap when many categories crowd the plot', () => {
  // barW = Math.min(36, (groupW * 0.7) / series.length): with a handful of
  // categories the 36px cap wins (pinned by the multi-series bar test), but a
  // wide dataset must take the group-scaled branch — bars shrink so they stay
  // inside the plot instead of overflowing past the right edge.
  const rows = [];
  for (let i = 1; i <= 16; i++) rows.push([String.fromCharCode(64 + i), i]);
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: bar\n        title: Wide\n        data:\n          - [A, 1]\n          - [B, 2]\n          - [C, 3]\n          - [D, 4]\n          - [E, 5]\n          - [F, 6]\n          - [G, 7]\n          - [H, 8]\n          - [I, 9]\n          - [J, 10]\n          - [K, 11]\n          - [L, 12]\n          - [M, 13]\n          - [N, 14]\n          - [O, 15]\n          - [P, 16]',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'bar', 'data-chart-data': 'chart-0', 'data-chart-title': 'Wide' },
  ]);
  runRuntime(code, dom, { 'chart-0': rows });
  const out = figureEls[0].innerHTML;
  const bars = out.match(/<rect class="dg-bar" x="([\d.]+)" y="[\d.]+" width="([\d.]+)" /g) || [];
  assert.strictEqual(bars.length, 16, 'one bar per category');
  const widths = bars.map((b) => Number(b.match(/width="([\d.]+)"/)[1]));
  assert.ok(widths.every((w) => w < 36), `bars shrink below the 36px cap (got ${Math.max(...widths)})`);
  const xs = bars.map((b) => Number(b.match(/x="([\d.]+)"/)[1]));
  assert.ok(Math.min(...xs) >= 56, 'first bar starts inside the plot');
  assert.ok(Math.max(...xs) + Math.max(...widths) <= 740, 'last bar ends inside the plot (no overflow)');
  assert.ok(out.includes('>A</text>') && out.includes('>P</text>'), 'x-axis labels span first and last category');
});

test('runtime bridges missing series values in line charts without NaN', () => {
  // Sparse series data: a row can omit a series key (series: {} leaves the
  // value undefined, which Number() coerces to NaN). When drawing, the runtime
  // must skip the missing point entirely — the line path bridges Jan to Mar —
  // rather than emitting a NaN coordinate or treating the gap as a zero value.
  // The x-axis must still label the empty row and the legend must still name
  // the sparse series.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: line\n        title: Sparse\n        data:\n          - { label: Jan, series: { a: 10 } }\n          - { label: Feb, series: {} }\n          - { label: Mar, series: { a: 12 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Sparse' },
  ]);
  runRuntime(code, dom, {
    'chart-0': [
      { label: 'Jan', series: { a: 10 } },
      { label: 'Feb', series: {} },
      { label: 'Mar', series: { a: 12 } },
    ],
  });
  const out = figureEls[0].innerHTML;
  const d = /<path class="dg-series" d="([^"]+)"/.exec(out);
  assert.ok(d, 'line chart produced a series path');
  // Three x-slots: Jan at the plot left edge (56), Mar at the right edge (740).
  // The path must span only the present points.
  assert.ok(/M56\.0 \d+\.\d+ L740\.0 \d+\.\d+/.test(d[1]),
    'path bridges the missing point (Jan x=56 straight to Mar x=740)');
  assert.ok(!/<path class="dg-series" d="[^"]*NaN/.test(out), 'no NaN in the line path');
  assert.ok(out.includes('>Feb</text>'), 'the missing row still gets its x-axis label');
  assert.ok(out.includes('>a</span>'), 'legend still names the sparse series');
  assert.ok(!out.includes('NaN'), 'no NaN leaks into the chart');
});

test('runtime leaves bar cells empty for rows missing a series value', () => {
  // In a multi-series bar chart one category may not have every series (Q2 has
  // no b). The missing cell must simply not render — no NaN-height rect, no
  // zero-height placeholder — while the category keeps its x label and the
  // series keeps its legend entry.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: bar\n        title: Sparse\n        data:\n          - { label: Q1, series: { a: 10, b: 5 } }\n          - { label: Q2, series: { a: 20 } }\n          - { label: Q3, series: { a: 8, b: 9 } }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'bar', 'data-chart-data': 'chart-0', 'data-chart-title': 'Sparse' },
  ]);
  runRuntime(code, dom, {
    'chart-0': [
      { label: 'Q1', series: { a: 10, b: 5 } },
      { label: 'Q2', series: { a: 20 } },
      { label: 'Q3', series: { a: 8, b: 9 } },
    ],
  });
  const out = figureEls[0].innerHTML;
  const bars = out.match(/<rect class="dg-bar" [^>]*?height="([\d.]+)"/g) || [];
  assert.strictEqual(bars.length, 5, 'one bar per present value, missing Q2/b cell draws nothing');
  for (const b of bars) {
    const h = Number(b.match(/height="([\d.]+)"/)[1]);
    assert.ok(Number.isFinite(h) && h > 0, `bar height is finite and positive (got ${h})`);
  }
  assert.ok(out.includes('>Q2</text>'), 'Q2 still labelled though one series is missing there');
  assert.ok(out.includes('>a</span>') && out.includes('>b</span>'), 'legend lists every series');
  assert.ok(!out.includes('NaN'), 'no NaN leaks into the bar chart');
});

test('runtime coerces non-numeric pie values to zero and skips empty-label rows', () => {
  // Slice sources have two guardrails: a row with an empty/null label must not
  // become a slice (render.js keeps the legend readable), and a non-numeric
  // series value coerces to 0 (Number(...) || 0) so it is filtered out rather
  // than leaking NaN into the paths.
  const html = buildFromSource(
    'title: t\nsections:\n  - content:\n      - type: chart\n        kind: pie\n        title: Rows\n        data:\n          - { label: A, series: { x: 10 } }\n          - { label: "", series: { y: 5 } }\n          - { label: null, series: { z: 7 } }\n      - type: chart\n        kind: pie\n        title: Map\n        data:\n          - label: Q1\n            series: { Good: 10, Bad: nope }',
    'x.yaml'
  );
  const code = extractRuntime(html);
  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-0', 'data-chart-title': 'Rows' },
    { 'data-chart-type': 'pie', 'data-chart-data': 'chart-1', 'data-chart-title': 'Map' },
  ]);
  runRuntime(code, dom, {
    'chart-0': [{ label: 'A', series: { x: 10 } }, { label: '', series: { y: 5 } }, { label: null, series: { z: 7 } }],
    'chart-1': [{ label: 'Q1', series: { Good: 10, Bad: 'nope' } }],
  });
  const rowsOut = figureEls[0].innerHTML;
  assert.strictEqual((rowsOut.match(/class="dg-slice"/g) || []).length, 1, 'only the labelled row draws a slice');
  assert.ok(rowsOut.includes('>A</span>'), 'surviving slice keeps its legend name');
  assert.ok(rowsOut.includes('<title>A: 10 (100.0%)</title>'), 'the slice title carries the full share');
  const mapOut = figureEls[1].innerHTML;
  assert.strictEqual((mapOut.match(/class="dg-slice"/g) || []).length, 1, 'non-numeric series key coerced to 0 and filtered');
  assert.ok(mapOut.includes('Good 100.0%'), 'numeric key keeps its full share');
  assert.ok(!mapOut.includes('Bad'), 'non-numeric key absent from slices and legend');
  assert.ok(!rowsOut.includes('NaN') && !mapOut.includes('NaN'), 'no NaN leaks into either pie');
});

test('runtime reports the HTTP status when a fetch responds without ok', async () => {
  // A rejected fetch covers the network-failure path, but a response that
  // resolves with ok:false (404 file, 500 server error) takes a separate
  // branch: the runtime must throw "HTTP <status>" and surface it in the
  // figure's error message, then not render.
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'fetch.yaml'), 'utf8');
  const html = buildFromSource(src, 'fetch.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);

  const { dom, figureEls } = makeDom([
    { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'Price' },
  ]);
  const w = {
    document: dom,
    console,
    fetch: () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve([]) }),
    Promise,
    setTimeout,
    clearTimeout,
  };
  w.window = w;
  w.__DG_DATA__ = {};
  const fn = new Function('window', 'document', 'fetch', code);
  fn.call(w, w, dom, w.fetch);
  await new Promise((r) => setTimeout(r, 0));
  const out = figureEls[0].innerHTML;
  assert.match(out, /Failed to load chart data/, 'an ok:false response surfaces a load error');
  assert.match(out, /HTTP 500/, 'the status code appears in the message');
  assert.ok(out.includes('dg-error'), 'error is marked with the dg-error class');
});

test('runtime defers chart init until DOMContentLoaded when the document is loading', () => {
  // init() runs immediately when readyState is 'complete' (inline scripts on a
  // finished document), but for a still-loading document it must register a
  // DOMContentLoaded handler and render only then — otherwise charts would
  // query a half-built DOM. The handler must be an actual listener, not an
  // eager render.
  const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'chart.yaml'), 'utf8');
  const html = buildFromSource(src, 'chart.yaml', { fileDir: 'examples' });
  const code = extractRuntime(html);
  const data = extractData(html);

  const figureEls = [
    {
      attrs: { 'data-chart-type': 'line', 'data-chart-data': 'chart-0', 'data-chart-title': 'DAU this week' },
      innerHTML: '',
      getAttribute(name) { return this.attrs[name] !== undefined ? this.attrs[name] : null; },
      set innerHTML(v) { this._html = v; },
      get innerHTML() { return this._html || ''; },
    },
  ];
  let onReady = null;
  const dom = {
    readyState: 'loading',
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') onReady = fn; },
    querySelectorAll() { return figureEls; },
  };
  const sandbox = { document: dom, console, Promise, setTimeout, clearTimeout, __DG_DATA__: data };
  sandbox.window = sandbox;
  sandbox.window.__DG_DATA__ = data;
  const fn = new Function('window', 'document', code);
  fn.call(sandbox.window, sandbox.window, dom);

  assert.strictEqual(figureEls[0].innerHTML, '', 'no chart renders while the document is still loading');
  assert.strictEqual(typeof onReady, 'function', 'a DOMContentLoaded handler was registered');
  onReady();
  assert.ok(figureEls[0].innerHTML.includes('<svg'), 'deferred init renders the chart once the DOM is ready');
});
