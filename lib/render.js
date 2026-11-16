// Render core — a validated page model + data store -> single self-contained HTML.

const crypto = require('node:crypto');
const { THEME } = require('./theme');
const { BASE_CSS } = require('./style');
const { invoke, esc, attr, slugify } = require('./components');
const { StyleError } = require('./errors');

const LAYOUT_ALIAS = {
  hero: 'hero',
  grid: 'grid',
  sidebar: 'sidebar',
  section: 'section',
  landing: 'landing',
};

// CSS custom properties are referenced in kebab-case (--text-color) by BASE_CSS;
// translate the camelCase theme tokens at emission time.
function tokenKey(k) {
  return k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

function resolveLayout(doc) {
  const raw = doc.layout || 'landing';
  const key = String(raw).split(/\s+/)[0];
  return LAYOUT_ALIAS[key] || 'landing';
}

// ---------------------------------------------------------------------------
// Theme resolution
// ---------------------------------------------------------------------------

function mergeTheme(pageTheme) {
  const root = {};
  for (const [k, v] of Object.entries(THEME)) {
    if (k === 'dark') continue;
    root[k] = v;
  }
  let dark = THEME.dark || {};
  if (pageTheme && typeof pageTheme === 'object') {
    for (const [k, v] of Object.entries(pageTheme)) {
      if (k === 'dark' && v && typeof v === 'object' && !Array.isArray(v)) {
        dark = { ...dark, ...v };
      } else {
        root[k] = v;
      }
    }
  }
  return { root, dark };
}

function cssVarDecls(root) {
  return Object.entries(root)
    .map(([k, v]) => `  --${tokenKey(k)}: ${v};`)
    .join('\n');
}

function css(withVars, darkVars, extraDark) {
  let out = `:root {\n${cssVarDecls(withVars)}\n}\n\n`;
  const darkList = Object.entries(darkVars)
    .map(([k, v]) => `  --${tokenKey(k)}: ${v};`)
    .join('\n');
  if (darkList) {
    out += `@media (prefers-color-scheme: dark) {\n  :root {\n${darkList}\n  }\n}\n\n`;
  }
  out += BASE_CSS;
  return out;
}

// ---------------------------------------------------------------------------
// Data store assembly
// ---------------------------------------------------------------------------

// Walk every component; collect inline rows into store and metadata into rows.
function collectChartData(page, store, manifest, fileDir) {
  inlineSeq = 0;

  function visit(comp, at) {
    if (!comp || typeof comp !== 'object') return;
    if (Array.isArray(comp)) {
      comp.forEach((c) => visit(c, at));
      return;
    }
    if (comp.type === 'chart') {
      const key = comp.dataId || `chart-${inlineSeq++}`;
      if (comp.data === undefined || comp.data === null) {
        if (typeof comp.file === 'string') {
          store[key] = loadDataFile(comp.file, fileDir, `${at}.file`);
        } else {
          store[key] = comp.data; // chart with no bound data -> runtime "no data"
        }
      } else if (Array.isArray(comp.data)) {
        store[key] = comp.data;
      } else if (typeof comp.data === 'object' && 'csv' in comp.data) {
        store[key] = csvToRows(comp.data.csv);
      } else if (typeof comp.data === 'object' && 'json' in comp.data) {
        store[key] = comp.data.json;
      } else if (typeof comp.data === 'object' && 'fetch' in comp.data) {
        if (typeof comp.data.fetch !== 'string') {
          throw new StyleError('data.fetch must be a string URL', `${at}.data.fetch`);
        }
        const { validateFetchUrl, normalizeFetchUrl } = require('./loader');
        validateFetchUrl(comp.data.fetch); // throws FetchSpecError on invalid
        // Fetch at runtime uses the normalized path; "self://<path>" becomes a
        // plain relative URL so fetch() (which rejects unknown schemes) can load
        // the fixture the CLI copies next to the page.
        manifest.push({ key, url: normalizeFetchUrl(comp.data.fetch) });
      } else if (typeof comp.file === 'string') {
        store[key] = loadDataFile(comp.file, fileDir, `${at}.file`);
      } else {
        throw new StyleError(
          'chart "data" must be inline rows, { csv }, { json }, { fetch: url }, or "file".',
          `${at}.data`
        );
      }
      comp.__dg_key = key;
      return;
    }
    Object.keys(comp).forEach((k) => {
      const v = comp[k];
      if (v && typeof v === 'object') visit(v, `${at}.${k}`);
    });
  }

  // The render pass (renderHero + asWidgets) assigns chart keys in exactly this
  // order: page hero first, then per section the nav / hero / content widgets.
  // Collecting in the same fixed order keeps server-side dataIds aligned with
  // the store regardless of how the DSL author ordered the section keys.
  if (page.hero) {
    const list = Array.isArray(page.hero) ? page.hero : page.hero.content;
    if (list) visit(list, 'page.hero');
  }
  (page.sections || []).forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    ['nav', 'hero', 'content'].forEach((k) => {
      if (s[k] != null) visit(s[k], `page.sections[${i}].${k}`);
    });
  });
}

