// End-to-end generator tests: build a fixture DSL -> assert DOM/aria/chart/theme.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildFromSource, renderHtml } = require('../lib/build');
const { checkA11y } = require('../lib/a11y');

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

test('dashboard runbook section exercises the remaining component library', () => {
  // The flagship example doubles as the component showcase: alongside the
  // grid/stat/table/chart sections it now renders callout, steps, divider,
  // quote, code, badge, kv, details, tabs, stat-list, toc, checklist,
  // footnote, timeline, def-list, stepper, image, sparkline, status,
  // heatmap, progress, terminal, gauge, and breadcrumbs — the components no
  // other example uses — so the canonical DSL proves the full 34-component
  // library renders in one page.
  const html = buildFixture('dashboard');
  assert.match(html, /<a class="dg-navlink" href="#s-runbook">Runbook<\/a>/,
    'nav links the runbook section');
  assert.match(html, /<h2 class="dg-section-title" id="s-runbook"/);
  assert.match(html, /<div class="dg-callout dg-callout--warning" role="note" aria-label="Incident playbook">/);
  assert.match(html, /<div class="dg-callout-title">Incident playbook<\/div>/);
  assert.match(html, /<p class="dg-callout-body">Follow the ordered steps below/);
  assert.match(
    html,
    /<ol class="dg-steps"><li class="dg-steps-item"><span class="dg-steps-num">1<\/span><span class="dg-steps-text">Assess blast radius and page the on-call engineer\.<\/span><\/li>/,
    'runbook renders a numbered steps list'
  );
  assert.match(
    html,
    /<nav class="dg-breadcrumbs" aria-label="Breadcrumb"><ol class="dg-breadcrumbs-list"><li class="dg-breadcrumbs-item"><a class="dg-breadcrumbs-link" href="#s-overview">Ops Console<\/a><\/li><li class="dg-breadcrumbs-item"><span class="dg-breadcrumbs-current" aria-current="page">Runbook<\/span><\/li><\/ol><\/nav>/,
    'runbook opens with a labelled breadcrumb trail ending in the current page'
  );
  const runbook = html.match(/<h2 class="dg-section-title" id="s-runbook">[\s\S]*$/)[0];
  assert.strictEqual((runbook.match(/dg-steps-item/g) || []).length, 4, 'runbook has four numbered steps');
  assert.match(html, /<hr class="dg-divider">/);
  assert.match(html, /<blockquote class="dg-quote"><p>Production is the least interesting environment/);
  assert.match(html, /<footer class="dg-quote-cite">— Ops Handbook<\/footer>/);
  assert.match(html, /<div class="dg-code" role="region" aria-label="Rollback" data-code-lang="bash">/);
  assert.match(html, /<span class="dg-code-lang">bash<\/span>/);
  assert.match(
    html,
    /<code class="dg-code-body">curl -s https:\/\/api\.example\.internal\/releases\/latest\ndg deploy --service billing-worker --rev \$REV\ncurl -s -f https:\/\/api\.example\.internal\/healthz<\/code>/,
    'code block joins its lines with newlines and keeps shell syntax verbatim'
  );
  assert.match(html, /<span class="dg-badge dg-badge--success">healthy<\/span>/);
  assert.match(
    html,
    /<dl class="dg-kv"><div class="dg-kv-row"><dt>Service<\/dt><dd>billing-worker<\/dd><\/div><div class="dg-kv-row"><dt>Revision<\/dt><dd>f3a9c21<\/dd><\/div><div class="dg-kv-row"><dt>Region<\/dt><dd>eu-west-1<\/dd><\/div><div class="dg-kv-row"><dt>Owner<\/dt><dd>Platform &lt;\/team&gt;<\/dd><\/div><\/dl>/,
    'runbook closes with a kv definition list'
  );
  assert.match(
    html,
    /<figure class="dg-figure dg-image" aria-label="Ops Console status strip"><img src="data:image\/svg\+xml;utf8,.*" alt="Ops Console status strip"><figcaption class="dg-image-caption">Ops Console status strip<\/figcaption><\/figure>/,
    'runbook embeds the SVG asset as a data-URI image with a labelled figure'
  );
  assert.match(
    html,
    /<details class="dg-details"><summary class="dg-details-summary">Rollback checklist<\/summary>[\s\S]*<ul class="dg-ul"><li>Verify the rollback target is a known-good release<\/li>[\s\S]*<div class="dg-callout dg-callout--warning"><p class="dg-callout-body">The rollback check is never skipped\.<\/p>[\s\S]*<\/details>/,
    'runbook folds the rollback checklist inside a closed details block'
  );
  assert.match(
    html,
    /<div class="dg-tabs"><input type="radio" name="dg-tabs-\d+" id="dg-tabs-\d+-0"[^>]*>[\s\S]*<input type="radio" name="dg-tabs-\d+" id="dg-tabs-\d+-1" class="dg-tab-input" checked>\n<label class="dg-tab-label" for="dg-tabs-\d+-1">Alerts<\/label>\n<div class="dg-tab-panel"><dl class="dg-kv">[\s\S]*<label class="dg-tab-label" for="dg-tabs-\d+-2">None selected<\/label>\n<div class="dg-tab-panel"><p class="dg-paragraph">No default tab opens<\/p><\/div>/,
    'runbook tabs zero in on the Alerts panel (active: 1) with a text-only fallback tab'
  );
  assert.match(
    html,
    /<div class="dg-scroll"><table class="dg-statlist" aria-label="Release health checks"><tbody>\n<tr class="dg-statlist-row"><th scope="row">Builds<\/th><td class="dg-statlist-value">214<\/td><td class="dg-statlist-delta dg-statlist-delta--good">▲ 5<\/td><\/tr>\n<tr class="dg-statlist-row"><th scope="row">Deploys \/ day<\/th><td class="dg-statlist-value">12<\/td><td class="dg-statlist-delta dg-statlist-delta--neutral">▼ 1<\/td><\/tr>\n<tr class="dg-statlist-row"><th scope="row">Rollbacks<\/th><td class="dg-statlist-value">0<\/td><td class="dg-statlist-delta dg-statlist-delta--neutral">0<\/td><\/tr>\n<tr class="dg-statlist-row"><th scope="row">Open incidents<\/th><td class="dg-statlist-value">#2<\/td><td class="dg-statlist-delta dg-statlist-delta--bad">▲ 1<\/td><\/tr>\n<\/tbody><\/table><\/div>/,
    'runbook renders the KPI row table with a good/neutral/bad delta band'
  );
  assert.match(
    html,
    /<nav class="dg-toc" aria-label="On this page"><ul><li><a class="dg-toc-link" href="#s-overview">Overview<\/a><\/li><li><a class="dg-toc-link" href="#s-metrics">Metrics<\/a><\/li><li><a class="dg-toc-link" href="#s-releases">Releases<\/a><\/li><li><a class="dg-toc-link" href="#s-storage">Storage<\/a><\/li><li><a class="dg-toc-link" href="#s-runbook">Runbook<\/a><\/li><\/ul><\/nav>/,
    'overview embeds an auto-generated contents nav linking every section'
  );
  assert.match(
    html,
    /<ul class="dg-checklist"><li class="dg-checklist-item dg-checklist-item--done"><span class="dg-checklist-mark">✓<\/span><span class="dg-checklist-text">Billing-queue drained<\/span><\/li><li class="dg-checklist-item dg-checklist-item--done"><span class="dg-checklist-mark">✓<\/span><span class="dg-checklist-text">Healthz green after rollback<\/span><\/li><li class="dg-checklist-item dg-checklist-item--done"><span class="dg-checklist-mark">✓<\/span><span class="dg-checklist-text">Canary at 100% for 30 minutes<\/span><\/li><li class="dg-checklist-item dg-checklist-item--pending"><span class="dg-checklist-mark">○<\/span><span class="dg-checklist-text">On-call notified of the incident window<\/span><\/li><li class="dg-checklist-item dg-checklist-item--pending"><span class="dg-checklist-mark">○<\/span><span class="dg-checklist-text">Post-incident review scheduled<\/span><\/li><\/ul>/,
    'runbook closes with a done/pending status checklist'
  );
  assert.match(
    html,
    /<aside class="dg-footnote" role="doc-footnote" aria-label="Footnote">Incident windows and datapoints above are illustrative; the rollback checklist reflects the internal runbook as of this revision\.<\/aside>/,
    'runbook ends on a small-print footnote'
  );
  assert.match(
    html,
    /<div class="dg-terminal" role="region" aria-label="Rollback session"><div class="dg-terminal-header"><span class="dg-terminal-title">Rollback session<\/span><\/div><pre class="dg-terminal-body"><span class="dg-terminal-line dg-terminal-line--cmd">\$ dg deploy --service billing-worker --rev 2143<\/span>/,
    'runbook replays the rollback session as a titled terminal console'
  );
  assert.match(
    html,
    /<div class="dg-figure dg-gauge" role="img" aria-label="Queue saturation: 38%">\s*<div class="dg-gauge-title">Queue saturation<\/div>\s*<div class="dg-gauge-main"><svg class="dg-gauge-svg" viewBox="0 0 100 58" aria-hidden="true" focusable="false"><path class="dg-gauge-track" d="M 10 50 A 40 40 0 0 1 90 50"\/><path class="dg-gauge-arc dg-gauge-arc--warning" d="M 10 50 A 40 40 0 0 1 [\d.]+ [\d.]+"\/><\/svg><div class="dg-gauge-readout"><span class="dg-gauge-value">38%<\/span><span class="dg-gauge-range">0 – 100<\/span><\/div><\/div>\s*<p class="dg-note dg-gauge-cap">Share of the worker pool busy at peak<\/p><\/div>/,
    'metrics gauge spells its value and range as text under a labelled semicircular arc'
  );
  assert.match(
    html,
    /<div class="dg-timeline"><div class="dg-timeline-title">Incident timeline<\/div><ul class="dg-timeline-list"><li class="dg-timeline-item"><time class="dg-timeline-time" datetime="09:14">09:14<\/time><span class="dg-timeline-text">Alert fires on elevated billing-queue lag<\/span><\/li><li class="dg-timeline-item"><time class="dg-timeline-time" datetime="09:17">09:17<\/time><span class="dg-timeline-text">On-call acknowledges and pages the owner<\/span><\/li><li class="dg-timeline-item"><time class="dg-timeline-time" datetime="09:32">09:32<\/time><span class="dg-timeline-text">Rollback of billing-worker released<\/span><\/li><li class="dg-timeline-item"><time class="dg-timeline-time" datetime="09:41">09:41<\/time><span class="dg-timeline-text">Healthz green; queue drains to zero<\/span><\/li><li class="dg-timeline-item"><time class="dg-timeline-time" datetime="10:05">10:05<\/time><span class="dg-timeline-text">Incident window closed<\/span><\/li><\/ul><\/div>/,
    'runbook shows the incident window as a time-stamped timeline'
  );
  assert.match(
    html,
    /<dl class="dg-def-list"><div class="dg-def-list-row"><dt>Window<\/dt><dd>2026-11-17 09:14–10:05<\/dd><\/div><div class="dg-def-list-row"><dt>Root cause<\/dt><dd>Billing-worker release 2144 regression<\/dd><\/div><div class="dg-def-list-row"><dt>Action<\/dt><dd>Rolled back; canary at 100% for 30 minutes<\/dd><\/div><\/dl>/,
    'runbook recaps the incident window in a plain definition list'
  );
  assert.match(
    html,
    /<ol class="dg-stepper"><li class="dg-stepper-item dg-stepper-item--done"><span class="dg-stepper-num">✓<\/span><span class="dg-stepper-text">Build and smoke-test the release candidate<\/span><\/li><li class="dg-stepper-item dg-stepper-item--done"><span class="dg-stepper-num">✓<\/span><span class="dg-stepper-text">Deploy to staging and verify health<\/span><\/li><li class="dg-stepper-item dg-stepper-item--current" aria-current="step"><span class="dg-stepper-num">3<\/span><span class="dg-stepper-text">Roll out to production at 2%<\/span><\/li><li class="dg-stepper-item dg-stepper-item--pending"><span class="dg-stepper-num">4<\/span><span class="dg-stepper-text">Monitor for 30 minutes before full traffic<\/span><\/li><\/ol>/,
    'releases show a step-marked progress stepper (current: 2 marks 2 done, 1 active, 1 pending)'
  );
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

test('every example DSL builds a page that passes the shared a11y gate', () => {
  // The GitHub Pages workflow (`.github/workflows/pages.yml`) rebuilds each
  // example with `dg build --check`, which exits 1 the moment checkA11y reports
  // a problem. A stale fragment in an example (the landing hero once linked
  // `#feature-grid` while the renderer emitted `#s-feature-grid`) would silently
  // break that gate in CI, so pin the invariant in the suite: each example's
  // output must satisfy every check, and the only permitted fragment refs are
  // ones whose targets the page actually declares.
  const examples = fs
    .readdirSync(EXAMPLE_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort();
  assert.ok(examples.length >= 5, `expected the five canonical examples, got ${examples.length}`);
  for (const file of examples) {
    const html = buildFixture(file.slice(0, -'.yaml'.length));
    const { problems } = checkA11y(html);
    assert.deepStrictEqual(problems, [], `a11y problems in examples/${file}`);
  }
});

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

test('chart start option treats nullish or blank values as absent, not a zero baseline', () => {
  // components.js renderChart: a whitespace start is truthy, so it used to
  // ship as data-chart-start="   ", where the runtime's Number('   ') === 0
  // fabricated a y-axis baseline of zero. Blank start is absent like a missing
  // one; a real zero and numeric strings still ship as attributes.
  const cases = [
    ['', false],
    ['   ', false],
    [null, false],
    [undefined, false],
    [0, true],
    ['0', true],
    [10, true],
    ['2024-01-01', true],
    // A boolean start is absent, not a baseline: String(true) === 'true' would
    // otherwise ship a data-chart-start="true" that the runtime's Number() turns
    // into NaN — a fabricated attribute carrying no usable baseline.
    [true, false],
    [false, false],
    // A non-finite numeric start is absent too: isNaN(Infinity) === false slips
    // it past an isNaN-style guard, but the runtime would keep the non-finite
    // baseline and the y-span computation degrades. Same class as the blank
    // string: no usable baseline, so no attribute.
    [Infinity, false],
    [-Infinity, false],
    [NaN, false],
  ];
  for (const [start, expected] of cases) {
    const html = renderHtml({
      title: 't',
      sections: [{
        content: [{ type: 'chart', kind: 'line', title: 'Price', ...(start === undefined ? {} : { start }), data: [['x', 1]] }],
      }],
    });
    const attr = html.match(/data-chart-start="([^"]*)"/);
    if (expected) {
      assert.ok(attr, `start ${JSON.stringify(start)} still emits the attribute`);
      assert.strictEqual(attr[1], String(start), `start ${JSON.stringify(start)} keeps its value`);
    } else {
      assert.ok(!attr, `blank/null start ${JSON.stringify(start)} emits no attribute`);
    }
  }
});

test('chart runtime treats absent category labels as no label, not literal text', () => {
  // toPoints builds every p.label through toLabel, the label-side mirror of
  // toNum: a nullish, blank, boolean, or non-finite category is no category.
  // Without it, String(p.label) in the line axis and ESC(p.label) in the bar
  // axis + <title> tooltip fabricated literal "null"/"undefined"/"true"/"NaN"
  // ticks from rows whose source label was missing. Real labels — text or
  // numeric years/timestamps — must survive untouched.
  const run = (store, type) => {
    const html = renderHtml({
      title: 't',
      sections: [{ content: [{ type: 'chart', kind: type, data: [['x', 1]] }] }],
    });
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const attrs = { 'data-chart-data': 'chart-0', 'data-chart-type': type, 'data-chart-title': 'T' };
    const figure = {
      getAttribute: (name) => (name in attrs ? attrs[name] : null),
      innerHTML: '',
    };
    new Function('window', 'document', script)(
      { __DG_DATA__: store },
      { readyState: 'complete', querySelectorAll: () => [figure], addEventListener: () => {} }
    );
    return figure.innerHTML;
  };

  const mixed = { 'chart-0': [['A', 1], [null, 2], [undefined, 3], ['', 4], ['  ', 5], [true, 6], ['B', 7]] };
  const line = run(mixed, 'line');
  assert.ok(
    !/>null<\/text>/.test(line) && !/>undefined<\/text>/.test(line) && !/>true<\/text>/.test(line) && !/>Infinity<\/text>/.test(line) && !/>NaN<\/text>/.test(line),
    'no literal coerced tick text from absent labels'
  );
  assert.match(line, /class="dg-axis dg-axis-x"[^>]*>A<\/text>/);
  assert.match(line, /class="dg-axis dg-axis-x"[^>]*>B<\/text>/);
  assert.strictEqual((line.match(/dg-axis-x/g) || []).length, 7, 'absent labels still occupy their slot as empty ticks');

  const bar = run(mixed, 'bar');
  assert.ok(
    !/<title>null /u.test(bar) && !/<title>undefined /u.test(bar) && !/<title>true /u.test(bar) && !/<title>Infinity /u.test(bar) && !/<title>NaN /u.test(bar),
    'no literal coerced bar tooltip text from absent labels'
  );
  assert.match(bar, /class="dg-axis dg-axis-x"[^>]*>A<\/text>/);
  assert.match(bar, /<title>A series1: 1<\/title>/);

  // numeric labels (years, timestamps) are real categories and must survive
  const numStore = { 'chart-0': [{ label: 2024, v: 1 }, { label: 2025, v: 2 }] };
  const numLine = run(numStore, 'line');
  assert.match(numLine, />2024<\/text>/);
  assert.match(numLine, />2025<\/text>/);
  // ...while non-finite numeric labels still degrade (object rows path)
  const nfStore = { 'chart-0': [{ label: Infinity, v: 1 }, { label: 'Q1', v: 2 }] };
  const nfLine = run(nfStore, 'line');
  assert.ok(!/>Infinity<\/text>/.test(nfLine), 'Infinity label degrades to an empty tick');
  assert.match(nfLine, />Q1<\/text>/);

  // pie drops blanked labels entirely instead of naming a slice after the
  // stringified absent value
  const pie = run({ 'chart-0': [['Organic', 45], [true, 10], [null, 9]] }, 'pie');
  assert.ok(pie.includes('>Organic<'), 'real pie slice name survives');
  assert.ok(!pie.includes('>true<') && !pie.includes('>null<'), 'absent pie labels drop entirely');
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

test('steps component renders a numbered procedure list with chips', () => {
  const html = renderHtml({
    title: 'runbook',
    sections: [{
      content: [{ type: 'steps', items: ['Assess blast radius.', 'Freeze deploys.'] }],
    }],
  });
  assert.match(
    html,
    /<ol class="dg-steps"><li class="dg-steps-item"><span class="dg-steps-num">1<\/span><span class="dg-steps-text">Assess blast radius\.<\/span><\/li><li class="dg-steps-item"><span class="dg-steps-num">2<\/span><span class="dg-steps-text">Freeze deploys\.<\/span><\/li><\/ol>/,
    'each item carries an explicit step number and its text'
  );
});

test('steps escapes item text and guards against a missing items array', () => {
  const html = renderHtml({
    title: 'runbook',
    sections: [{
      content: [
        { type: 'steps', items: ['Stage files: <src>/app.js & co'] },
        { type: 'steps' },
      ],
    }],
  });
  assert.match(html, /<span class="dg-steps-text">Stage files: &lt;src&gt;\/app\.js &amp; co<\/span>/);
  assert.match(html, /<ol class="dg-steps"><\/ol>/, 'missing items yields an empty list container');
});

test('steps drops blank and nullish items so the numbering stays dense', () => {
  const html = renderHtml({
    title: 'runbook',
    sections: [{ content: [
      { type: 'steps', items: ['Assess blast radius.', ' ', null, '  ', 'Freeze deploys.'] },
    ] }],
  });
  assert.match(
    html,
    /<ol class="dg-steps"><li class="dg-steps-item"><span class="dg-steps-num">1<\/span><span class="dg-steps-text">Assess blast radius\.<\/span><\/li><li class="dg-steps-item"><span class="dg-steps-num">2<\/span><span class="dg-steps-text">Freeze deploys\.<\/span><\/li><\/ol>/,
    'whitespace and nullish items degrade away, leaving dense 1..n numbering'
  );
});

test('kv component renders a definition list of key/value pairs', () => {
  const html = renderHtml({
    title: 'spec',
    sections: [{
      content: [
        { type: 'kv', items: [
          { key: 'Service', value: 'billing-worker' },
          { key: 'Revision', value: 'f3a9c21' },
        ] },
      ],
    }],
  });
  assert.match(
    html,
    /<dl class="dg-kv"><div class="dg-kv-row"><dt>Service<\/dt><dd>billing-worker<\/dd><\/div><div class="dg-kv-row"><dt>Revision<\/dt><dd>f3a9c21<\/dd><\/div><\/dl>/,
    'each item renders a dt term and a dd value'
  );
});

test('kv accepts label keys, escapes text, and guards against a missing items array', () => {
  const html = renderHtml({
    title: 'spec',
    sections: [{
      content: [
        { type: 'kv', items: [
          { label: 'Owner', value: 'Platform <team>' },
          'bare-string-item',
          { value: 'orphan value' },
        ] },
        { type: 'kv' },
      ],
    }],
  });
  assert.match(html, /<dt>Owner<\/dt><dd>Platform &lt;team&gt;<\/dd>/);
  assert.match(html, /<dt>bare-string-item<\/dt><dd><\/dd>/, 'a plain string item becomes a term with an empty value');
  assert.match(html, /<dt><\/dt><dd>orphan value<\/dd>/, 'an object item with no key or label still renders its value');
  assert.match(html, /<dl class="dg-kv"><\/dl>/, 'missing items yields an empty definition list');
});

test('kv drops nullish and blank rows without fabricating literal text', () => {
  // A bare null/undefined item used to reach String() and render a literal
  // <dt>null</dt>/<dt>undefined</dt> term; blank key+value pairs also kept a
  // dead row. Both degrade away like def-list, while the container and pairs
  // with any real content survive.
  const html = renderHtml({
    title: 'spec',
    sections: [{ content: [{ type: 'kv', items: [
      { key: 'Service', value: 'billing-worker' },
      null,
      undefined,
      { key: '  ', value: ' ' },
      { label: 'Revision', value: 'f3a9c21' },
    ] }] }],
  });
  assert.match(
    html,
    /<dl class="dg-kv"><div class="dg-kv-row"><dt>Service<\/dt><dd>billing-worker<\/dd><\/div><div class="dg-kv-row"><dt>Revision<\/dt><dd>f3a9c21<\/dd><\/div><\/dl>/,
    'real pairs survive while nullish and blank rows drop'
  );
  assert.ok(!html.includes('<dt>null</dt>') && !html.includes('<dt>undefined</dt>'), 'no literal null/undefined term text');
  assert.ok(!html.includes('dg-kv-row"><dt></dt><dd></dd>'), 'no dead row with blank key and value');
});

test('image component inlines an SVG file as a data URI with a labelled figure', () => {
  const fileDir = ExampleTmp();
  fs.writeFileSync(
    path.join(fileDir, 'badge.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0ea5e9"/></svg>'
  );
  const html = renderHtml(
    {
      title: 'imgs',
      sections: [{ content: [
        { type: 'image', file: 'badge.svg', caption: 'Env health' },
        { type: 'image', file: 'badge.svg', alt: 'Bare square', width: 40, height: 20 },
        { type: 'image', file: 'badge.svg' },
      ] }],
    },
    { fileDir }
  );
  assert.match(
    html,
    /<figure class="dg-figure dg-image" aria-label="Env health"><img src="data:image\/svg\+xml;utf8,[^"]+" alt="Env health"[^>]*><figcaption class="dg-image-caption">Env health<\/figcaption><\/figure>/,
    'SVG embeds as a text data URI inside a labelled figure'
  );
  // With no caption the image stays a plain <img> carrying its explicit alt;
  // width/height pass through as attributes.
  assert.match(
    html,
    /<img src="data:image\/svg\+xml;utf8,[^"]+" alt="Bare square" width="40" height="20">/,
    'an alt-only image stays a plain <img> and forwards width/height'
  );
  // A bare image with neither alt nor caption still emits alt (a11y check 5).
  assert.match(
    html,
    /<img src="data:image\/svg\+xml;utf8,[^"]+" alt="">(?![^<]*<figcaption)/,
    'missing alt and caption falls back to an empty alt attribute on a bare img'
  );
  assert.ok(html.split('data:image/svg+xml').length - 1 === 3, 'all three images embed the asset');
});

test('image component verifies the asset exists and supports raster mimes', () => {
  const fileDir = ExampleTmp();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>';
  fs.writeFileSync(path.join(fileDir, 'pixel.svg'), svg);
  fs.writeFileSync(path.join(fileDir, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  // Raster (png) embeds as base64 under the mapped mime.
  const raster = renderHtml(
    { title: 't', sections: [{ content: [{ type: 'image', file: 'pixel.png', alt: 'Pixel' }] }] },
    { fileDir }
  );
  assert.match(raster, /src="data:image\/png;base64,[^"]+"/, 'png maps to image/png base64');

  // Absolute paths resolve without fileDir.
  const abs = renderHtml(
    { title: 't', sections: [{ content: [{ type: 'image', file: path.join(fileDir, 'pixel.svg'), alt: 'A' }] }] },
    {}
  );
  assert.match(abs, /data:image\/svg\+xml;utf8,/);

  // Missing file, unsupported extension, and empty path all raise DataFileError.
  const missing = () =>
    renderHtml({ title: 't', sections: [{ content: [{ type: 'image', file: 'nope.png', alt: 'x' }] }] }, { fileDir });
  assert.throws(
    missing,
    (err) => err.name === 'DataFileError'
      && /Could not read image file "nope\.png" \(ENOENT\)/.test(err.message)
  );
  fs.writeFileSync(path.join(fileDir, 'blob.bmp'), 'x');
  assert.throws(
    () => renderHtml({ title: 't', sections: [{ content: [{ type: 'image', file: 'blob.bmp', alt: 'x' }] }] }, { fileDir }),
    (err) => err.name === 'DataFileError' && /Unsupported image extension "\.bmp"/.test(err.message)
  );
  assert.throws(
    () => renderHtml({ title: 't', sections: [{ content: [{ type: 'image', alt: 'x' }] }] }, { fileDir }),
    (err) => err.name === 'DataFileError' && /image "file" must be a non-empty path/.test(err.message)
  );
});

test('image with no fileDir resolves a relative file against the working directory', () => {
  // The fixture lives in the CWD because that is what a missing fileDir means:
  // the relative path joins onto ".".
  const rel = 'dg-img-rel-fixture.svg';
  fs.writeFileSync(rel, '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
  try {
    const html = renderHtml(
      { title: 't', sections: [{ content: [{ type: 'image', file: rel, alt: 'Rel' }] }] },
      {}
    );
    assert.match(html, /<img src="data:image\/svg\+xml;utf8,/i, 'relative file with no fileDir embeds from the working directory');
  } finally {
    fs.rmSync(rel);
  }
  assert.ok(!fs.existsSync(rel), 'fixture is cleaned up');
});

test('details renders a closed collapsible block and forwards nested components', () => {
  const html = renderHtml({
    title: 'details',
    sections: [{
      content: [{
        type: 'details',
        summary: 'Troubleshooting',
        content: [
          { type: 'paragraph', text: 'First line' },
          { type: 'badge', tone: 'warning', text: 'Check logs' },
        ],
      }],
    }],
  });
  assert.match(
    html,
    /<details class="dg-details"><summary class="dg-details-summary">Troubleshooting<\/summary>\n<div class="dg-details-body"><p class="dg-paragraph">First line<\/p>\n<span class="dg-badge dg-badge--warning">Check logs<\/span><\/div>\n<\/details>/,
    'a closed details nests full components in its body'
  );
  assert.ok(!/dg-details open/.test(html), 'no open attribute by default');
});

test('details honors open, title alias, text body, string content, and empty defaults', () => {
  const html = renderHtml({
    title: 'details',
    sections: [{
      content: [
        { type: 'details', title: 'Expanded', open: true, text: 'Plain body text.' },
        { type: 'details', summary: 'Shorthand', content: ['Just a line'] },
        { type: 'details', summary: 'Empty' },
      ],
    }],
  });
  assert.match(
    html,
    /<details class="dg-details" open><summary class="dg-details-summary">Expanded<\/summary>[\s\S]*<p class="dg-paragraph">Plain body text\.<\/p>/,
    'open renders the attribute and text renders a paragraph body'
  );
  assert.match(
    html,
    /<summary class="dg-details-summary">Shorthand<\/summary>[\s\S]*<p class="dg-paragraph">Just a line<\/p>/,
    'a string-only content array renders paragraph items'
  );
  assert.match(
    html,
    /<summary class="dg-details-summary">Empty<\/summary>\n<div class="dg-details-body"><p class="dg-paragraph">No content\.<\/p><\/div>/,
    'an empty details falls back to a No content note'
  );

  // Neither summary nor title: the toggle defaults to "Details".
  const dflt = renderHtml({
    title: 'details',
    sections: [{ content: [{ type: 'details', content: [{ type: 'badge', text: 'Tag' }] }] }],
  });
  assert.match(
    dflt,
    /<details class="dg-details"><summary class="dg-details-summary">Details<\/summary>[\s\S]*<span class="dg-badge dg-badge--neutral">Tag<\/span><\/div>\n<\/details>/,
    'a missing summary/title falls back to the plain Details label'
  );
});

test('tabs renders radio-based tabs, checks the default first tab, and nests components', () => {
  const html = renderHtml({
    title: 'tabs',
    sections: [{
      content: [{
        type: 'tabs',
        tabs: [
          { label: 'Overview', content: [{ type: 'paragraph', text: 'First pane' }] },
          { label: 'Details', content: [{ type: 'badge', tone: 'success', text: 'OK' }] },
        ],
      }],
    }],
  });
  assert.match(
    html,
    /<input type="radio" name="dg-tabs-\d+" id="dg-tabs-\d+-0" class="dg-tab-input" checked>[\s\S]*<label class="dg-tab-label" for="dg-tabs-\d+-0">Overview<\/label>/,
    'the first tab is checked by default'
  );
  assert.match(
    html,
    /<div class="dg-tab-panel"><p class="dg-paragraph">First pane<\/p>/,
    'a tab pane nests full components'
  );
  assert.match(
    html,
    /<label class="dg-tab-label" for="dg-tabs-\d+-1">Details<\/label>\n<div class="dg-tab-panel"><span class="dg-badge dg-badge--success">OK<\/span><\/div>/,
    'the second tab renders its label and body'
  );
  assert.strictEqual((html.match(/type="radio"/g) || []).length, 2, 'one radio per tab');
});

test('tabs honors active index, string labels, text bodies, and empty defaults', () => {
  const html = renderHtml({
    title: 'tabs',
    sections: [{
      content: [
        { type: 'tabs', active: 1, tabs: [{ label: 'A', text: 'Pane A' }, { label: 'B', text: 'Pane B' }] },
        { type: 'tabs', tabs: ['Plain'], active: 4 },
        { type: 'tabs', tabs: [{ label: 'Quiet', content: ['Line'] }] },
        { type: 'tabs' },
      ],
    }],
  });
  assert.match(
    html,
    /id="dg-tabs-\d+-1" class="dg-tab-input" checked>\n<label class="dg-tab-label" for="dg-tabs-\d+-1">B<\/label>\n<div class="dg-tab-panel"><p class="dg-paragraph">Pane B<\/p>/,
    'active: 1 checks the second tab and text renders a paragraph body'
  );
  assert.match(
    html,
    /<label class="dg-tab-label" for="dg-tabs-\d+-0">Plain<\/label>\n<div class="dg-tab-panel"><p class="dg-paragraph">No content\.<\/p>/,
    'a string-only tab falls back to a plain label with No content body'
  );
  assert.match(
    html,
    /<label class="dg-tab-label" for="dg-tabs-\d+-0">Quiet<\/label>\n<div class="dg-tab-panel"><p class="dg-paragraph">Line<\/p>/,
    'an out-of-range active index and string-only content still work'
  );
  assert.match(
    html,
    /<label class="dg-tab-label" for="dg-tabs-\d+-0">Tab 1<\/label>\n<div class="dg-tab-panel"><p class="dg-paragraph">No content\.<\/p>/,
    'with no tabs array a single Tab 1 fallback renders a No content body'
  );
});

test('stat-list renders a KPI row table with caption, prefix/suffix and delta tones', () => {
  const html = renderHtml({
    title: 'stats',
    sections: [{
      content: [{
        type: 'stat-list',
        caption: 'Cluster health',
        items: [
          { label: 'Nodes', value: 12, delta: { value: 3, tone: 'good' } },
          { label: 'CPU', value: '42', suffix: '%', delta: { value: 1.5, tone: 'bad' } },
          { label: 'Cost', prefix: '$', value: '1.2k', delta: { value: 0, tone: 'neutral' } },
          { label: 'Uptime', value: '99.9', suffix: '%' },
        ],
      }],
    }],
  });
  assert.match(
    html,
    /<div class="dg-scroll"><table class="dg-statlist" aria-label="Cluster health"><tbody>\n/,
    'caption names the stat-list table'
  );
  assert.match(
    html,
    /<tr class="dg-statlist-row"><th scope="row">Nodes<\/th><td class="dg-statlist-value">12<\/td><td class="dg-statlist-delta dg-statlist-delta--good">▲ 3<\/td><\/tr>/,
    'good delta renders green with an up arrow'
  );
  assert.match(
    html,
    /<tr class="dg-statlist-row"><th scope="row">CPU<\/th><td class="dg-statlist-value">42%<\/td><td class="dg-statlist-delta dg-statlist-delta--bad">▲ 1\.5<\/td><\/tr>/,
    'suffix joins the value and bad tone colors the delta'
  );
  assert.match(
    html,
    /<tr class="dg-statlist-row"><th scope="row">Cost<\/th><td class="dg-statlist-value">\$1\.2k<\/td><td class="dg-statlist-delta dg-statlist-delta--neutral">0<\/td><\/tr>/,
    'prefix joins the value and a zero delta renders bare with neutral tone'
  );
  assert.match(
    html,
    /<tr class="dg-statlist-row"><th scope="row">Uptime<\/th><td class="dg-statlist-value">99\.9%<\/td><\/tr>/,
    'a row without delta renders no delta cell'
  );
});

test('stat-list degrades without caption or items and escapes row fields', () => {
  const html = renderHtml({
    title: 'stats',
    sections: [{
      content: [
        { type: 'stat-list', items: [{ label: '<hr>', value: 'a<b', delta: '5' }] },
        { type: 'stat-list' },
        { type: 'stat-list', items: 'nope' },
        { type: 'stat-list', items: [{ title: 'Title-only row', value: '7' }] },
        { type: 'stat-list', items: [{ prefix: '#', value: '9' }] },
        { type: 'stat-list', items: ['plain-string row'] },
      ],
    }],
  });
  assert.ok(!/>aria-label=/.test(html), 'no caption means no aria-label on the table');
  assert.match(
    html,
    /<th scope="row">&lt;hr&gt;<\/th><td class="dg-statlist-value">a&lt;b<\/td><td class="dg-statlist-delta dg-statlist-delta--neutral">▲ 5<\/td>/,
    'labels and values are escaped and a numeric-string delta renders neutral'
  );
  assert.match(html, /<td class="dg-note" colspan="3">No data to draw\.<\/td>/, 'empty stat-list writes a no-data note');
  const tables = html.match(/class="dg-statlist"/g) || [];
  assert.strictEqual(tables.length, 6, 'a non-array items list still renders a table shell');
  assert.match(
    html,
    /<tr class="dg-statlist-row"><th scope="row">Title-only row<\/th><td class="dg-statlist-value">7<\/td><\/tr>/,
    'an item with title (no label) uses title as the row label'
  );
  assert.match(
    html,
    /<tr class="dg-statlist-row"><th scope="row"><\/th><td class="dg-statlist-value">#9<\/td><\/tr>/,
    'an object item with no label or title renders an empty label with its prefix and value'
  );
  assert.match(
    html,
    /<tr class="dg-statlist-row"><th scope="row">plain-string row<\/th><td class="dg-statlist-value"><\/td><\/tr>/,
    'a string item renders a label row with an empty value and no delta cell'
  );
});

test('toc renders ordered links to every titled section with shared anchors', () => {
  // A toc block lists every titled section as a link to the page's collision-free
  // s-<slug> anchors (the same ids the section titles and auto nav use), so the
  // contents nav always resolves. `label` names the landmark; without one the
  // fallback "Contents" keeps the <nav> compliant with the a11y nav rule.
  const doc = {
    title: 'toc',
    sections: [
      { title: 'Overview', content: [{ type: 'paragraph', text: 'a' }] },
      { title: 'Deep Dive', content: [{ type: 'paragraph', text: 'b' }] },
      { title: 'Overview', content: [{ type: 'toc', label: 'Jump to' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.match(
    html,
    /<nav class="dg-toc" aria-label="Jump to"><ul><li><a class="dg-toc-link" href="#s-overview">Overview<\/a><\/li><li><a class="dg-toc-link" href="#s-deep-dive">Deep Dive<\/a><\/li><li><a class="dg-toc-link" href="#s-overview-2">Overview<\/a><\/li><\/ul><\/nav>/,
    'toc links every section with the deduped shared anchors'
  );
  // The toc anchors resolve: each href id exists on a section title.
  const hrefs = [...html.matchAll(/<a class="dg-toc-link" href="#([^"]+)"/g)].map((m) => m[1]);
  for (const h of hrefs) {
    assert.ok(html.includes(`id="${h}"`), `toc link #${h} resolves to a section title`);
  }
});

test('toc defaults its aria-label, escapes titles, and degrades to nothing', () => {
  // Without `label` the contents nav is still announced (a11y requires every
  // <nav> to carry an aria-label); titles are escaped like all user text; and a
  // page with no titled sections renders nothing for the toc (mirroring the auto
  // nav, which also only appears when there is a section to link).
  const html = renderHtml({
    title: 'toc',
    sections: [{ title: 'Run <book>', content: [{ type: 'toc' }] }],
  });
  assert.match(
    html,
    /<nav class="dg-toc" aria-label="Contents"><ul><li><a class="dg-toc-link" href="#s-run-book">Run &lt;book&gt;<\/a><\/li><\/ul><\/nav>/,
    'escaped title links out under the default Contents label'
  );
  // A toc block whose sections all lack titles still renders nothing (the links
  // list is empty), so the block degrades away instead of emitting dead markup.
  const empty = renderHtml({
    title: 'toc',
    sections: [{ content: [{ type: 'paragraph', text: 'a' }, { type: 'toc' }] }],
  });
  assert.ok(!empty.includes('<nav class="dg-toc"'), 'no titled sections renders no toc block');
  const untitled = renderHtml({ title: 'toc' });
  assert.ok(!untitled.includes('<nav class="dg-toc"'), 'no sections key renders no toc block');
});

test('toc in a hero reflects the page sections', () => {
  // The hero content shares the same state.sections/sectionAnchors threading as
  // the layout widgets, so a toc block placed in the hero lists the page too.
  const doc = {
    title: 'toc-hero',
    hero: [{ type: 'toc' }],
    sections: [
      { title: 'Alpha', content: [{ type: 'paragraph', text: 'a' }] },
      { title: 'Beta', content: [{ type: 'paragraph', text: 'b' }] },
    ],
  };
  const html = renderHtml(doc);
  assert.match(
    html,
    /<nav class="dg-toc" aria-label="Contents"><ul><li><a class="dg-toc-link" href="#s-alpha">Alpha<\/a><\/li><li><a class="dg-toc-link" href="#s-beta">Beta<\/a><\/li><\/ul><\/nav>/,
    'hero toc links every section'
  );
});

test('checklist renders done and pending items with state markers', () => {
  // A checklist is a static status list: each item gets a state class and a
  // glyph marker (✓ done, ○ pending) in the DOM — the same way stat deltas
  // carry ▲/▼ — so the state is visible without any interactive checkbox
  // semantics or JS. Object items with `done: true` land in the done state;
  // bare-string items default to pending.
  const html = renderHtml({
    title: 'checklist',
    sections: [{
      content: [{
        type: 'checklist',
        items: [
          { text: 'Queue drained', done: true },
          { text: 'Healthz green' },
          'On-call notified',
          { text: 'Review scheduled', done: false },
        ],
      }],
    }],
  });
  assert.match(
    html,
    /<ul class="dg-checklist"><li class="dg-checklist-item dg-checklist-item--done"><span class="dg-checklist-mark">✓<\/span><span class="dg-checklist-text">Queue drained<\/span><\/li><li class="dg-checklist-item dg-checklist-item--pending"><span class="dg-checklist-mark">○<\/span><span class="dg-checklist-text">Healthz green<\/span><\/li><li class="dg-checklist-item dg-checklist-item--pending"><span class="dg-checklist-mark">○<\/span><span class="dg-checklist-text">On-call notified<\/span><\/li><li class="dg-checklist-item dg-checklist-item--pending"><span class="dg-checklist-mark">○<\/span><span class="dg-checklist-text">Review scheduled<\/span><\/li><\/ul>/,
    'done items carry ✓ markers, pending strings and objects carry ○ markers'
  );
});

test('checklist escapes texts, drops blank entries, and degrades to nothing', () => {
  // Item text is escaped like all user text; empty-string items and non-string
  // scalars fall away (so an object missing `text` never emits a bare li); and
  // when no usable entries remain the whole block renders nothing instead of
  // dead markup. A missing `items` key likewise degrades away.
  const html = renderHtml({
    title: 'checklist',
    sections: [{
      content: [{
        type: 'checklist',
        items: ['Clean <queue>', { text: '' }, 42, null, { text: 'Logs archived', done: true }],
      }],
    }],
  });
  assert.match(
    html,
    /<ul class="dg-checklist"><li class="dg-checklist-item dg-checklist-item--pending"><span class="dg-checklist-mark">○<\/span><span class="dg-checklist-text">Clean &lt;queue&gt;<\/span><\/li><li class="dg-checklist-item dg-checklist-item--done"><span class="dg-checklist-mark">✓<\/span><span class="dg-checklist-text">Logs archived<\/span><\/li><\/ul>/,
    'markup-anchored: escaped text plus only the non-empty entries survive'
  );
  const empty = renderHtml({
    title: 'checklist',
    sections: [{ content: [{ type: 'checklist', items: [{}, ' ', { text: '' }] }] }],
  });
  assert.ok(!empty.includes('<ul class="dg-checklist"'), 'all-blank items render no checklist');
  const missing = renderHtml({ title: 'checklist', sections: [{ content: [{ type: 'checklist' }] }] });
  assert.ok(!missing.includes('<ul class="dg-checklist"'), 'missing items renders no checklist');
});

test('footnote renders a small-print end note with the doc-footnote role', () => {
  // A footnote is a muted <aside> named "Footnote" by default so the note is
  // discoverable by assistive tech; `label` names it, and the text is escaped
  // like all user text. This mirrors callout's role="note" pattern.
  const html = renderHtml({
    title: 'footnote',
    sections: [{ content: [{ type: 'footnote', text: 'Costs assume <SSD> unless stated.' }] }],
  });
  assert.match(
    html,
    /<aside class="dg-footnote" role="doc-footnote" aria-label="Footnote">Costs assume &lt;SSD&gt; unless stated\.<\/aside>/,
    'default Footnote label, escaped body'
  );
  const labelled = renderHtml({
    title: 'footnote',
    sections: [{ content: [{ type: 'footnote', label: 'Sizing note', text: 'One unit = 1 GiB.' }] }],
  });
  assert.match(
    labelled,
    /<aside class="dg-footnote" role="doc-footnote" aria-label="Sizing note">One unit = 1 GiB\.<\/aside>/,
    'explicit label names the footnote'
  );
  // A footnote with no usable text renders nothing (dead markup is worse than
  // no note when the source row is empty).
  const blank = renderHtml({
    title: 'footnote',
    sections: [{ content: [{ type: 'footnote', text: '   ' }] }],
  });
  assert.ok(!blank.includes('<aside class="dg-footnote"'), 'whitespace-only footnote renders nothing');
  const missing = renderHtml({ title: 'footnote', sections: [{ content: [{ type: 'footnote' }] }] });
  assert.ok(!missing.includes('<aside class="dg-footnote"'), 'missing text renders nothing');
});

test('timeline renders a time-stamped chronological event log', () => {
  // A timeline is a vertical log of { time, text } entries; a machine-readable
  // stamp becomes a semantic <time> (so assistive tech can cite the instant),
  // anything else stays inert text. The optional `title` heads the list.
  const html = renderHtml({
    title: 'timeline',
    sections: [{ content: [{ type: 'timeline', title: 'Incident', items: [
      { time: '09:14', text: 'Alert fires' },
      { time: '9:05:07', text: 'With seconds' },
      { time: '2026-11-17T09:17:00Z', text: 'Acknowledged' },
      { time: '2026-11-18', text: 'Bare date' },
      { time: 'soon', text: 'Window closes' },
      'No stamp entry',
    ] }] }],
  });
  assert.match(
    html,
    /<div class="dg-timeline"><div class="dg-timeline-title">Incident<\/div><ul class="dg-timeline-list">[\s\S]*<time class="dg-timeline-time" datetime="09:14">09:14<\/time><span class="dg-timeline-text">Alert fires<\/span><\/li>[\s\S]*<time class="dg-timeline-time" datetime="09:05:07">9:05:07<\/time><span class="dg-timeline-text">With seconds<\/span><\/li>[\s\S]*<time class="dg-timeline-time" datetime="2026-11-17T09:17:00Z">2026-11-17T09:17:00Z<\/time><span class="dg-timeline-text">Acknowledged<\/span><\/li>[\s\S]*<time class="dg-timeline-time" datetime="2026-11-18">2026-11-18<\/time><span class="dg-timeline-text">Bare date<\/span><\/li>[\s\S]*<span class="dg-timeline-time">soon<\/span><span class="dg-timeline-text">Window closes<\/span><\/li>[\s\S]*<li class="dg-timeline-item"><span class="dg-timeline-text">No stamp entry<\/span><\/li>[\s\S]*<\/ul><\/div>/,
    'timeline renders title, semantic <time> stamps, inert-text stamps, and unstamped strings'
  );
  // No title -> the list stands alone without a heading div.
  const bare = renderHtml({
    title: 'timeline',
    sections: [{ content: [{ type: 'timeline', items: [{ time: '10:05', text: 'Closed' }] }] }],
  });
  assert.match(
    bare,
    /<div class="dg-timeline"><ul class="dg-timeline-list"><li class="dg-timeline-item"><time class="dg-timeline-time" datetime="10:05">10:05<\/time><span class="dg-timeline-text">Closed<\/span><\/li><\/ul><\/div>/,
    'timeline renders with a default aria-label and text'
  );
});

test('timeline escapes entries, drops blanks, and degrades to nothing', () => {
  // User text (time and body) is escaped; blank bodies, non-object scalars,
  // a whitespace-only body, and all-empty/missing items render nothing rather
  // than dead markup or a "null" literal.
  const html = renderHtml({
    title: 'timeline',
    sections: [{ content: [{ type: 'timeline', items: [
      { time: '09:00', text: 'Page <ops> & fleet' },
      { time: '09:01', text: '  ' },
      { time: '09:02', text: '' },
      42,
      null,
      { text: 'Unstamped <event>' },
    ] }] }],
  });
  assert.match(
    html,
    /<time class="dg-timeline-time" datetime="09:00">09:00<\/time><span class="dg-timeline-text">Page &lt;ops&gt; &amp; fleet<\/span>/,
    'time and body text are escaped'
  );
  assert.match(
    html,
    /<li class="dg-timeline-item"><span class="dg-timeline-text">Unstamped &lt;event&gt;<\/span><\/li>/,
    'object without time renders an unstamped entry'
  );
  const entries = html.match(/class="dg-timeline-item"/g) || [];
  assert.strictEqual(entries.length, 2, 'blank bodies and scalar items are dropped');
  const noItems = renderHtml({ title: 'timeline', sections: [{ content: [{ type: 'timeline' }] }] });
  assert.ok(!noItems.includes('<ul class="dg-timeline-list"'), 'missing items render no timeline');
  const allBlank = renderHtml({
    title: 'timeline',
    sections: [{ content: [{ type: 'timeline', items: [{ time: '09:00', text: ' ' }, ''] }] }],
  });
  assert.ok(!allBlank.includes('<ul class="dg-timeline-list"'), 'all-blank items render no timeline');
});

test('def-list renders a plain definition list of key/value pairs', () => {
  // Unlike kv, def-list has no bordered band — it is a <dl> for running prose.
  // Each item is { key, value } (key aliased by label); the pairing stays in
  // the DOM as <dt>/<dd> for assistive tech.
  const html = renderHtml({
    title: 'def-list',
    sections: [{ content: [{ type: 'def-list', items: [
      { key: 'Owner', value: 'Platform' },
      { label: 'Rollout', value: 'canary' },
      { key: 'Window' },
    ] }] }],
  });
  assert.match(
    html,
    /<dl class="dg-def-list"><div class="dg-def-list-row"><dt>Owner<\/dt><dd>Platform<\/dd><\/div><div class="dg-def-list-row"><dt>Rollout<\/dt><dd>canary<\/dd><\/div><div class="dg-def-list-row"><dt>Window<\/dt><dd><\/dd><\/div><\/dl>/,
    'def-list renders key/value (and label-aliased) rows; a term-only row keeps an empty <dd>'
  );
});

test('def-list escapes text, drops blanks, and degrades to nothing', () => {
  // User text is escaped; rows with an empty/whitespace-only key AND value, or
  // scalar null/undefined items, are dropped; an all-empty or missing items
  // list renders nothing (unlike kv, which keeps an empty container).
  const html = renderHtml({
    title: 'def-list',
    sections: [{ content: [{ type: 'def-list', items: [
      { key: 'A & B', value: '<ops>' },
      { key: ' ', value: '' },
      { key: '', value: '  ' },
      null,
      undefined,
      'stray',
    ] }] }],
  });
  assert.match(
    html,
    /<dt>A &amp; B<\/dt><dd>&lt;ops&gt;<\/dd>/,
    'def-list escapes term and value text'
  );
  assert.match(
    html,
    /<dt>stray<\/dt><dd><\/dd>/,
    'a plain string becomes a term-only row (kv-parity)'
  );
  const rows = html.match(/class="dg-def-list-row"/g) || [];
  assert.strictEqual(rows.length, 2, 'only the escaped and stray rows survive');
  const noItems = renderHtml({ title: 'def-list', sections: [{ content: [{ type: 'def-list' }] }] });
  assert.ok(!noItems.includes('<dl class="dg-def-list">'), 'missing items render no def-list');
  const allBlank = renderHtml({
    title: 'def-list',
    sections: [{ content: [{ type: 'def-list', items: [{ key: ' ', value: '' }] }] }],
  });
  assert.ok(!allBlank.includes('<dl class="dg-def-list">'), 'all-blank items render no def-list');
});

test('stepper renders a step-marked progress bar from a 0-based current index', () => {
  // Stepper fuses steps' chip numerals with a progress band: earlier steps are
  // done, the `current` step is highlighted (aria-current), later steps stay
  // pending — distinct from steps, which shows plain numbers with no state.
  const html = renderHtml({
    title: 'stepper',
    sections: [{ content: [{ type: 'stepper', current: 1, items: [
      'Build the release candidate',
      'Deploy to staging and verify health',
      'Roll out to production',
      'Monitor before full traffic',
    ] }] }],
  });
  assert.match(
    html,
    /<ol class="dg-stepper"><li class="dg-stepper-item dg-stepper-item--done"><span class="dg-stepper-num">✓<\/span><span class="dg-stepper-text">Build the release candidate<\/span><\/li><li class="dg-stepper-item dg-stepper-item--current" aria-current="step"><span class="dg-stepper-num">2<\/span><span class="dg-stepper-text">Deploy to staging and verify health<\/span><\/li><li class="dg-stepper-item dg-stepper-item--pending"><span class="dg-stepper-num">3<\/span><span class="dg-stepper-text">Roll out to production<\/span><\/li><li class="dg-stepper-item dg-stepper-item--pending"><span class="dg-stepper-num">4<\/span><span class="dg-stepper-text">Monitor before full traffic<\/span><\/li><\/ol>/,
    'stepper marks done/current/pending by the current index'
  );
  assert.match(html, /class="dg-stepper"/, 'stepper reuses a numbered <ol> like steps');
  const stepsHtml = renderHtml({
    title: 'steps',
    sections: [{ content: [{ type: 'steps', items: ['A', 'B', 'C'] }] }],
  });
  assert.match(stepsHtml, /<ol class="dg-steps">/, 'steps keeps its distinct renderer');
  assert.ok(!stepsHtml.includes('<ol class="dg-stepper">'), 'steps render no progress state');
});

test('stepper escapes text, drops blanks, and degrades to nothing', () => {
  const html = renderHtml({
    title: 'stepper',
    sections: [{ content: [{ type: 'stepper', current: 0, items: [
      'A & B <team>',
      '  ',
      null,
      undefined,
      'Tail',
    ] }] }],
  });
  assert.match(
    html,
    /<span class="dg-stepper-text">A &amp; B &lt;team&gt;<\/span>/,
    'stepper escapes step text'
  );
  assert.match(
    html,
    /<li class="dg-stepper-item dg-stepper-item--current" aria-current="step"><span class="dg-stepper-num">1<\/span>/,
    'current still resolves after leading blanks drop'
  );
  const items = html.match(/<li class="dg-stepper-item/g) || [];
  assert.strictEqual(items.length, 2, 'only the non-blank tail survives');
  const noItems = renderHtml({ title: 'stepper', sections: [{ content: [{ type: 'stepper', current: 0 }] }] });
  assert.ok(!noItems.includes('<ol class="dg-stepper">'), 'missing items render no stepper');
  const allBlank = renderHtml({
    title: 'stepper',
    sections: [{ content: [{ type: 'stepper', current: 0, items: [' ', ''] }] }],
  });
  assert.ok(!allBlank.includes('<ol class="dg-stepper">'), 'all-blank items render no stepper');
});

test('stepper without a valid current index renders a plain numbered stepper', () => {
  for (const current of [undefined, -1, 9, '1', null]) {
    const html = renderHtml({
      title: 'stepper',
      sections: [{ content: [{ type: 'stepper', current, items: ['One', 'Two'] }] }],
    });
    assert.match(
      html,
      /<ol class="dg-stepper"><li class="dg-stepper-item dg-stepper-item--pending"><span class="dg-stepper-num">1<\/span><span class="dg-stepper-text">One<\/span><\/li><li class="dg-stepper-item dg-stepper-item--pending"><span class="dg-stepper-num">2<\/span><span class="dg-stepper-text">Two<\/span><\/li><\/ol>/,
      `current=${current} leaves every step pending`
    );
    assert.ok(!html.includes('aria-current'), 'no step claims the current position');
  }
});

test('sparkline renders a build-time SVG trend from numeric row shapes', () => {
  // Sparkline draws a static inline-SVG line + end dot at build time — no
  // runtime hydration (unlike chart), with the figure labelled like a stat
  // (role="img" + aria-label, a11y check 6) while the SVG stays decorative.
  const html = renderHtml({
    title: 'sparkline',
    sections: [{ content: [
      { type: 'sparkline', title: 'Requests', caption: 'Per minute', data: [3, 9, 6, 12] },
    ] }],
  });
  assert.match(
    html,
    /<div class="dg-figure dg-sparkline" role="img" aria-label="Per minute">\n<div class="dg-sparkline-title">Requests<\/div>\n/,
    'sparkline opens as a labelled figure with a title'
  );
  assert.match(
    html,
    /<svg class="dg-sparkline-svg" viewBox="0 0 100 32" aria-hidden="true" focusable="false">/,
    'sparkline embeds a decorative build-time svg'
  );
  assert.match(
    html,
    /<path class="dg-sparkline-line" d="M 0 29L 33\.3 ([\d.]+)L 66\.7 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'four points draw a polyline across the full viewBox width'
  );
  assert.match(html, /<circle class="dg-sparkline-dot" cx="100" cy="([\d.]+)" r="2\.5"\/>/, 'end dot sits at the last point');
  assert.match(html, /<p class="dg-note dg-sparkline-cap">Per minute<\/p>/, 'caption renders as a note line');
});

test('sparkline maps every chart value shape, centers a lone value, and degrades without data', () => {
  const paired = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [
      ['Mon', 2], ['Tue', '5'], { label: 'Wed', value: 8 }, { value: 11 }, { label: 'Gap' }, [7],
    ] }] }],
  });
  assert.match(
    paired,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 25 ([\d.]+)L 50 ([\d.]+)L 75 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'pairs, strings, and { value } rows all plot as numbers'
  );
  assert.match(paired, /<circle class="dg-sparkline-dot" cx="100" /, 'multi-value series still draws its end dot');
  const single = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', title: 'Ping', data: [42] }] }],
  });
  assert.match(single, /<circle class="dg-sparkline-dot" cx="50" cy="([\d.]+)" r="2\.5"\/>/, 'a single point centers horizontally');
  assert.ok(!single.includes('class="dg-sparkline-line"'), 'a single point draws no line');

  const noData = renderHtml({ title: 'sparkline', sections: [{ content: [{ type: 'sparkline', title: 'Delays' }] }] });
  assert.match(noData, /<p class="dg-note">No data to draw\.<\/p>/, 'missing data shows the no-data note');
  assert.ok(!noData.includes('class="dg-sparkline-svg"'), 'empty data renders no sparkline svg');
  assert.match(noData, /aria-label="Delays"/, 'no-data figure keeps its accessible name');
  const allBad = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: ['x', 'y', 'HC1'] }] }],
  });
  assert.ok(!allBad.includes('class="dg-sparkline-svg"'), 'all-non-numeric data renders no sparkline svg');
  const notAnArray = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: '1,2,3' }] }],
  });
  assert.ok(!notAnArray.includes('class="dg-sparkline-svg"'), 'non-array data renders no sparkline svg');
});

