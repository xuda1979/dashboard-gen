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