function loadDataFile(relPath, fileDir, at) {
  const { DataFileError } = require('./errors');
  const fs = require('node:fs');
  const path = require('node:path');
  if (!relPath) throw new DataFileError('chart "file" must be a non-empty path', at);
  const abs = path.isAbsolute(relPath) ? relPath : path.join(fileDir || '.', relPath);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new DataFileError(`Could not read data file "${relPath}" (${err.code || err.message})`, at);
  }
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.json') {
    try {
      return JSON.parse(content);
    } catch (err) {
      throw new DataFileError(`Data file "${relPath}" is not valid JSON: ${err.message}`, at);
    }
  }
  if (ext === '.csv') return csvToRows(content);
  throw new DataFileError(`Unsupported data file extension "${ext}" (use .json or .csv).`, at);
}

// ---------------------------------------------------------------------------
// Component rendering
// ---------------------------------------------------------------------------

function renderComponents(list, state) {
  if (!Array.isArray(list)) return '';
  return list
    .map((comp) => {
      if (!comp || typeof comp !== 'object' || !comp.type) {
        throw new StyleError('Every content item must be an object with a "type".', 'component');
      }
      return invoke(comp, state);
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Layout renderers
// ---------------------------------------------------------------------------

function layoutContent(html) {
  return `<main id="main" class="dg-main">${html}</main>`;
}

// ---------------------------------------------------------------------------
// Full page
// ---------------------------------------------------------------------------

function renderPage(doc, opts) {
  const options = opts || {};
  const merged = mergeTheme(doc.theme);

  const store = {};
  const manifest = [];
  inlineSeq = 0;
  collectChartData(doc, store, manifest, options.fileDir);
  inlineSeq = 0; // reset so the render pass assigns identical data keys

  const nav = renderNav(doc);
  const hero = renderHero(doc, merged);
  const layout = resolveLayout(doc);
  const transformed = layoutToWidgets(layout, doc.sections || [], { next: inlineSeqNext });
  const body = layoutContent(transformed);

  const footer = `<footer class="dg-footer"><p class="dg-note">Generated by dashboard-gen · <a href="https://github.com/xuda1979/dashboard-gen">sources</a></p></footer>`;

  const dataScript = `window.__DG_DATA__ = ${JSON.stringify(store)};`;

  const chartRuntimeScript = bundleChartRuntime(manifest);

  const pageTitle = doc.title || 'Dashboard';
  const lang = doc.lang || 'en';
  const htmlLang = /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(lang) ? lang : 'en';

  return `<!DOCTYPE html>
<html lang="${attr(htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="dashboard-gen v0.1.0">
<title>${attr(pageTitle)}</title>
${doc.description ? `<meta name="description" content="${attr(doc.description)}">` : ''}
<style>
${css(merged.root, merged.dark)}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${nav}
${hero}
${body}
${dataScript}
<script>
${chartRuntimeScript}
</script>
${footer}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

// section widgets are subset of { nav, hero, content } with everything else null.
function asWidgets(sections, state) {
  return (sections || []).map((s, i) => ({
    nav: s.nav != null ? renderComponents(normalizeWidgets(s.nav), state) : null,
    hero: s.hero != null ? renderComponents(normalizeWidgets(s.hero), state) : null,
    content: s.content != null ? renderComponents(s.content, state) : null,
    widgetIndex: i,
  }));
}

// Collision-free anchor ids for section titles, shared by the section title
// renderer and the auto nav so duplicate titles stay valid HTML and every nav
// link resolves: s-<slug>, then s-<slug>-2, s-<slug>-3, ... in document order.
function sectionAnchors(sections) {
  const seen = new Map();
  return (sections || []).map((s) => {
    if (!s || !s.title) return null;
    const base = slugify(s.title);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n === 0 ? `s-${base}` : `s-${base}-${n + 1}`;
  });
}

function sectionTitle(sections, i, anchors) {
  const s = sections[i];
  if (!s || !s.title) return '';
  return `<h2 class="dg-section-title" id="${anchors[i]}">${esc(s.title)}</h2>`;
}

function normalizeWidgets(v) {
  return Array.isArray(v) ? v : [v];
}

// Layout transformer: returns fully rendered widget HTML. `state.next` is the
// shared chart-key counter so chart data ids stay stable across any ordering.
function layoutToWidgets(layout, sections, state) {
  // Drop null/undefined section entries up front (validation only checks the
  // list shape, and collectChartData skips them) so widgets, anchors, and
  // section titles all index the same live list.
  const live = (sections || []).filter((s) => s && typeof s === 'object');
  const widgets = asWidgets(live, state);
  const anchors = sectionAnchors(live);

  switch (layout) {
    case 'hero':
      // Lean structure: sections become the hero columns (first is the lead).
      return `<div class="dg-hero-layout" role="grid">
${widgets
          .map((w, i) => {
            const lead = w.hero || w.content || '';
            return `<div class="dg-hero-col${i === 0 ? ' dg-hero-col--lead' : ''}"${i === 0 ? ' aria-label="Lead"' : ''}>${sectionTitle(live, i, anchors)}${lead}</div>`;
          })
          .join('\n')}
</div>`;

    case 'sidebar':
      // Sticky sidebar built from the first section's `sidebar:` widget; the
      // remaining sections flow into the content column.
      return `<div class="dg-sidebar-wrap">
<aside class="dg-sidebar" aria-label="Sidebar">
${(widgets[0] && widgets[0].nav) || ''}
</aside>
<div class="dg-sidebar-main">
${widgets.map((w, i) => (i === 0 ? `${sectionTitle(live, i, anchors)}${w.content || ''}` : `${sectionTitle(live, i, anchors)}${w.hero || w.content || ''}`)).join('\n')}
</div>
</div>`;

    case 'grid':
      // Sections become equal columns (auto-fit responsive grid).
      return `<div class="dg-layout-grid">
${widgets.map((w, i) => `<div class="dg-layout-grid-item">${sectionTitle(live, i, anchors)}${w.hero || w.content || ''}</div>`).join('\n')}
</div>`;

    case 'section':
    case 'landing':
    default:
      // Regular stacked sections with titles; a `hero:` widget on a section
      // renders as a sub-hero at the top of that section.
      return widgets
        .map((w, i) => {
          const title = sectionTitle(live, i, anchors);
          return `<section class="dg-section">${title}${w.hero ? `<div class="dg-hero dg-hero-sub">${w.hero}</div>` : ''}${w.content || ''}</section>`;
        })
        .join('\n');
  }
}

let inlineSeq = 0;
function inlineSeqNext() {
  return inlineSeq++;
}

// ---------------------------------------------------------------------------
// Nav / hero
// ---------------------------------------------------------------------------

function renderNav(doc) {
  const items = doc.sections || [];
  if (!items.length && !Array.isArray(doc.nav)) return '';
  const links = [];
  if (Array.isArray(doc.nav)) {
    doc.nav.forEach((item) => {
      const label = esc(item.label != null ? item.label : item.href || '');
      const href = attr(item.href || '#');
      links.push(`<li><a class="dg-navlink" href="${href}">${label}</a></li>`);
    });
  }
  if (!links.length && items.length) {
    const anchors = sectionAnchors(items);
    items.forEach((s, i) => {
      // A null/undefined section entry is skipped everywhere else (collectChartData
      // / sectionAnchors); omit it from the auto nav too instead of crashing.
      if (!s || typeof s !== 'object') return;
      const label = esc(s.title ?? '');
      const h = s.title && anchors[i] ? `#${anchors[i]}` : '#';
      links.push(`<li><a class="dg-navlink" href="${h}">${label}</a></li>`);
    });
  }
  if (!links.length) return '';
  return `<nav class="dg-nav" aria-label="Primary"><ul>${links.join('')}</ul></nav>`;
}