test('sparkline escapes title and caption, and flat series keeps a visible line', () => {
  const html = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', title: 'A & B <team>', caption: 'Q1 <2026>', data: [5, 5, 5] }] }],
  });
  assert.match(html, /<div class="dg-sparkline-title">A &amp; B &lt;team&gt;<\/div>/, 'title is escaped');
  assert.match(html, /<p class="dg-note dg-sparkline-cap">Q1 &lt;2026&gt;<\/p>/, 'caption is escaped');
  assert.match(
    html,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 50 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'a flat series still draws a line (range clamps to 1)'
  );
  assert.match(html, /aria-label="Q1 &lt;2026&gt;"/, 'figure label prefers the caption');
});

test('sparkline drops nullish and blank entries instead of plotting fabricated zero readings', () => {
  // A nullish or blank entry is an absent data point — the project treats
  // null/'' as missing everywhere (table cells, list items, stat delta) — so
  // it must drop like undefined does, never coerce Number(null) === 0 into a
  // fake zero dip. Real zero readings still plot, and a [label, value] row
  // whose value is nullish drops as a whole rather than resurrecting the
  // numeric label as a reading.
  const sparse = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [3, null, 6] }] }],
  });
  assert.match(
    sparse,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'a null entry drops so the remaining 3 and 6 draw a two-point edge-to-edge line, no zero dip at x=50'
  );
  const blank = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [3, '', 6] }] }],
  });
  assert.match(
    blank,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'an empty-string entry drops rather than coercing Number("") === 0'
  );
  const blankSpace = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [3, '  ', 6] }] }],
  });
  assert.match(
    blankSpace,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'a whitespace-only entry is blank and drops too'
  );
  const allNull = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [null] }] }],
  });
  assert.match(allNull, /<p class="dg-note">No data to draw\.<\/p>/, 'all-null data shows the no-data note');
  assert.ok(!allNull.includes('class="dg-sparkline-svg"'), 'all-null data renders no sparkline svg');
  const nullishPair = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [[2024, null], [2025, 2]] }] }],
  });
  assert.ok(!nullishPair.includes('class="dg-sparkline-line"'), 'a [label, null] row drops as a whole instead of plotting the numeric 2024 label as a reading');
  assert.match(nullishPair, /<circle class="dg-sparkline-dot" cx="50" /, 'only the surviving [2025, 2] point remains, centered');
  const realZero = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [8, 0, 4] }] }],
  });
  assert.match(
    realZero,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 50 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'a real zero reading still plots as a point, only nullish/blank entries are absent'
  );
  // A boolean is absent, not a reading: Number(true) === 1 would otherwise
  // fabricate a fake low point. [3, true, 6] plots only the two real points.
  const bool = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [3, true, 6] }] }],
  });
  assert.match(
    bool,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'a boolean entry drops like a nullish/blank one, no fabricated low dip'
  );
  // A non-finite numeric entry is absent too: isNaN(Infinity) === false would
  // slide it past an isNaN-style guard, then Math.min/max spread a NaN span
  // and every plotted y-coordinate goes NaN. sparklineValues gates on
  // Number.isFinite, so Infinity/-Infinity/NaN entries drop like nullish ones
  // and only the finite core plots.
  const nonFinite = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [1, Infinity, -Infinity, NaN, 5] }] }],
  });
  assert.match(
    nonFinite,
    /<path class="dg-sparkline-line" d="M 0 ([\d.]+)L 100 ([\d.]+)"\/>/,
    'non-finite entries drop so the surviving 1 and 5 draw a two-point edge-to-edge line'
  );
  const allNonFinite = renderHtml({
    title: 'sparkline',
    sections: [{ content: [{ type: 'sparkline', data: [Infinity, -Infinity, NaN] }] }],
  });
  assert.match(allNonFinite, /<p class="dg-note">No data to draw\.<\/p>/, 'all-non-finite data shows the no-data note');
  assert.ok(!allNonFinite.includes('class="dg-sparkline-svg"'), 'all-non-finite data renders no sparkline svg');
});

test('status renders a service-health list with the state spelled as text', () => {
  // Status is a static list of services and their last-known state; the state
  // is always visible text (never color-only, a11y check 6) with the dot a
  // decorative aria-hidden marker, so the strip reads without color or JS.
  const html = renderHtml({
    title: 'status',
    sections: [{ content: [{ type: 'status', title: 'Environment health', items: [
      { name: 'Production API', state: 'healthy', detail: 'p99 43ms' },
      { name: 'Billing worker', state: 'degraded' },
      'EU database primary',
    ] }] }],
  });
  assert.match(html, /<div class="dg-status"><div class="dg-status-title">Environment health<\/div><ul class="dg-status-list">/, 'opens with a title and semantic list');
  assert.match(
    html,
    /<li class="dg-status-item dg-status-item--healthy"><span class="dg-status-dot dg-status-dot--healthy" aria-hidden="true"><\/span><span class="dg-status-name">Production API<\/span><span class="dg-status-state dg-status-state--healthy">Healthy<\/span><span class="dg-status-detail">p99 43ms<\/span><\/li>/,
    'healthy item spells its state and keeps the dot decorative'
  );
  assert.match(
    html,
    /<li class="dg-status-item dg-status-item--degraded"><span class="dg-status-dot dg-status-dot--degraded" aria-hidden="true"><\/span><span class="dg-status-name">Billing worker<\/span><span class="dg-status-state dg-status-state--degraded">Degraded<\/span><\/li>/,
    'degraded item omits detail when absent'
  );
  assert.match(
    html,
    /<li class="dg-status-item dg-status-item--unknown"><span class="dg-status-dot dg-status-dot--unknown" aria-hidden="true"><\/span><span class="dg-status-name">EU database primary<\/span><span class="dg-status-state dg-status-state--unknown">Unknown<\/span><\/li>/,
    'a bare string item defaults to an unknown state'
  );
});