function renderHero(doc, merged) {
  const hero = doc.hero;
  if (!hero) return '';
  const list = Array.isArray(hero) ? hero : hero.content;
  const html = renderComponents(list, { next: inlineSeqNext });
  return `<header class="dg-hero"><div class="dg-hero-inner">${html}</div></header>`;
}

// ---------------------------------------------------------------------------
// Chart runtime (self-contained, no external deps)
// ---------------------------------------------------------------------------

function csvToRows(text) {
  return String(text)
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(',').map((c) => c.trim()));
}

function bundleChartRuntime(manifest) {
  // Build runtime JS with the fetch list embedded as JSON.
  const fetchSpecs = (manifest || [])
    .filter((m) => m.url)
    .map((m) => ({ key: m.key, url: m.url }));
  const fileSpecs = (manifest || []).filter((m) => m.file);

  const hash = crypto.createHash('sha1').update(CHART_RUNTIME_SRC).digest('hex').slice(0, 10);
  return CHART_RUNTIME_SRC
    .replace('"__DG_FETCH_SPECS__"', JSON.stringify(fetchSpecs))
    .replace('"__DG_HASH__"', `"${hash}"`);
}

// The runtime source; placeholders replaced at build time.
const CHART_RUNTIME_SRC = `
;(function () {
  'use strict';
  var FETCH_SPECS = "__DG_FETCH_SPECS__";
  var FETCH_BY_KEY = [];
  FETCH_SPECS.forEach(function (s) { FETCH_BY_KEY[s.key] = s.url; });

  var ESC = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var PALETTE = ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
  function colorFor(name, swatches) {
    if (swatches && swatches[name]) return swatches[name];
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n * 100) / 100);
  }
  function safeRows(data) {
    if (!Array.isArray(data)) return [];
    return data;
  }
  // Normalize inline rows: array-of-arrays (with optional header) OR array-of-objects.
  function toPoints(rows) {
    var list = safeRows(rows);
    if (!list.length) return { points: [], series: [] };
    var first = list[0];
    if (Array.isArray(first)) {
      var useHeader = false;
      var header = null;
      var body = list;
      if (first.every(function (c) { return typeof c === 'string' && isNaN(Number(c)); })) {
        useHeader = true;
        header = first;
        body = list.slice(1);
      }
      if (useHeader) {
        var labelKey = header[0];
        var seriesKeys = header.slice(1);
        return {
          points: body.map(function (row) {
            var p = { label: row[0], series: {} };
            seriesKeys.forEach(function (k, i) { p.series[k] = Number(row[i + 1]); });
            return p;
          }),
          series: seriesKeys
        };
      }
      // headerless: label in col 0, one series per remaining column
      var nCols = Math.max.apply(null, body.map(function (r) { return r.length; }));
      var seriesKeys2 = [];
      for (var c = 1; c < nCols; c++) seriesKeys2.push('series' + c);
      return {
        points: body.map(function (row) { var p = { label: row[0], series: {} }; seriesKeys2.forEach(function (k, i) { p.series[k] = Number(row[i + 1]); }); return p; }),
        series: seriesKeys2
      };
    }
    var keys = Object.keys(first);
    var labelKey = keys[0];
    var series = keys.slice(1);
    var nested = first.series && typeof first.series === 'object';
    var seriesKeys = nested ? Object.keys(first.series) : series;
    return {
      points: list.map(function (row) {
        var p = { label: row[labelKey], series: {} };
        if (nested) {
          seriesKeys.forEach(function (k) { p.series[k] = Number(row.series[k]); });
        } else {
          seriesKeys.forEach(function (k) { p.series[k] = Number(row[k]); });
        }
        return p;
      }),
      series: seriesKeys
    };
  }

  function lineSvg(points, series, title, swatches, startValue) {
    var W = 760, H = 340, L = 56, R = 20, T = 22, B = 40;
    var plotW = W - L - R, plotH = H - T - B;
    var all = points;
    var minV = 0, maxV = 1;
    series.forEach(function (s) {
      points.forEach(function (p) {
        var v = p.series[s];
        if (v === null || v === undefined || isNaN(v)) return;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      });
    });
    var pad = (maxV - minV) * 0.1 || 1;
    minV -= pad; maxV += pad;
    // A numeric 'start' pins the y-axis baseline. Never use an x-label as a
    // y-scale anchor: numeric labels (years, timestamps) would set the baseline
    // far above the series and flatten the line into the top of the plot.
    if (typeof startValue === 'number' && !isNaN(startValue)) {
      minV = startValue;
    }
    function x(i) { return points.length <= 1 ? L + plotW / 2 : L + (i / (points.length - 1)) * plotW; }
    function y(v) { return T + plotH - ((v - minV) / (maxV - minV)) * plotH; }
    function gridLines() {
      var out = '';
      for (var i = 0; i <= 4; i++) {
        var val = minV + ((maxV - minV) * i) / 4;
        out += '<line class="dg-grid-h" x1="' + L + '" y1="' + y(val) + '" x2="' + (W - R) + '" y2="' + y(val) + '"/>';
      }
      return out;
    }
    function xLabels() {
      var out = '';
      points.forEach(function (p, i) {
        var label = String(p.label);
        out += '<text class="dg-axis dg-axis-x" x="' + x(i) + '" y="' + (H - 24) + '" text-anchor="middle">' + ESC(label) + '</text>';
      });
      return out;
    }
    function yLabels() {
      var out = '';
      for (var i = 0; i <= 4; i++) {
        var val = minV + ((maxV - minV) * i) / 4;
        out += '<text class="dg-axis" x="' + (L - 6) + '" y="' + (y(val) + 3) + '" text-anchor="end">' + fmt(val) + '</text>';
      }
      return out;
    }
    var seriesHtml = '';
    var legend = '';
    series.forEach(function (s) {
      var col = colorFor(s, swatches);
      var d = '';
      var pts = 0;
      points.forEach(function (p, i) {
        var v = p.series[s];
        if (v === null || v === undefined || isNaN(v)) return;
        d += (pts === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        pts++;
      });
      seriesHtml += '<path class="dg-series" d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/>';
      legend += '<span class="dg-legend"><span class="dg-legend-swatch" style="background:' + col + '"></span>' + ESC(s) + '</span>';
    });
    return '<svg class="dg-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + ESC(title) + ' line chart">' +
      gridLines() + yLabels() + xLabels() + seriesHtml + '</svg>' +
      '<div class="dg-legend-wrap">' + legend + '</div>';
  }

  function barSvg(points, series, title, swatches) {
    var W = 760, H = 320, L = 56, R = 20, T = 22, B = 40;
    var plotW = W - L - R, plotH = H - T - B;
    var maxV = 1;
    series.forEach(function (s) {
      points.forEach(function (p) {
        var v = p.series[s];
        if (v !== null && v !== undefined && !isNaN(v) && v > maxV) maxV = v;
      });
    });
    maxV = Math.ceil(maxV * 1.15) || 1;
    function y(v) { return T + plotH - (v / maxV) * plotH; }
    var groupW = plotW / Math.max(1, points.length);
    var barW = Math.min(36, (groupW * 0.7) / series.length);
    function gridLines() {
      var out = '';
      for (var i = 0; i <= 4; i++) {
        var val = (maxV * i) / 4;
        out += '<line class="dg-grid-h" x1="' + L + '" y1="' + y(val) + '" x2="' + (W - R) + '" y2="' + y(val) + '"/>';
      }
      return out;
    }
    function yLabels() {
      var out = '';
      for (var i = 0; i <= 4; i++) {
        var val = (maxV * i) / 4;
        out += '<text class="dg-axis" x="' + (L - 6) + '" y="' + (y(val) + 3) + '" text-anchor="end">' + fmt(val) + '</text>';
      }
      return out;
    }
    function xLabels() {
      var out = '';
      points.forEach(function (p, i) {
        out += '<text class="dg-axis dg-axis-x" x="' + (L + i * groupW + groupW / 2) + '" y="' + (H - 24) + '" text-anchor="middle">' + ESC(p.label) + '</text>';
      });
      return out;
    }
    var barHtml = '';
    var legend = '';
    series.forEach(function (s, si) {
      var col = colorFor(s, swatches);
      legend += '<span class="dg-legend"><span class="dg-legend-swatch" style="background:' + col + '"></span>' + ESC(s) + '</span>';
      points.forEach(function (p, i) {
        var v = p.series[s];
        if (v === null || v === undefined || isNaN(v)) return;
        var bw = barW, gap = (groupW - bw * series.length) / 2;
        var x = L + i * groupW + gap + si * bw;
        var h = y(0) - y(v);
        barHtml += '<rect class="dg-bar" x="' + x.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + col + '"><title>' + ESC(p.label) + ' ' + ESC(s) + ': ' + v + '</title></rect>';
      });
    });
    return '<svg class="dg-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + ESC(title) + ' bar chart">' +
      gridLines() + yLabels() + xLabels() + barHtml + '</svg>' +
      '<div class="dg-legend-wrap">' + legend + '</div>';
  }

  function pieSvg(points, title, swatches) {
    // Slice sources: a single row with a multi-key 'series' map (the column-row
    // form), or one row per slice (2-column rows like [['Organic', 45], ...] or
    // object rows like { label: 'Organic', value: 45 }).
    var slices = [];
    var oneMap = points.length === 1 && points[0].series && Object.keys(points[0].series).length > 1;
    if (oneMap) {
      Object.keys(points[0].series).forEach(function (k) {
        slices.push({ name: k, value: Number(points[0].series[k]) || 0 });
      });
    } else {
      points.forEach(function (p) {
        if (p.label === undefined || p.label === null || p.label === '') return;
        var s = p.series || {};
        var keys = Object.keys(s);
        var v = keys.length ? Number(s[keys[0]]) || 0 : 0;
        if (v > 0) slices.push({ name: String(p.label), value: v });
      });
    }
    slices = slices.filter(function (s) { return s.value > 0; });
    var total = 0;
    var parts = [];
    var running = 0;
    slices.forEach(function (s) {
      total += s.value;
      parts.push({ name: s.name, value: s.value, start: running, end: running + s.value });
      running += s.value;
    });
    if (!total || !parts.length) {
      return '<p class="dg-note">No data to draw.</p>';
    }
    var CX = 120, CY = 120, R = 90;
    function pt(angle) {
      return [CX + R * Math.cos(angle - Math.PI / 2), CY + R * Math.sin(angle - Math.PI / 2)];
    }
    var paths = '';
    var labels = '';
    var legend = '';
    parts.forEach(function (p) {
      var frac = p.value / total;
      var a1 = (p.start / total) * 2 * Math.PI;
      var a2 = (p.end / total) * 2 * Math.PI;
      var large = a2 - a1 > Math.PI ? 1 : 0;
      var p1 = pt(a1), p2 = pt(a2);
      var col = colorFor(p.name, swatches);
      paths += '<path class="dg-slice" d="M' + CX + ' ' + CY + ' L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + ' Z" fill="' + col + '"><title>' + ESC(p.name) + ': ' + p.value + ' (' + (frac * 100).toFixed(1) + '%)</title></path>';
      var mid = (a1 + a2) / 2;
      var lp = pt(mid);
      var lx = lp[0] + (lp[0] >= CX ? 14 : -14);
      labels += '<text class="dg-label" x="' + lx.toFixed(1) + '" y="' + (lp[1] + 3).toFixed(1) + '" text-anchor="' + (lp[0] >= CX ? 'start' : 'end') + '">' + ESC(p.name) + ' ' + (frac * 100).toFixed(1) + '%</text>';
      legend += '<span class="dg-legend"><span class="dg-legend-swatch" style="background:' + col + '"></span>' + ESC(p.name) + '</span>';
    });
    return '<div class="dg-pie-flex"><svg class="dg-svg dg-svg-pie" viewBox="0 0 240 240" role="img" aria-label="' + ESC(title) + ' pie chart">' + paths + labels + '</svg><div class="dg-legend-wrap">' + legend + '</div></div>';
  }

  function renderOne(figure, id) {
    var type = figure.getAttribute('data-chart-type') || 'line';
    var title = figure.getAttribute('data-chart-title') || 'Chart';
    var swatches = null;
    var swAttr = figure.getAttribute('data-chart-swatches');
    if (swAttr) { try { swatches = JSON.parse(swAttr); } catch (e) {} }
    var startAttr = figure.getAttribute('data-chart-start');
    var startValue = startAttr === null || startAttr === '' ? undefined : Number(startAttr);

    var meta = null;
    try {
      var raw = window.__DG_DATA__ ? window.__DG_DATA__[id] : undefined;
      if (raw === undefined || raw === null) {
        figure.innerHTML = '<p class="dg-note">No data to draw.</p>';
        return;
      }
      var points = toPoints(raw);
      // Empty inputs (explicit data: [] or an empty fetch result) are parsed,
      // not errors — render a no-data note instead of a hollow chart shell so
      // every chart kind degrades the same way.
      if (!points.points.length) {
        figure.innerHTML = '<p class="dg-note">No data to draw.</p>';
        return;
      }
      var bubble = {};
      bubble.points = points.points;
      bubble.series = points.series;
      bubble.title = title;
      bubble.swatches = swatches;
      bubble.startValue = startValue;
      meta = { points: points.points, series: points.series };
    } catch (e) {
      figure.innerHTML = '<p class="dg-error">Chart data parse failed.</p>';
      return;
    }
    var html;
    if (type === 'pie') html = pieSvg(meta.points, title, swatches);
    else if (type === 'bar') html = barSvg(meta.points, meta.series, title, swatches);
    else html = lineSvg(meta.points, meta.series, title, swatches, startValue);
    figure.innerHTML = html;
  }

  function init() {
    var figures = document.querySelectorAll('.dg-chart[data-chart-data]');
    var pending = [];
    Array.prototype.forEach.call(figures, function (f) {
      var id = f.getAttribute('data-chart-data');
      var url = FETCH_BY_KEY[id];
      if (url && !(window.__DG_DATA__ && window.__DG_DATA__[id] !== undefined)) {
        var p = fetch(url)
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (data) { window.__DG_DATA__[id] = Array.isArray(data) ? data : (data && data.data) ? data.data : []; })
          .catch(function (err) {
            f.innerHTML = '<p class="dg-error">Failed to load chart data: ' + ESC(err && err.message ? err.message : 'fetch error') + '</p>';
          })
          .then(function () {
            if (window.__DG_DATA__ && window.__DG_DATA__[id] !== undefined) renderOne(f, id);
          });
        pending.push(p);
      } else {
        renderOne(f, id);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

// ---------------------------------------------------------------------------

module.exports = {
  renderPage,
  resolveLayout,
  mergeTheme,
  csvToRows,
  collectFetchSpecs,
};

// Extract fetch URLs from a doc (used by the CLI to copy local data fixtures).
function collectFetchSpecs(doc) {
  const out = [];
  function visit(comp) {
    if (!comp || typeof comp !== 'object') return;
    if (Array.isArray(comp)) {
      comp.forEach(visit);
      return;
    }
    if (comp.type === 'chart' && comp.data && typeof comp.data === 'object' && typeof comp.data.fetch === 'string') {
      out.push(comp.data.fetch);
    }
    Object.keys(comp).forEach((k) => {
      const v = comp[k];
      if (v && typeof v === 'object') visit(v);
    });
  }
  if (doc.hero) visit(doc.hero);
  if (doc.sections) visit(doc.sections);
  return out;
}