test('status treats a missing or null named state as unknown', () => {
  const html = renderHtml({
    title: 'status',
    sections: [{ content: [{ type: 'status', items: [
      { name: 'Cassandra', detail: 'no state reported' },
      { name: 'Redis', state: null },
    ] }] }],
  });
  assert.match(
    html,
    /<span class="dg-status-name">Cassandra<\/span><span class="dg-status-state dg-status-state--unknown">Unknown<\/span><span class="dg-status-detail">no state reported<\/span>/,
    'an item with no state key reads Unknown while keeping its detail'
  );
  assert.match(
    html,
    /<span class="dg-status-name">Redis<\/span><span class="dg-status-state dg-status-state--unknown">Unknown<\/span>/,
    'an explicit null state also reads Unknown'
  );
});

test('status normalizes aliases, unknown states, and degrades away when empty', () => {
  const html = renderHtml({
    title: 'status',
    sections: [{ content: [{ type: 'status', items: [
      { service: 'Search index', state: 'MAINTENANCE' },
      { name: 'Log pipeline', state: 'flapping', detail: 'restart loop' },
      { name: '', state: 'down' },
      ' ',
    ] }] }],
  });
  assert.match(
    html,
    /<span class="dg-status-name">Search index<\/span><span class="dg-status-state dg-status-state--maintenance">Maintenance<\/span>/,
    '`service` aliases `name` and state normalizes case'
  );
  assert.match(
    html,
    /<span class="dg-status-name">Log pipeline<\/span><span class="dg-status-state dg-status-state--unknown">flapping<\/span><span class="dg-status-detail">restart loop<\/span>/,
    'an unrecognized state surfaces its raw text as the label'
  );
  assert.ok(!html.includes('dg-status-item--down'), 'blank/non-object items drop out');

  const missing = renderHtml({ title: 'status', sections: [{ content: [{ type: 'status' }] }] });
  assert.ok(!missing.includes('class="dg-status"'), 'missing items render no list');
  const nonArray = renderHtml({ title: 'status', sections: [{ content: [{ type: 'status', items: 'probe' }] }] });
  assert.ok(!nonArray.includes('class="dg-status"'), 'non-array items render no list');
});

test('status escapes names, details, and unknown state text', () => {
  const html = renderHtml({
    title: 'status',
    sections: [{ content: [{ type: 'status', items: [
      { name: 'A & B <team>', state: 'weird <flag>', detail: 'Q1 <2026>' },
    ] }] }],
  });
  assert.match(html, /<span class="dg-status-name">A &amp; B &lt;team&gt;<\/span>/, 'name is escaped');
  assert.match(html, /<span class="dg-status-state dg-status-state--unknown">weird &lt;flag&gt;<\/span>/, 'unknown state text is escaped');
  assert.match(html, /<span class="dg-status-detail">Q1 &lt;2026&gt;<\/span>/, 'detail is escaped');
});

test('status renders as a labelled figure in the overview example', () => {
  const html = buildFixture('dashboard');
  assert.match(
    html,
    /<div class="dg-status"><div class="dg-status-title">Environment health<\/div><ul class="dg-status-list">[\s\S]*<span class="dg-status-name">Production API<\/span><span class="dg-status-state dg-status-state--healthy">Healthy<\/span>[\s\S]*<span class="dg-status-name">EU database primary<\/span><span class="dg-status-state dg-status-state--down">Down<\/span>[\s\S]*<\/ul><\/div>/,
    'overview lists each environment with its last-known state'
  );
});

test('heatmap renders an intensity grid as a real table with scoped headers', () => {
  // Heatmap builds a semantic <table> (thea d/scope on every th, aria-label) so
  // screen readers read each cell's numeric value as text — the color ramp is
  // decoration, never the sole signal (a11y check 6).
  const html = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{ type: 'heatmap', title: 'Incidents', columns: ['Mon', 'Tue', 'Wed'], rows: [
      { label: '09', values: [2, 5, 1] },
      { label: '12', values: [0, 1, 3] },
    ] }] }],
  });
  assert.match(html, /<div class="dg-heatmap">\n<div class="dg-heatmap-title">Incidents<\/div>\n/, 'opens as a titled block');
  assert.match(
    html,
    /<div class="dg-scroll"><table class="dg-heatmap-table" aria-label="Incidents"><thead><tr><th scope="col" class="dg-heatmap-corner"><\/th><th scope="col">Mon<\/th><th scope="col">Tue<\/th><th scope="col">Wed<\/th><\/tr><\/thead>/,
    'column headers and the corner carry scope="col"'
  );
  assert.match(
    html,
    /<tr><th scope="row">09<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l([1-5])">2<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l([1-5])">5<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l([1-5])">1<\/td><\/tr><tr><th scope="row">12<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l([1-5])">1<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l([1-5])">3<\/td><\/tr>/,
    'row headers carry scope="row" and every cell keeps its numeric text'
  );
  assert.match(
    html,
    /<div class="dg-heatmap-legend"><span class="dg-heatmap-legend-label">Low<\/span>[\s\S]*<span class="dg-heatmap-legend-label">High<\/span><\/div>/,
    'a Low→High legend wraps the grid'
  );
});

test('heatmap pulls bare rows from a data matrix and scales intensity to the row max', () => {
  const html = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{ type: 'heatmap', title: 'Load', columns: ['a', 'b'], rows: ['x', 'y'], data: [[2, 4], [1, 1]] }] }],
  });
  assert.match(
    html,
    /<th scope="row">x<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l3">2<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l5">4<\/td>/,
    'bare rows resolve from the data matrix and scale to the row max (2→l3, 4→l5)'
  );
  assert.match(
    html,
    /<th scope="row">y<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l5">1<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l5">1<\/td>/,
    'a flat row maxes the cell level'
  );
});

test('heatmap pads a bare row that has no data entry with zero cells', () => {
  const html = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{ type: 'heatmap', title: 'Load', columns: ['a', 'b'], rows: ['x', 'y'], data: [[2, 4]] }] }],
  });
  assert.match(
    html,
    /<th scope="row">x<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l3">2<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l5">4<\/td>/,
    'the first bare row still resolves from the data matrix'
  );
  assert.match(
    html,
    /<th scope="row">y<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td>/,
    'a bare row missing from the data matrix draws muted zero cells'
  );
});

test('heatmap truncates or pads ragged rows, escapes text, and degrades away', () => {
  const html = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{ type: 'heatmap', title: 'T & <M>', columns: ['a', 'b'], rows: [
      { label: 'row <1>', values: [3, 9, 99, 'x'] },
      { label: '' },
      { label: 'row <2>', values: [1] },
    ] }] }],
  });
  assert.match(
    html,
    /<th scope="row">row &lt;1&gt;<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l2">3<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l5">9<\/td>/,
    'over-long rows truncate and non-finite values drop to zero'
  );
  assert.match(
    html,
    /<th scope="row">row &lt;2&gt;<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l5">1<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td>/,
    'short rows pad with a muted zero cell'
  );
  const rowHeaders = (html.match(/<th scope="row">[^<]*<\/th>/g) || []);
  assert.deepEqual(rowHeaders, ['<th scope="row">row &lt;1&gt;</th>', '<th scope="row">row &lt;2&gt;</th>'], 'blank-label rows are skipped');
  // A boolean cell is absent, not a low-intensity reading: Number(true) === 1
  // would otherwise plot as a fabricated level-1 cell.
  const bool = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{ type: 'heatmap', title: 'Load', columns: ['a', 'b'], rows: [
      { label: 'r', values: [true, 3] },
    ] }] }],
  });
  assert.match(
    bool,
    /<th scope="row">r<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l5">3<\/td>/,
    'a boolean cell renders the muted · while real values still plot at their intensity'
  );
});

test('heatmap renders non-finite and non-numeric cells as muted dots, not fabricated intensity', () => {
  // components.js renderHeatmap: cells coerce through Number(v) with a
  // Number.isFinite gate, so Infinity/-Infinity/NaN (all "finite-shaped" to
  // isNaN — isNaN(Infinity) === false) and non-numeric strings cannot
  // fabricate an intensity level; they render the same muted · as a missing
  // cell while numeric strings still plot. The grid must keep every column,
  // so a malformed cell degrades to zero intensity instead of dropping.
  const html = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{
      type: 'heatmap',
      title: 'Load',
      columns: ['a', 'b', 'c'],
      rows: [
        { label: 'r1', values: [Infinity, 2, NaN] },
        { label: 'r2', values: [-Infinity, '12', 'four'] },
      ],
    }] }],
  });
  const body = html.slice(html.indexOf('<main'));
  // Scope the no-literal-leak check to the heatmap table; the page's embedded
  // runtime script legitimately spells Infinity/NaN in its source comments.
  const table = body.slice(body.indexOf('class="dg-heatmap-table"'), body.indexOf('class="dg-heatmap-legend"'));
  assert.match(
    body,
    /<th scope="row">r1<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l5">2<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td>/,
    'Infinity and NaN cells render the muted · while a real value still plots'
  );
  assert.match(
    body,
    /<th scope="row">r2<\/th><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l5">12<\/td><td class="dg-heatmap-cell dg-heatmap-cell--l0">·<\/td>/,
    '-Infinity and non-numeric cells render the muted ·; a numeric string coerces and plots'
  );
  assert.ok(!/Infinity|NaN/.test(table), 'no literal non-finite text leaks into the heatmap table');
});

test('heatmap with no rows or columns renders nothing', () => {
  for (const c of [
    { type: 'heatmap' },
    { type: 'heatmap', columns: ['a', 'b'] },
    { type: 'heatmap', columns: ['a', 'b'], rows: [] },
    { type: 'heatmap', columns: [], rows: ['x'], data: [[1]] },
    { type: 'heatmap', columns: ['a'], rows: [{ label: ' ', values: [1] }, { label: '', values: [2] }] },
  ]) {
    const html = renderHtml({ title: 'heatmap', sections: [{ content: [c] }] });
    assert.ok(!html.includes('class="dg-heatmap"'), 'missing/empty grid renders no heatmap');
  }
  const filtered = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{ type: 'heatmap', columns: ['a'], rows: [{ label: ' \t', values: [1] }, { label: '', values: [2] }] }] }],
  });
  assert.ok(!filtered.includes('class="dg-heatmap"'), 'rows whose labels are all blank collapse the grid and render nothing');
  const title = renderHtml({
    title: 'heatmap',
    sections: [{ content: [{ type: 'heatmap', title: 'Skip & <me>', columns: ['a'], rows: [{ label: 'z', values: [4] }] }] }],
  });
  assert.match(title, /<div class="dg-heatmap-title">Skip &amp; &lt;me&gt;<\/div>/, 'title escapes');
});

test('progress renders a labelled completion bar with spellable percent text', () => {
  // Progress is the standalone sibling of stat's progress strip: the wrapper
  // is role="img" with the label + percent as its accessible name (a11y check
  // 6), the percent is visible text beside the fill, and width/tone are
  // decoration rather than the only cue — so a colorblind reader still gets
  // the value.
  const html = renderHtml({
    title: 'progress',
    sections: [{ content: [{ type: 'progress', label: 'Error budget', value: 72, tone: 'success' }] }],
  });
  assert.match(
    html,
    /<div class="dg-progress" role="img" aria-label="Error budget: 72%">\n<div class="dg-progress-label">Error budget<\/div>\n<div class="dg-progress-track"><span class="dg-progress-fill dg-progress-fill--success" style="width:72%"><\/span><\/div>\n<div class="dg-progress-value">72%<\/div>\n<\/div>/,
    'labelled bar carries its label, a success fill at 72% width, and the percent as visible text'
  );
});

test('progress clamps, falls back tone, and degrades away', () => {
  const html = renderHtml({
    title: 'progress',
    sections: [{ content: [
      { type: 'progress', label: 'Over', value: 140, tone: 'bogus' },
      { type: 'progress', value: -5 },
      { type: 'progress', label: 'No value' },
      { type: 'progress', label: 'Text', value: 'nightly' },
    ] }],
  });
  assert.match(html, /aria-label="Over: 100%"[\s\S]*style="width:100%"/, 'over-flow values clamp to 100');
  assert.match(html, /class="dg-progress-fill dg-progress-fill--primary"[\s\S]*<div class="dg-progress-value">0%<\/div>/, 'unknown tone falls back to primary and under-flow clamps to 0');
  const valueRows = (html.match(/<div class="dg-progress-value">([^<]*)<\/div>/g) || []);
  assert.deepEqual(valueRows, ['<div class="dg-progress-value">100%</div>', '<div class="dg-progress-value">0%</div>'], 'missing or non-finite values render no bar');
});

test('terminal renders a console transcript with prompt and leveled lines', () => {
  // Terminal replays CLI output: command lines carry the prompt, ok/warn/err
  // spell their level as visible uppercase tags (a11y check 6 — tone is
  // decoration, not the sole signal), info lines are bare, and a title turns
  // the whole block into a labelled region.
  const html = renderHtml({
    title: 'terminal',
    sections: [{ content: [{ type: 'terminal', title: 'Rollback session', prompt: '$', items: [
      { level: 'cmd', text: 'dg deploy --service billing-worker --rev 2143' },
      { level: 'info', text: 'Fetching release 2143 from registry...' },
      { level: 'ok', text: 'Canary at 2% — healthz green' },
      { level: 'warn', text: 'Error rate ticks to 0.1% during ramp' },
      { level: 'err', text: 'Failed: 0' },
      'Plain trailing output',
    ] }] }],
  });
  assert.match(
    html,
    /<div class="dg-terminal" role="region" aria-label="Rollback session"><div class="dg-terminal-header"><span class="dg-terminal-title">Rollback session<\/span><\/div><pre class="dg-terminal-body">/,
    'titled terminal opens as a labelled region with a header'
  );
  assert.match(
    html,
    /<span class="dg-terminal-line dg-terminal-line--cmd">\$ dg deploy --service billing-worker --rev 2143<\/span>\n/,
    'command lines carry the prompt verbatim'
  );
  assert.match(html, /<span class="dg-terminal-line dg-terminal-line--info">Fetching release 2143 from registry\.\.\.<\/span>/, 'info lines render bare');
  assert.match(html, /<span class="dg-terminal-line dg-terminal-line--ok"><span class="dg-tl-tag">ok<\/span> Canary at 2% — healthz green<\/span>/, 'ok lines spell their level as a visible tag');
  assert.match(html, /<span class="dg-terminal-line dg-terminal-line--warn"><span class="dg-tl-tag">warn<\/span> Error rate ticks to 0\.1% during ramp<\/span>/, 'warn lines spell warn');
  assert.match(html, /<span class="dg-terminal-line dg-terminal-line--err"><span class="dg-tl-tag">err<\/span> Failed: 0<\/span>/, 'err lines spell err');
  assert.match(html, /<span class="dg-terminal-line dg-terminal-line--info">Plain trailing output<\/span><\/pre><\/div>/, 'bare string items fall back to info lines');
});

test('terminal falls back levels, splits multiline text, escapes, and degrades away', () => {
  const html = renderHtml({
    title: 'terminal',
    sections: [{ content: [
      { type: 'terminal', title: 'R&B <log>', prompt: '>', items: [
        { level: 'ERROR', text: '<warn> odd level' },
        { level: '--flag', text: 'first line\nsecond line' },
      ] },
      { type: 'terminal' },
      { type: 'terminal', items: [] },
      { type: 'terminal', items: ['', '   ', null] },
    ] }],
  });
  assert.match(html, /aria-label="R&amp;B &lt;log&gt;"/, 'title escapes');
  assert.match(html, /<span class="dg-terminal-line dg-terminal-line--info">&lt;warn&gt; odd level<\/span>/, 'unknown level falls back to info and text escapes');
  assert.match(html, /<span class="dg-terminal-line dg-terminal-line--info">first line<\/span>\n<span class="dg-terminal-line dg-terminal-line--info">second line<\/span>/, 'multiline text splits into one line per break');
  const terminals = html.match(/class="dg-terminal"/g) || [];
  assert.strictEqual(terminals.length, 1, 'missing, empty, or all-blank item lists render no terminal');
});

test('gauge renders a labelled semicircular arc with a textual readout', () => {
  const html = renderHtml({
    title: 'gauge',
    sections: [{ content: [
      { type: 'gauge', label: 'Scan coverage', value: 87, suffix: '%', tone: 'success', caption: 'Across the fleet' },
    ] }],
  });
  assert.match(
    html,
    /<div class="dg-figure dg-gauge" role="img" aria-label="Scan coverage: 87%">\s*<div class="dg-gauge-title">Scan coverage<\/div>\s*<div class="dg-gauge-main"><svg class="dg-gauge-svg" viewBox="0 0 100 58" aria-hidden="true" focusable="false"><path class="dg-gauge-track" d="M 10 50 A 40 40 0 0 1 90 50"\/><path class="dg-gauge-arc dg-gauge-arc--success" d="M 10 50 A 40 40 0 0 1 [\d.]+ [\d.]+"\/><\/svg><div class="dg-gauge-readout"><span class="dg-gauge-value">87%<\/span><span class="dg-gauge-range">0 – 100<\/span><\/div><\/div>\s*<p class="dg-note dg-gauge-cap">Across the fleet<\/p><\/div>/,
    'gauge spells value and range as text and names itself in the aria-label'
  );
});

test('gauge clamps into range, falls back tone, escapes, and degrades away', () => {
  const html = renderHtml({
    title: 'gauge',
    sections: [{ content: [
      { type: 'gauge', label: 'Overshoot', value: 250, max: 100, suffix: 'ms' },
      { type: 'gauge', label: 'Odd <tone>', value: 12, tone: 'bogus' },
      { type: 'gauge', label: 'Bad range', value: 5, min: 9, max: 2 },
      { type: 'gauge', label: 'No value' },
    ] }],
  });
  assert.match(html, /aria-label="Overshoot: 250ms"/, 'value beyond max keeps its real text while the arc clamps');
  assert.match(html, /<path class="dg-gauge-arc dg-gauge-arc--primary" d="M 10 50 A 40 40 0 0 1 90 50"\/>/, 'full-range overshoot draws the whole arc, unknown tone falls back to primary');
  assert.match(html, /<div class="dg-gauge-title">Odd &lt;tone&gt;<\/div>/, 'gauge title escapes');
  const gauges = html.match(/class="dg-figure dg-gauge"/g) || [];
  assert.strictEqual(gauges.length, 2, 'inverted range and missing value render no gauge');
});

test('terminal without a title or prompt stays a bare block using the default $ prompt', () => {
  // A title-less terminal is plain text to assistive tech: no role="region"
  // wrapper and no header, but command lines still carry the default prompt.
  const html = renderHtml({
    title: 'terminal',
    sections: [{ content: [{ type: 'terminal', items: [{ text: 'go', level: 'cmd' }, 'info line'] }] }],
  });
  assert.match(
    html,
    /<div class="dg-terminal"><pre class="dg-terminal-body"><span class="dg-terminal-line dg-terminal-line--cmd">\$ go<\/span>\n<span class="dg-terminal-line dg-terminal-line--info">info line<\/span><\/pre><\/div>/,
    'no title means no region/header, and command lines fall back to the default $ prompt'
  );
});

test('gauge at the minimum value draws only the track and names itself from value alone', () => {
  // value === min makes the arc fraction zero: the SVG keeps its track but
  // emits no arc path, and an absent label/title leaves the accessible name
  // as the bare value + suffix.
  const html = renderHtml({
    title: 'gauge',
    sections: [{ content: [{ type: 'gauge', value: 5, min: 5, max: 10, suffix: '%' }] }],
  });
  assert.match(html, /<div class="dg-figure dg-gauge" role="img" aria-label="5%">/, 'no label/title means the name is the bare value + suffix');
  assert.match(
    html,
    /<path class="dg-gauge-track" d="M 10 50 A 40 40 0 0 1 90 50"\/><\/svg>/,
    'value at min draws the track but no arc path'
  );
});

test('gauge falls back to title for its label and accessible name', () => {
  const html = renderHtml({
    title: 'gauge',
    sections: [{ content: [{ type: 'gauge', title: 'Disk', value: 50 }] }],
  });
  assert.match(html, /<div class="dg-figure dg-gauge" role="img" aria-label="Disk: 50">/, 'title supplies the label when label is absent');
  assert.match(html, /<div class="dg-gauge-title">Disk<\/div>/, 'title fills the gauge title slot');
});

test('progress and gauge treat nullish or blank values as absent, not zero', () => {
  // components.js renderProgress/renderGauge: Number(null) === 0 and
  // Number('') === 0 once fabricated a zero bar / zero readout for a value
  // that was missing or blank in the source data — the same coercion class
  // sparklineValues and the stat strip already drop. A nullish or blank
  // value is absent: it degrades away exactly like a missing value. A real
  // zero still renders, numeric strings still coerce, and a nullish or blank
  // min/max falls back to the 0/100 defaults instead of corrupting or
  // killing the range. A non-finite numeric value or range bound degrades
  // away too: isNaN(Infinity) === false slides Infinity past an isNaN-style
  // guard, so renderProgress/renderGauge gate on Number.isFinite across the
  // value and the min/max span.
  const html = renderHtml({
    title: 'empty-values',
    sections: [{ content: [
      { type: 'progress', label: 'Null', value: null },
      { type: 'progress', label: 'Empty', value: '' },
      { type: 'progress', label: 'Blank', value: '   ' },
      { type: 'progress', label: 'Gauge null', value: null },
      { type: 'progress', label: 'Gauge empty', value: '' },
      { type: 'progress', label: 'Gauge blank', value: '  ' },
      { type: 'progress', label: 'Binary', value: true },
      { type: 'progress', label: 'Inf value', value: Infinity },
      { type: 'progress', label: 'Neath value', value: -Infinity },
      { type: 'progress', label: 'Nan value', value: NaN },
      { type: 'progress', label: 'Zero', value: 0 },
      { type: 'progress', label: 'Numeric string', value: '45' },
      { type: 'gauge', label: 'Gauge zero', value: 0 },
      { type: 'gauge', label: 'Null min', value: 5, min: null },
      { type: 'gauge', label: 'Null max', value: 5, max: null },
      { type: 'gauge', label: 'Blank max', value: 5, max: '  ' },
      { type: 'gauge', label: 'True min', value: 5, min: true },
      { type: 'gauge', label: 'False max', value: 5, max: false },
      { type: 'gauge', label: 'Inf value', value: Infinity },
      { type: 'gauge', label: 'Nan value', value: NaN },
      { type: 'gauge', label: 'Inf max', value: 5, max: Infinity },
      { type: 'gauge', label: 'Nan max', value: 5, max: NaN },
      { type: 'gauge', label: 'Inf min', value: 5, min: Infinity },
      { type: 'gauge', label: 'Nan min', value: 5, min: NaN },
    ] }],
  });
  const body = html.slice(html.indexOf('<main'));
  const barRows = body.match(/<div class="dg-progress-value">([^<]*)<\/div>/g) || [];
  assert.deepEqual(barRows, ['<div class="dg-progress-value">0%</div>', '<div class="dg-progress-value">45%</div>'], 'nullish/blank/boolean/non-finite progress values render no bar while a real zero and numeric strings still do');
  assert.strictEqual((body.match(/class="dg-figure dg-gauge"/g) || []).length, 6, 'nullish/blank/boolean/non-finite gauge values or range bounds render no gauge, only real values do');
  assert.match(body, /aria-label="Gauge zero: 0"/, 'a real zero value still renders as a gauge');
  assert.match(body, /aria-label="Null min: 5"/, 'a nullish min falls back to the default range');
  assert.match(body, /aria-label="Null max: 5"/, 'a nullish max falls back to the default range instead of killing the gauge');
  assert.match(body, /aria-label="Blank max: 5"/, 'a blank max falls back to the default range');
  assert.match(body, /aria-label="True min: 5"/, 'a boolean min is absent like a nullish one and falls back to the default range');
  assert.match(body, /aria-label="False max: 5"/, 'a boolean max is absent like a nullish one and falls back to the default range');
});

test('breadcrumbs render a labelled trail ending in the current page', () => {
  const html = renderHtml({
    title: 'breadcrumbs',
    sections: [{ content: [
      { type: 'breadcrumbs', items: [
        { label: 'Ops <Console>', href: '#s-overview' },
        'Metrics',
        { label: 'Runbook' },
      ] },
    ] }],
  });
  assert.match(
    html,
    /<nav class="dg-breadcrumbs" aria-label="Breadcrumb"><ol class="dg-breadcrumbs-list"><li class="dg-breadcrumbs-item"><a class="dg-breadcrumbs-link" href="#s-overview">Ops &lt;Console&gt;<\/a><\/li><li class="dg-breadcrumbs-item"><span class="dg-breadcrumbs-text">Metrics<\/span><\/li><li class="dg-breadcrumbs-item"><span class="dg-breadcrumbs-current" aria-current="page">Runbook<\/span><\/li><\/ol><\/nav>/,
    'linked items become anchors, bare items plain text, final item is the marked current page'
  );
});

test('breadcrumbs honour a custom label, escape hrefs, and degrade away', () => {
  const html = renderHtml({
    title: 'breadcrumbs',
    sections: [{ content: [
      { type: 'breadcrumbs', label: 'Site & path', items: [
        { label: 'A', href: 'https://example.com/x?a=1&b=2' },
        'End',
      ] },
      { type: 'breadcrumbs', items: [] },
      { type: 'breadcrumbs' },
      { type: 'breadcrumbs', items: [{ label: '' }] },
    ] }],
  });
  assert.match(html, /<nav class="dg-breadcrumbs" aria-label="Site &amp; path">/, 'custom label escapes');
  assert.match(html, /href="https:\/\/example\.com\/x\?a=1&amp;b=2">A<\/a>/, 'href escapes');
  const trails = html.match(/class="dg-breadcrumbs"/g) || [];
  assert.strictEqual(trails.length, 1, 'empty, missing, or all-blank items render no breadcrumb nav');
});

test('breadcrumbs skip malformed non-string, non-object items', () => {
  // Numbers, booleans, null, etc. are neither trail labels nor { label, href }
  // objects; they must be dropped instead of leaking empty slots into the
  // trail (previously an empty <li> span plus stray separator).
  const html = renderHtml({
    title: 'breadcrumbs',
    sections: [{ content: [
      { type: 'breadcrumbs', items: [7, false, null, 'Home', [1], { label: 'Docs', href: '#x' }] },
    ] }],
  });
  assert.match(
    html,
    /<nav class="dg-breadcrumbs" aria-label="Breadcrumb"><ol class="dg-breadcrumbs-list"><li class="dg-breadcrumbs-item"><span class="dg-breadcrumbs-text">Home<\/span><\/li><li class="dg-breadcrumbs-item"><span class="dg-breadcrumbs-current" aria-current="page">Docs<\/span><\/li><\/ol><\/nav>/,
    'valid items keep their slots and the final valid item is the current page'
  );
  assert.doesNotMatch(
    html,
    /dg-breadcrumbs-text"><\/span>/,
    'no empty text span for dropped items'
  );
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
  // The role="img" wrapper spells its data in the accessible name (label,
  // prefixed value, delta trend, progress) so children presentational to
  // assistive tech still announce the full figure — matching gauge/progress.
  assert.match(html, /class="dg-stat" role="img" aria-label="Requests\/min: ~1180\/m, ▲ 12.4, 73%"/);
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

test('stat progress strip treats nullish or blank values as absent, not a fabricated 0%', () => {
  // components.js renderStat: the progress strip guard dropped null but let
  // '' and '   ' through, where Number('') === 0 passed the isFinite check
  // and fabricated a 0% strip. Blank progress is absent, matching null; a
  // real zero still warrants a 0% strip. A non-finite progress value is
  // absent too: isNaN(Infinity) === false lets Infinity past an isNaN-style
  // guard, but the strip gates on Number.isFinite, so Infinity/-Infinity/NaN
  // render no bar at all.
  const html = renderHtml({
    title: 'stats',
    sections: [{
      content: [
        { type: 'stat', label: 'Blank', value: '1', progress: '' },
        { type: 'stat', label: 'Space', value: '2', progress: '   ' },
        { type: 'stat', label: 'Binary', value: '3', progress: true },
        { type: 'stat', label: 'Inf value', value: '4', progress: Infinity },
        { type: 'stat', label: 'Neath value', value: '5', progress: -Infinity },
        { type: 'stat', label: 'Nan value', value: '6', progress: NaN },
        { type: 'stat', label: 'Zero', value: '7', progress: 0 },
        { type: 'stat', label: 'Numeric', value: '8', progress: '25' },
      ],
    }],
  });
  const body = html.slice(html.indexOf('<main'));
  const strips = body.match(/class="dg-stat-progress-fill[^"]*" style="width:([\d.]+)%"/g) || [];
  assert.deepEqual(strips, [
    'class="dg-stat-progress-fill dg-stat-progress-fill--primary" style="width:0%"',
    'class="dg-stat-progress-fill dg-stat-progress-fill--primary" style="width:25%"',
  ], 'blank, boolean and non-finite progress values render no strip; a real zero and numeric strings still do');
});

test('stat and stat-list drop blank-string deltas as absent, not a fabricated 0', () => {
  // parseDelta (components.js:136): the null guard dropped null but let ''
  // and '   ' through, where Number('') === 0 fabricated a "0" trend chip
  // next to a real figure in both stat and stat-list. Blank delta is absent
  // like a missing one; a real zero still warrants a bare "0" chip.
  const html = renderHtml({
    title: 'deltas',
    sections: [{
      content: [
        { type: 'stat', label: 'Blank', value: '1', delta: '' },
        { type: 'stat', label: 'Space', value: '2', delta: '   ' },
        { type: 'stat', label: 'Null', value: '3', delta: null },
        { type: 'stat', label: 'Zero', value: '4', delta: 0 },
        { type: 'stat', label: 'Numeric', value: '5', delta: '5' },
      ],
    }, {
      title: 'list',
      content: [{
        type: 'stat-list',
        items: [
          { label: 'Blank', value: '1', delta: '' },
          { label: 'Space', value: '2', delta: '   ' },
          { label: 'Null', value: '3', delta: null },
          { label: 'None', value: '4' },
          { label: 'Numeric', value: '5', delta: '8' },
        ],
      }],
    }],
  });
  const body = html.slice(html.indexOf('<main'));
  const deltas = body.match(/class="dg-stat-delta"/g) || [];
  assert.deepEqual(deltas, [
    'class="dg-stat-delta"',
    'class="dg-stat-delta"',
  ], 'blank and null deltas render no chip; a real zero and a numeric string still do');
  assert.match(body, /class="dg-stat-delta"[^>]*>0</, 'zero delta renders the bare 0');
  assert.match(body, /class="dg-stat-delta"[^>]*>▲ 5</, 'numeric-string delta still coerces');
  const listDeltas = body.match(/class="dg-statlist-delta/g) || [];
  assert.strictEqual(listDeltas.length, 1, 'only the finite list delta renders a cell');
  assert.match(body, /class="dg-statlist-delta dg-statlist-delta--neutral"[^>]*>▲ 8</);
});

test('stat and stat-list treat non-finite numeric values as absent, not literal text', () => {
  // components.js renderStat/renderStatList: the card value passed through
  // normalizeText with no finite check, so a non-finite numeric value —
  // which isNaN-style guards miss (isNaN(Infinity) === false) — spelled
  // itself as a literal "Infinity", "-Infinity" or "NaN" figure next to the
  // label (and into the accessible name). A non-finite numeric value now
  // degrades like a missing one across the stat card and the stat-list row
  // cell; only the malformed reading drops, so display strings the author
  // typed ("~1.2k", or even a literal "Infinity") stay verbatim.
  const html = renderHtml({
    title: 'nonfinite-stats',
    sections: [{
      content: [
        { type: 'stat', label: 'Inf', value: Infinity },
        { type: 'stat', label: 'Neath', value: -Infinity },
        { type: 'stat', label: 'Nan', value: NaN },
        { type: 'stat', label: 'TextInf', value: 'Infinity' },
        { type: 'stat', label: 'Real', value: '~1.2k' },
        { type: 'stat', label: 'Num', value: 42 },
        { type: 'stat', label: 'Zero', value: 0 },
        { type: 'stat', label: 'DeltaScalarInf', value: '1', delta: Infinity },
        { type: 'stat', label: 'DeltaInf', value: '1', delta: { value: Infinity } },
        { type: 'stat', label: 'DeltaNeath', value: '1', delta: { value: -Infinity } },
        { type: 'stat', label: 'DeltaNan', value: '1', delta: { value: NaN } },
        { type: 'stat', label: 'DeltaReal', value: '1', delta: { value: 3, tone: 'good' } },
        {
          type: 'stat-list',
          items: [
            { label: 'A', value: Infinity },
            { label: 'B', value: NaN },
            { label: 'C', value: 'Infinity' },
            { label: 'D', value: '7' },
            { label: 'E', value: '2', delta: { value: Infinity } },
            { label: 'F', value: '3', delta: { value: NaN } },
            { label: 'G', value: '4', delta: { value: 2 } },
          ],
        },
      ],
    }],
  });
  const body = html.slice(html.indexOf('<main'));
  assert.match(body, /dg-stat" role="img" aria-label="Inf: "/, 'Infinity value degrades like a missing one');
  assert.match(body, /dg-stat" role="img" aria-label="Neath: "/, '-Infinity value degrades like a missing one');
  assert.match(body, /dg-stat" role="img" aria-label="Nan: "/, 'NaN value degrades like a missing one');
  assert.match(body, /dg-stat" role="img" aria-label="TextInf: Infinity"/, 'a typed string "Infinity" stays verbatim');
  assert.match(body, /dg-stat" role="img" aria-label="Real: ~1.2k"/, 'display strings stay verbatim');
  assert.match(body, /dg-stat" role="img" aria-label="Num: 42"/, 'real numeric values still render');
  assert.match(body, /dg-stat" role="img" aria-label="Zero: 0"/, 'a real zero still renders');
  assert.match(body, /dg-stat" role="img" aria-label="DeltaScalarInf: 1"/, 'scalar non-finite delta drops without a trend chip');
  assert.match(body, /dg-stat" role="img" aria-label="DeltaInf: 1"/, 'object non-finite delta drops without a fabricated "▲ Infinity" chip');
  assert.match(body, /dg-stat" role="img" aria-label="DeltaNeath: 1"/, 'object -Infinity delta drops without a fabricated "▼ Infinity" chip');
  assert.match(body, /dg-stat" role="img" aria-label="DeltaNan: 1"/, 'object NaN delta drops without a fabricated "NaN" chip');
  assert.match(body, /dg-stat" role="img" aria-label="DeltaReal: 1, ▲ 3"/, 'a finite object delta still joins the accessible name');
  const deltaChips = body.match(/class="dg-stat-delta/g) || [];
  assert.strictEqual(deltaChips.length, 1, 'only the finite object delta renders a stat chip');
  assert.match(body, /class="dg-stat-delta dg-stat-delta--good">▲ 3</);
  const listValues = body.match(/class="dg-statlist-value">([^<]*)/g) || [];
  assert.deepEqual(listValues, [
    'class="dg-statlist-value">',
    'class="dg-statlist-value">',
    'class="dg-statlist-value">Infinity',
    'class="dg-statlist-value">7',
    'class="dg-statlist-value">2',
    'class="dg-statlist-value">3',
    'class="dg-statlist-value">4',
  ], 'non-finite stat-list row values degrade away; typed strings stay');
  const listDeltas = body.match(/class="dg-statlist-delta/g) || [];
  assert.strictEqual(listDeltas.length, 1, 'only the finite list delta renders a stat-list cell');
  assert.match(body, /class="dg-statlist-delta dg-statlist-delta--neutral"[^>]*>▲ 2</);
});

test('bare-label surfaces treat non-finite numeric values as absent, not literal text', () => {
  // components.js: bare (non-object) items that reach String() before
  // normalizeText bypass the central guard — isNaN(Infinity) === false slips
  // them past an isNaN-style check, so each site guards numeric non-finite
  // values before coercion. A typed 'Infinity' string stays verbatim, exactly
  // like a stat value does.
  const html = renderHtml({
    title: 'nonfinite-bare',
    sections: [{
      content: [
        { type: 'stat-list', items: [Infinity, -Infinity, NaN, 'Infinity', { label: 'Real', value: '2' }] },
        { type: 'kv', items: [Infinity, 'Infinity', { key: 'Real', value: 'v' }] },
        { type: 'def-list', items: [Infinity, 'Infinity', { key: 'Real', value: 'v' }] },
        { type: 'grid', columns: 2, items: [NaN, 'Infinity', 'plain', 42] },
      ],
    }],
  });
  const body = html.slice(html.indexOf('<main'));
  assert.deepEqual(
    body.match(/class="dg-statlist-row"><th scope="row">([^<]*)<\/th>/g) || [],
    ['class="dg-statlist-row"><th scope="row"></th>', 'class="dg-statlist-row"><th scope="row"></th>', 'class="dg-statlist-row"><th scope="row"></th>', 'class="dg-statlist-row"><th scope="row">Infinity</th>', 'class="dg-statlist-row"><th scope="row">Real</th>'],
    'stat-list bare Infinity/-Infinity/NaN labels degrade to empty; the typed "Infinity" string and a real label stay'
  );
  const kvTerms = body.match(/class="dg-kv-row"><dt>([^<]*)<\/dt><dd>([^<]*)/g) || [];
  assert.deepEqual(kvTerms, [
    'class="dg-kv-row"><dt>Infinity</dt><dd>',
    'class="dg-kv-row"><dt>Real</dt><dd>v',
  ], 'kv bare Infinity drops the whole row (empty term value pair); the typed string stays');
  const defTerms = body.match(/class="dg-def-list-row"><dt>([^<]*)<\/dt><dd>([^<]*)/g) || [];
  assert.deepEqual(defTerms, [
    'class="dg-def-list-row"><dt>Infinity</dt><dd>',
    'class="dg-def-list-row"><dt>Real</dt><dd>v',
  ], 'def-list bare Infinity drops the whole row (empty term value pair); the typed string stays');
  const cells = body.match(/class="dg-cell">([^<]*)<\/div>/g) || [];
  assert.deepEqual(cells, [
    'class="dg-cell"></div>',
    'class="dg-cell">Infinity</div>',
    'class="dg-cell">plain</div>',
    'class="dg-cell">42</div>',
  ], 'grid scalar NaN cell degrades to empty; the typed string, text and a real number stay');
});

test('text surfaces treat a raw boolean as absent, not literal text', () => {
  // components.js normalizeText: String(true) === 'true' used to spill a
  // boolean literal into every text surface — a stat value read "true", a
  // stat-list/kv/grid/table cell spelled "true", a status state labelled
  // "true" instead of degrading to Unknown, and button/link/title defaults
  // were skipped (`normalizeText(c.text || 'Button')` falls back on a boolean
  // truthiness, so a `text: true` tagged the button instead of defaulting).
  // A raw boolean is now absent like a nullish/non-finite value, so the
  // malformed cell degrades away and the fallback defaults re-apply; typed
  // strings and finite numbers are untouched.
  const html = renderHtml({
    title: 'bool-text',
    sections: [{
      content: [
        { type: 'stat', label: 'Flag', value: true },
        { type: 'stat-list', items: [true, { label: 'Real', value: '2' }, { label: 'ObjBool', value: false }] },
        { type: 'kv', items: [true, { key: 'Real', value: 'v' }] },
        { type: 'def-list', items: [false, { key: 'Real2', value: 'w' }] },
        { type: 'grid', columns: 2, items: [true, 'plain', 42] },
        { type: 'table', rows: [[true, 'a'], ['b', false]] },
        { type: 'status', items: [{ name: 'Flag', state: true }, { name: 'Up', state: 'healthy' }] },
        { type: 'details', title: 'D', content: [true, 'real text'] },
        { type: 'tabs', tabs: [{ label: 'T', content: [false, 'real'] }] },
        { type: 'button', text: true },
        { type: 'link', text: true },
        { type: 'chart', kind: 'line', title: true, data: [['x', 1]] },
        { type: 'sparkline', title: false, data: [1, 2, 3] },
      ],
    }],
  });
  const body = html.slice(html.indexOf('<main'));
  assert.match(body, /class="dg-stat" role="img" aria-label="Flag: "/,
    'a boolean stat value degrades like a missing one, never a literal "true" figure');
  assert.deepEqual(
    body.match(/class="dg-statlist-row"><th scope="row">([^<]*)<\/th>/g) || [],
    ['class="dg-statlist-row"><th scope="row"></th>', 'class="dg-statlist-row"><th scope="row">Real</th>', 'class="dg-statlist-row"><th scope="row">ObjBool</th>'],
    'bare boolean stat-list items degrade to an empty label row; the real ones stay'
  );
  assert.deepEqual(body.match(/class="dg-statlist-value">([^<]*)/g) || [], [
    'class="dg-statlist-value">',
    'class="dg-statlist-value">2',
    'class="dg-statlist-value">',
  ], 'a boolean stat-list row value degrades away; the real value stays');
  assert.ok(!body.includes('dg-kv-row"><dt>true</dt>'), 'a bare boolean kv item drops like a nullish one, no literal term');
  assert.deepEqual(body.match(/class="dg-kv-row"><dt>([^<]*)<\/dt><dd>([^<]*)/g) || [],
    ['class="dg-kv-row"><dt>Real</dt><dd>v'], 'kv real pairs survive the boolean item');
  assert.deepEqual(body.match(/class="dg-def-list-row"><dt>([^<]*)<\/dt><dd>([^<]*)/g) || [],
    ['class="dg-def-list-row"><dt>Real2</dt><dd>w'], 'def-list drops a bare boolean item outright');
  assert.deepEqual(body.match(/class="dg-cell">([^<]*)<\/div>/g) || [], [
    'class="dg-cell"></div>',
    'class="dg-cell">plain</div>',
    'class="dg-cell">42</div>',
  ], 'grid boolean cell degrades to empty; text and a real number stay');
  const boolTable = body.match(/<table class="dg-table">[\s\S]*?<\/table>/)[0];
  assert.strictEqual((boolTable.match(/<th scope="row">([^<]*)<\/th>/) || [])[1], '',
    'a boolean array-table cell degrades to an empty row header');
  assert.ok(!boolTable.includes('<td>true</td>') && !boolTable.includes('<td>false</td>'),
    'no literal boolean text leaks into array-table cells');
  assert.deepEqual(body.match(/dg-status-state dg-status-state--([a-z]+)">([^<]*)<\/span>/g) || [], [
    'dg-status-state dg-status-state--unknown">Unknown</span>',
    'dg-status-state dg-status-state--healthy">Healthy</span>',
  ], 'a boolean status state degrades to the Unknown fallback, never a literal "true" label');
  assert.match(body, /<div class="dg-details-body"><p class="dg-paragraph"><\/p>\n<p class="dg-paragraph">real text<\/p><\/div>/,
    'details boolean content item renders an empty paragraph; the real item stays');
  assert.match(body, /<div class="dg-tab-panel"><p class="dg-paragraph"><\/p>\n<p class="dg-paragraph">real<\/p><\/div>/,
    'tabs boolean content item renders an empty paragraph; the real item stays');
  assert.match(body, /<button type="button" class="dg-btn dg-btn--primary">Button<\/button>/,
    'a boolean button text falls back to the Button default');
  assert.match(body, /<a href="#" class="dg-link">Link<\/a>/,
    'a boolean link text falls back to the Link default');
  assert.match(body, /class="dg-figure dg-chart"[^>]*aria-label="Chart"/,
    'a boolean chart title falls back to the Chart default');
  assert.match(body, /class="dg-figure dg-sparkline"[^>]*aria-label="Trend"/,
    'a boolean sparkline title falls back to the Trend default');
  assert.ok(!/>true<|>false</.test(body), 'no literal boolean text leaks anywhere in the body');
});

test('status state and collapsible/tab content treat non-finite values as absent', () => {
  // components.js renderStatus: item.state went straight into String() and
  // .toLowerCase() — a numeric NaN/Infinity became a literal "Infinity"/"nan"
  // status label instead of degrading to the "Unknown" fallback. renderDetails
  // and renderTabs body items bypass normalizeText too, so their non-finite
  // content items must render an empty paragraph rather than a literal.
  const html = renderHtml({
    title: 'nonfinite-status',
    sections: [{
      content: [
        {
          type: 'status',
          items: [
            { name: 'Mid', state: Infinity },
            { name: 'Neath', state: -Infinity },
            { name: 'Nan', state: NaN },
            { name: 'Up', state: 'healthy' },
          ],
        },
        { type: 'details', title: 'D', content: [Infinity, 'real text'] },
        { type: 'tabs', tabs: [{ label: 'T', content: [NaN, 'real'] }] },
      ],
    }],
  });
  const body = html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7);
  const states = body.match(/dg-status-state dg-status-state--([a-z]+)">([^<]*)<\/span>/g) || [];
  assert.deepEqual(states, [
    'dg-status-state dg-status-state--unknown">Unknown</span>',
    'dg-status-state dg-status-state--unknown">Unknown</span>',
    'dg-status-state dg-status-state--unknown">Unknown</span>',
    'dg-status-state dg-status-state--healthy">Healthy</span>',
  ], 'non-finite status states degrade to the Unknown fallback, never a literal Infinity/nan label');
  assert.ok(!/Infinity|NaN/.test(body), 'no literal non-finite text leaks into the body');
  assert.match(body, /<div class="dg-details-body"><p class="dg-paragraph"><\/p>\n<p class="dg-paragraph">real text<\/p><\/div>/,
    'details content non-finite item renders an empty paragraph and the real item stays');
  assert.match(body, /<div class="dg-tab-panel"><p class="dg-paragraph"><\/p>\n<p class="dg-paragraph">real<\/p><\/div>/,
    'tabs content non-finite item renders an empty paragraph and the real item stays');
});

test('stat falls back to title label and to a bare stat aria-label', () => {
  // components.js renderStat: the figure label is `c.label || c.title || ''`.
  // A stat given only a `title:` uses it as the label, and one with neither
  // still renders with the accessible name "stat" (the name always includes
  // the value) and an empty label line instead of an unlabeled figure.
  const html = renderHtml({
    title: 'stat-labels',
    sections: [{
      content: [
        { type: 'stat', title: 'Sessions', value: '12' },
        { type: 'stat', value: '99' },
      ],
    }],
  });
  assert.match(html, /class="dg-stat" role="img" aria-label="Sessions: 12"/);
  assert.match(html, /class="dg-stat-label">Sessions<\/div>/);
  assert.match(html, /class="dg-stat" role="img" aria-label="99"/);
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
  assert.match(html, /<div class="dg-cell"><div class="dg-stat" role="img" aria-label="Rate: 42">/, 'stat component renders inside the cell');
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

test('renderPage renders an empty hero when hero content is not a list', () => {
  // renderComponents defensively treats a non-array component list as an empty
  // render. renderHtml can never reach that arm (validatePage rejects a
  // { content: <non-array> } hero), but renderPage is exported directly for
  // embedding and does not validate, so it must degrade the same way instead
  // of crashing on the missing .map.
  const { renderPage } = require('../lib/render');
  const html = renderPage({ title: 't', hero: { content: 'not-a-list' }, sections: [] });
  assert.match(html, /<header class="dg-hero"><div class="dg-hero-inner"><\/div><\/header>/, 'non-list hero content renders an empty hero');
  assert.ok(html.includes('</html>'), 'page still renders in full');
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

test('serve prints a clean diagnostic for a listen failure that carries no errno code', async () => {
  // The handler's else branch formats the error as `(err && err.code) || err`,
  // which must also survive a listen 'error' that has no `.code` property
  // (fs errors have one, but failed binds can surface other raw Error shapes).
  // The fallback must name the error object itself, still without leaking a
  // raw listen() stack.
  const { cmdServe } = require('../lib/cli');
  const http = require('node:http');
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-serve-nocode-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>nocode</h1>');

  const origListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (...args) {
    process.nextTick(() => this.emit('error', new Error('bogus bind error')));
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
    assert.match(stderr, /\[dashboard-gen\] Could not start server \(Error: bogus bind error\)/, 'fallback names the error object itself');
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

test('dg new fails cleanly when the template examples file is missing', () => {
  // templateSource falls back to null when examples/<template>.yaml does not
  // exist (a packaged installation with a pruned examples/ dir, say); cmdNew
  // must surface a one-line diagnostic naming the missing file, exit 1, and
  // scaffold nothing. The stub reaches cli.js through the shared fs module
  // instance (both files require the same node:fs cache).
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-missingtpl-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);

  const origExists = fs.existsSync;
  fs.existsSync = (p) => (typeof p === 'string' && /landing\.yaml$/.test(p)) ? false : origExists(p);
  const origErr = console.error;
  const origExit = process.exitCode;
  let errMsg = '';
  console.error = (s) => { errMsg += String(s); };
  try {
    cli(['new', 'missing-tpl']);
    assert.match(errMsg, /Template source missing \(examples\/landing\.yaml\)/);
    assert.strictEqual(process.exitCode, 1, 'exit code 1 when the template source is missing');
    assert.ok(!fs.existsSync(path.join(cwd, 'missing-tpl')), 'no directory scaffolded');
  } finally {
    fs.existsSync = origExists;
    console.error = origErr;
    process.exitCode = origExit === undefined ? 0 : origExit;
    process.chdir(origCwd);
  }
});

test('dg new skips copying a template fixture when the examples file is missing', () => {
  // The fetch template binds examples/market.json as a local fixture. If that
  // file is absent (packaged install with a pruned examples/ dir), the copy
  // loop must skip it (continue) without failing or half-building the scaffold:
  // the DSL, runbook, and Pages workflow still land, and the missing fixture
  // is simply not copied.
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-missingfix-'));
  const { cli } = require('../lib/cli');
  const origCwd = process.cwd();
  process.chdir(cwd);

  const origExists = fs.existsSync;
  fs.existsSync = (p) => (typeof p === 'string' && /market\.json$/.test(p)) ? false : origExists(p);
  const origLog = console.log;
  const origExit = process.exitCode;
  let outMsg = '';
  console.log = (s) => { outMsg += String(s); };
  try {
    cli(['new', 'fetchproj', '--template=fetch']);
    assert.ok(!process.exitCode, 'scaffold succeeds despite the missing fixture');
    assert.match(outMsg, /created "/);
    assert.ok(fs.existsSync(path.join(cwd, 'fetchproj', 'dg.dsl.yaml')), 'dsl scaffolded');
    assert.ok(fs.existsSync(path.join(cwd, 'fetchproj', '.github', 'workflows', 'pages.yml')), 'pages workflow scaffolded');
    assert.ok(!fs.existsSync(path.join(cwd, 'fetchproj', 'market.json')), 'missing fixture skipped, not copied');
  } finally {
    fs.existsSync = origExists;
    console.log = origLog;
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

test('npm pack ships only the runtime surface, never tests or workflows', () => {
  // package.json narrows the published tarball with a `files` whitelist so a
  // `dg` consumer downloads bin/ + lib/ + examples/ + licenses only. This
  // pins the actual `npm pack` manifest: every runtime file must ship and the
  // dev-only/private paths (test suites, CI workflows, scripts, spec) must
  // not leak into the tarball.
  const { execFileSync } = require('node:child_process');
  const packageRoot = path.join(__dirname, '..');
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  const [manifest] = JSON.parse(stdout);
  assert.ok(Array.isArray(manifest.files), 'pack manifest lists files');
  const paths = manifest.files.map((f) => f.path);

  const required = [
    'package.json',
    'LICENSE',
    'README.md',
    'COMMERCIAL-LICENSE.md',
    'bin/dg',
    ...['a11y', 'build', 'cli', 'components', 'errors', 'loader', 'render', 'style', 'theme'].map((m) => `lib/${m}.js`),
    ...['chart', 'dashboard', 'fetch', 'landing', 'table'].map((n) => `examples/${n}.yaml`),
    'examples/market.json',
    'examples/ops-console.svg',
  ];
  for (const entry of required) {
    assert.ok(paths.includes(entry), `tarball ships ${entry}`);
  }

  for (const banned of ['SPEC.md', 'test/generator.test.js', '.github/workflows/pages.yml', 'scripts/', 'docs/']) {
    assert.ok(!paths.some((p) => p === banned || p.startsWith(banned)), `tarball excludes ${banned}`);
  }
  assert.ok(!paths.some((p) => p.endsWith('.tgz')), 'no packed tarball inside the tarball');
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

test('dg new -t dashboard copies its image fixture and the scaffold builds', () => {
  // The dashboard template binds examples/ops-console.svg via `file:` on a
  // `type: image` block. The scaffold must copy that fixture next to
  // dg.dsl.yaml (like fetch copies market.json) or the fresh project cannot
  // build: dg build would fail with ENOENT on ops-console.svg. Regression
  // test for the template-fixtures map in lib/cli.js.
  const { cmdNew, cmdBuild } = require('../lib/cli');
  const os = require('node:os');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-new-dashfix-'));
  const origCwd = process.cwd();
  process.chdir(cwd);
  try {
    cmdNew({ _: ['dashproj'], template: 'dashboard' });
    assert.ok(fs.existsSync(path.join(cwd, 'dashproj', 'dg.dsl.yaml')));
    assert.ok(fs.existsSync(path.join(cwd, 'dashproj', 'ops-console.svg')), 'dashboard image fixture copied');
    assert.ok(fs.existsSync(path.join(cwd, 'dashproj', '.github', 'workflows', 'pages.yml')));

    const dslPath = path.join(cwd, 'dashproj', 'dg.dsl.yaml');
    cmdBuild({ _: [dslPath] });
    const html = fs.readFileSync(path.join(cwd, 'dist', 'site.html'), 'utf8');
    assert.match(html, /data:image\/svg\+xml;utf8,/, 'image inlined as a data URI');
    assert.match(html, /Incident timeline/, 'dashboard template rendered');
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

test('grid blank or null columnWidth falls back to the 220px default', () => {
  // components.js renderGrid: the isFinite(Number(colW)) guard let ''/null
  // through (Number(null) === Number('') === 0) and fabricated the malformed
  // "minmax(px, 1fr)" / "minmax(nullpx, 1fr)" minimum. A blank or null
  // columnWidth is absent like a missing one, so it degrades to 220px; a real
  // zero width and numeric/px values are still honored.
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [
        { type: 'grid', columnWidth: '', items: [] },
        { type: 'grid', columnWidth: '   ', items: [] },
        { type: 'grid', columnWidth: null, items: [] },
        { type: 'grid', columnWidth: 0, items: [] },
        { type: 'grid', columnWidth: 240, items: [] },
        { type: 'grid', columnWidth: '180px', items: [] },
        { type: 'grid', items: [] },
      ],
    }],
  });
  const body = html.slice(html.indexOf('<main'));
  const mins = body.match(/minmax\(([^)]*), 1fr\)/g) || [];
  assert.deepEqual(mins, [
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(0px, 1fr)',
    'minmax(240px, 1fr)',
    'minmax(180px, 1fr)',
    'minmax(220px, 1fr)',
  ], 'blank and null columnWidth fall back to 220px while real zero, numeric, and px values survive');
  assert.ok(!/minmax\(px, 1fr\)|minmax\(nullpx, 1fr\)|minmax\(   px, 1fr\)/.test(body),
    'no malformed minmax minimum leaks into the layout');
});

test('grid non-numeric scalar columnWidth falls back to the 220px default', () => {
  // components.js renderGrid: Number(true) === 1 and Number(false) === 0 are
  // finite, so booleans used to pass the isFinite guard and fabricate the
  // invalid "minmax(truepx, 1fr)" / "minmax(falsepx, 1fr)" minimum — and a
  // bare word like "abc", being truthy, fell to the raw-string branch and
  // leaked the unit-less "minmax(abc, 1fr)". Infinity/-Infinity/NaN are
  // numbers too, so they clear the typeof gate but fail isFinite and must
  // degrade like a missing width rather than fabricate "minmax(Infinitypx, 1fr)".
  // Only a real non-negative length (number, numeric string, or unit-suffixed
  // string) can size an auto-fill track; non-numeric or negative scalars are
  // absent like a missing width.
  const grid = (columnWidth) => ({
    type: 'grid',
    ...(columnWidth === undefined ? {} : { columnWidth }),
    items: [],
  });
  const html = renderHtml({
    title: 't',
    sections: [{ content: [
      grid(true),
      grid(false),
      grid('abc'),
      grid(Infinity),
      grid(-Infinity),
      grid(NaN),
      grid(-40),
      grid('-40'),
      grid(220),
      grid('220'),
      grid('18rem'),
      grid('50%'),
      grid(undefined),
    ] }],
  });
  const body = html.slice(html.indexOf('<main'));
  const mins = body.match(/minmax\(([^)]*), 1fr\)/g) || [];
  assert.deepEqual(mins, [
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(220px, 1fr)',
    'minmax(18rem, 1fr)',
    'minmax(50%, 1fr)',
    'minmax(220px, 1fr)',
  ], 'booleans, bare words, negative and non-finite widths degrade to 220px while numeric and unit-suffixed lengths survive');
  assert.ok(!/minmax\((true|false)px|minmax\([a-z]+, 1fr\)|minmax\(-\d+px, 1fr\)|minmax\((Infinity|-Infinity|NaN)px/.test(body),
    'no boolean, unit-less, negative, or non-finite minmax minimum leaks into the layout');
});

test('grid blank or non-positive columns falls back to the fluid auto-fill layout', () => {
  // components.js renderGrid: `c.columns ?` treated a whitespace string as a
  // real column count (it is truthy), so columns: '   ' entered the fixed-N
  // branch where Number('   ') === 0 and `|| 3` fabricated a
  // "repeat(3, minmax(0, 1fr))" grid from a blank — and fractional counts
  // like 2.5 emitted the invalid CSS "repeat(2.5, ...)". A blank, non-positive,
  // non-integer, or garbage count is absent like a missing one: only a real
  // positive integer count selects the fixed grid, everything else degrades to
  // the fluid auto-fill layout and the data-grid-cols hook stays a sane 3.
  const grid = (columns) => ({
    type: 'grid',
    ...(columns === undefined ? {} : { columns }),
    items: [],
  });
  const html = renderHtml({
    title: 't',
    sections: [{ content: [
      grid(undefined),
      grid(null),
      grid(''),
      grid('   '),
      grid(0),
      grid('0'),
      grid(-2),
      grid(2.5),
      grid('2.5'),
      grid('abc'),
      grid(false),
      grid(true),
      grid(3),
      grid(4),
    ] }],
  });
  const body = html.slice(html.indexOf('<main'));
  const styles = body.match(/grid-template-columns: (repeat\([^;]+)\);/g) || [];
  assert.deepEqual(styles, [
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
    'grid-template-columns: repeat(3, minmax(0, 1fr));',
    'grid-template-columns: repeat(4, minmax(0, 1fr));',
  ], 'blank, null, non-positive, fractional, and garbage counts degrade to the fluid auto-fill layout');
  assert.ok(!/repeat\(2\.5|repeat\(-|repeat\(0,|repeat\(NaN|repeat\(true|repeat\(false/.test(body),
    'no invalid or malformed repeat count leaks into the layout');
  const colsAttrs = body.match(/data-grid-cols="[^"]+"/g) || [];
  assert.strictEqual(colsAttrs.length, 14, 'every grid still carries the data-grid-cols hook');
  assert.ok(!['0', '-2', '2.5', 'NaN'].some((bad) => body.includes(`data-grid-cols="${bad}"`)),
    'no malformed column count leaks into the data-grid-cols attribute');
  assert.ok(!/repeat\((?:true|false),/.test(body), 'no boolean columns value leaks into any repeat count');
  assert.ok(!/data-grid-cols="1"/.test(body), 'a boolean columns never fabricates a fixed 1-column grid hook');
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

test('code component renders an escaped snippet with optional title and lang', () => {
  const html = renderHtml({
    title: 't',
    sections: [
      {
        content: [
          {
            type: 'code',
            title: 'Install',
            lang: 'sh',
            code: 'npm install -g dashboard-gen\n<hello> & "quotes"',
          },
        ],
      },
    ],
  });
  assert.match(html, /<div class="dg-code" role="region" aria-label="Install" data-code-lang="sh">/);
  assert.match(html, /<span class="dg-code-title">Install<\/span>/);
  assert.match(html, /<span class="dg-code-lang">sh<\/span>/);
  assert.match(html, /<pre class="dg-code-pre"><code class="dg-code-body">/);
  // content is escaped, not raw HTML
  assert.ok(html.includes('npm install -g dashboard-gen'));
  assert.ok(html.includes('&lt;hello&gt; &amp; &quot;quotes&quot;'));
  assert.ok(!html.includes('<hello> & "quotes"'), 'raw markup is escaped');
});

test('code component joins a lines list and stays bare without title or lang', () => {
  const html = renderHtml({
    title: 't',
    sections: [
      {
        content: [
          {
            type: 'code',
            code: ['const x = 1;', 'console.log(x);'],
          },
        ],
      },
    ],
  });
  // No header, no region role, no data-lang for a bare snippet.
  assert.match(html, /<div class="dg-code"><pre class="dg-code-pre"><code class="dg-code-body">const x = 1;\nconsole\.log\(x\);\n?<\/code><\/pre><\/div>/);
  assert.ok(!html.includes('<div class="dg-code-header">'), 'no header without title/lang');
  assert.ok(!html.includes('role="region"'), 'no region role without an accessible name');
});

test('code component renders an empty body when no code is given', () => {
  // A component with only title/lang (no code field) must fall back to an empty
  // body instead of emitting "undefined" or crashing.
  const html = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'code', title: 'Usage', lang: 'js' }] }],
  });
  assert.match(html, /<div class="dg-code" role="region" aria-label="Usage" data-code-lang="js">/);
  assert.match(html, /<div class="dg-code-header"><span class="dg-code-title">Usage<\/span><span class="dg-code-lang">js<\/span><\/div>/);
  assert.match(html, /<code class="dg-code-body"><\/code>/);
  assert.ok(!/<code class="dg-code-body">.*?undefined/.test(html), 'no literal undefined leaks into the body');
});

test('callout component renders a tone-styled notice with a labelled title', () => {
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'callout', tone: 'warning', title: 'Maintenance', text: 'Scheduled at 02:00 UTC.' }],
    }],
  });
  assert.match(html, /<div class="dg-callout dg-callout--warning" role="note" aria-label="Maintenance">/);
  assert.match(html, /<div class="dg-callout-title">Maintenance<\/div>/);
  assert.match(html, /<p class="dg-callout-body">Scheduled at 02:00 UTC\.<\/p>/);
});

test('callout component defaults to primary tone and stays bare without title', () => {
  const html = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'callout', text: 'Tip: pin deps.' }] }],
  });
  // No title -> no note role (the role needs an accessible name), no header.
  assert.match(html, /<div class="dg-callout dg-callout--primary"><p class="dg-callout-body">Tip: pin deps\.<\/p><\/div>/);
  assert.ok(!html.includes('role="note"'), 'no note role without an accessible name');
  assert.ok(!html.includes('<div class="dg-callout-title">'), 'no title header when title is absent');
});

test('callout treats a whitespace-only title as absent and falls unknown tones back to primary', () => {
  // A `title` of ' '/'  ' is truthy but blank: it must not fabricate a
  // role="note" landmark with an empty accessible name or a dead header div.
  // An unknown tone degrades to the primary accent, never an invalid class.
  const html = renderHtml({
    title: 't',
    sections: [{ content: [
      { type: 'callout', title: '  ', text: 'Whitespace title is absent.' },
      { type: 'callout', tone: 'bogus', title: 'Bad tone', text: 'Tone falls back.' },
    ] }],
  });
  assert.match(html, /<div class="dg-callout dg-callout--primary"><p class="dg-callout-body">Whitespace title is absent\.<\/p><\/div>/, 'the whitespace-title callout is a bare div with no note role or header');
  assert.match(html, /<div class="dg-callout dg-callout--primary" role="note" aria-label="Bad tone">/, 'an unknown tone falls back to primary while a real title keeps the note role');
});

test('callout component escapes body and title markup', () => {
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'callout', title: 'A <b>bold</b> title', text: '<script>alert(1)</script> & co' }],
    }],
  });
  assert.ok(html.includes('A &lt;b&gt;bold&lt;/b&gt; title'), 'title is escaped');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co'), 'body is escaped');
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script never reaches the page');
});

test('callout component renders an empty body when no text is given', () => {
  const html = renderHtml({
    title: 't',
    sections: [{ content: [{ type: 'callout', title: 'Heads up' }] }],
  });
  assert.match(html, /<p class="dg-callout-body"><\/p>/, 'empty text yields an empty body paragraph');
  assert.match(html, /<div class="dg-callout dg-callout--primary" role="note" aria-label="Heads up">/);
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

test('table mixed-type first row stays in the body; header:true forces it up', () => {
  // The all-strings header heuristic is what the code comment on
  // rowsToTableData names: a mixed string+number row like ["Jan", 10] is a
  // data row (per-period values), not column titles. Without a `header` key it
  // must render as a body row-header, and `header: true` must force it into
  // <thead> just like a numeric first row.
  const html = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'table', rows: [['Jan', 10], ['Feb', 12]] }],
    }],
  });
  assert.match(
    html,
    /<table class="dg-table"><tbody><tr><th scope="row">Jan<\/th><td>10<\/td><\/tr><tr><th scope="row">Feb<\/th><td>12<\/td><\/tr><\/tbody>/,
    'mixed-type first row stays in the body as a row header'
  );
  assert.ok(!html.includes('<thead>'), 'no auto header for a mixed-type first row');

  const forced = renderHtml({
    title: 't',
    sections: [{
      content: [{ type: 'table', header: true, rows: [['Jan', 10], ['Feb', 12]] }],
    }],
  });
  assert.match(
    forced,
    /<thead><tr><th scope="col">Jan<\/th><th scope="col">10<\/th><\/tr><\/thead><tbody><tr><td>Feb<\/td><td>12<\/td><\/tr><\/tbody>/,
    'header: true forces the mixed-type first row into the header'
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

test('table null/undefined cells render empty, never literal "null"/"undefined" text', () => {
  // The project null->empty convention (list items, grid cells) extends to
  // tables: a missing object key and an explicit null/undefined value both map
  // to an empty cell instead of leaking the 4-to-9-letter literal word as cell
  // text. Both table data shapes are covered: object rows (union-of-keys) and
  // array-of-arrays bodies (String() coercion path).
  const objectRows = renderHtml({
    title: 't',
    sections: [{
      content: [{
        type: 'table',
        rows: [
          { name: 'api', v: 2 },
          { name: 'db' }, // missing key
          { name: 'auth', v: null }, // explicit null
          { name: 'mysql', v: undefined }, // explicit undefined
          { name: 'redis', v: '' }, // empty string stays empty
        ],
      }],
    }],
  });
  assert.match(
    objectRows,
    /<tbody><tr><td>api<\/td><td>2<\/td><\/tr><tr><td>db<\/td><td><\/td><\/tr><tr><td>auth<\/td><td><\/td><\/tr><tr><td>mysql<\/td><td><\/td><\/tr><tr><td>redis<\/td><td><\/td><\/tr><\/tbody>/,
    'sparse object rows render empty cells for missing/null/undefined values'
  );
  assert.ok(!/>null</.test(objectRows), 'no literal "null" leaks into a table cell');
  assert.ok(!/>undefined</.test(objectRows), 'no literal "undefined" leaks into a table cell');

  const arrayRows = renderHtml({
    title: 't',
    sections: [{
      content: [{
        type: 'table',
        header: false,
        rows: [
          ['api', 2],
          ['db', null],
          ['auth', undefined],
        ],
      }],
    }],
  });
  assert.match(
    arrayRows,
    /<tbody><tr><th scope="row">api<\/th><td>2<\/td><\/tr><tr><th scope="row">db<\/th><td><\/td><\/tr><tr><th scope="row">auth<\/th><td><\/td><\/tr><\/tbody>/,
    'array-of-arrays rows with null/undefined cells render empty cells'
  );
  assert.ok(!/>null</.test(arrayRows), 'array rows leak no literal "null" text');
  assert.ok(!/>undefined</.test(arrayRows), 'array rows leak no literal "undefined" text');
});

test('table non-finite numeric cells render empty, typed "Infinity" strings stay', () => {
  // The project non-finite->absent convention extends to tables: numeric
  // Infinity/-Infinity/NaN must degrade to an empty cell (like null/undefined)
  // instead of spelling the literal word as cell text, on both table data
  // shapes (array-of-arrays String() path and object union-of-keys path).
  // A typed string value "Infinity" is data, not a number, and stays verbatim.
  const arrayRows = renderHtml({
    title: 't',
    sections: [{
      content: [{
        type: 'table',
        header: false,
        rows: [
          ['num', Infinity],
          ['nan', NaN],
          ['neg', -Infinity],
          ['str', 'Infinity'],
          ['finite', 42],
          ['missing', null],
        ],
      }],
    }],
  });
  assert.match(
    arrayRows,
    /<tbody><tr><th scope="row">num<\/th><td><\/td><\/tr><tr><th scope="row">nan<\/th><td><\/td><\/tr><tr><th scope="row">neg<\/th><td><\/td><\/tr><tr><th scope="row">str<\/th><td>Infinity<\/td><\/tr><tr><th scope="row">finite<\/th><td>42<\/td><\/tr><tr><th scope="row">missing<\/th><td><\/td><\/tr><\/tbody>/,
    'array rows degrade non-finite numbers to empty cells but keep typed strings'
  );
  assert.ok(!/>Infinity</.test(arrayRows.replace(/td>Infinity</, '')), 'no non-finite Infinity literal leaks into an array-table cell');
  assert.ok(!/>NaN</.test(arrayRows), 'no NaN literal leaks into an array-table cell');
  assert.ok(!/>-Infinity</.test(arrayRows), 'no -Infinity literal leaks into an array-table cell');

  const objectRows = renderHtml({
    title: 't',
    sections: [{
      content: [{
        type: 'table',
        rows: [
          { name: 'api', v: Infinity },
          { name: 'db', v: NaN },
          { name: 'auth', v: -Infinity },
          { name: 'redis', v: 2 },
        ],
      }],
    }],
  });
  assert.match(
    objectRows,
    /<tbody><tr><td>api<\/td><td><\/td><\/tr><tr><td>db<\/td><td><\/td><\/tr><tr><td>auth<\/td><td><\/td><\/tr><tr><td>redis<\/td><td>2<\/td><\/tr><\/tbody>/,
    'object rows degrade non-finite numbers to empty cells'
  );
  assert.ok(!/>Infinity</.test(objectRows), 'object rows leak no Infinity literal');
  assert.ok(!/>NaN</.test(objectRows), 'object rows leak no NaN literal');
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

