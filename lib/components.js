// Per-type component renderers. Each returns an HTML fragment string.
// Charts render a placeholder shell (filled by the inline runtime below an
// inline-data bootstrap) so the page needs zero external dependencies.

const { StyleError } = require('./errors');

// ---------------------------------------------------------------------------
// Escape utilities
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(value) {
  return esc(value);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Image asset mimes: raster embeds as base64, SVG stays textual (escaped into
// the data URI) so the single-file build keeps zero external requests.
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

function normalizeText(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/\\n/g, '\n');
}

function isTextField(v) {
  return isObj(v) && typeof v.text === 'string';
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderHeadline(c) {
  const level = /^[1-6]$/.test(String(c.level || '')) ? c.level : 2;
  const id = c.id ? ` id="${attr(c.id)}"` : '';
  const text = normalizeText(c.text);
  return `<h${level}${id} class="dg-headline dg-h${level}">${esc(text)}</h${level}>`;
}

function renderParagraph(c) {
  // object form: { text, href, newtab } -> inline link paragraph
  if (isTextField(c) && (c.href || isObj(c.link))) {
    const href = c.href || (isObj(c.link) ? c.link.href : '');
    const newtab = !!(c.newtab || (isObj(c.link) && c.link.newtab));
    return `<p class="dg-paragraph">${esc(normalizeText(c.text))} ` +
      `<a href="${attr(href)}" class="dg-link"${newtab ? ' target="_blank" rel="noopener"' : ''}>${esc(href)}</a></p>`;
  }
  return `<p class="dg-paragraph">${esc(normalizeText(c.text || ''))}</p>`;
}

function renderList(c) {
  const items = Array.isArray(c.items) ? c.items.map(normalizeText) : [];
  const cls = c.ordered ? 'dg-ol' : 'dg-ul';
  const tag = c.ordered ? 'ol' : 'ul';
  return `<${tag} class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>`;
}

// Numbered procedure list (runbook / setup steps): each item gets an explicit
// step-number chip in the DOM (visible and read by assistive tech) while the
// wrapping <ol> keeps the ordered-list semantics for screen readers.
function renderSteps(c) {
  const items = Array.isArray(c.items) ? c.items.map(normalizeText) : [];
  return `<ol class="dg-steps">${items
    .map(
      (text, i) =>
        `<li class="dg-steps-item"><span class="dg-steps-num">${i + 1}</span><span class="dg-steps-text">${esc(text)}</span></li>`
    )
    .join('')}</ol>`;
}

function renderButton(c) {
  const style = ['primary', 'secondary', 'subtle', 'danger'].includes(c.style)
    ? c.style
    : 'primary';
  const text = normalizeText(c.text || 'Button');
  const icon = c.icon ? `<svg class="dg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>` : '';
  if (c.href) {
    return `<a href="${attr(c.href)}" class="dg-btn dg-btn--${style}"${c.newtab ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}${icon}</a>`;
  }
  return `<button type="button" class="dg-btn dg-btn--${style}">${esc(text)}${icon}</button>`;
}

function renderLink(c) {
  const text = normalizeText(c.text || c.label || 'Link');
  const mode = c.style === 'button' ? ' dg-btn dg-btn--primary' : '';
  return `<a href="${attr(c.href || '#')}" class="dg-link${mode}"${c.newtab ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`;
}

function renderCard(c) {
  const intent = ['primary', 'secondary', 'success', 'danger', 'warning'].includes(c.intent) ? c.intent : '';
  let title = '';
  if (c.title) {
    const t = isTextField(c.title) ? c.title.text : c.title;
    title = `<h3 class="dg-card-title">${esc(normalizeText(t))}</h3>`;
  }
  return `<div class="dg-card${intent ? ` dg-card--${intent}` : ''}">${title}${esc(normalizeText(c.text || ''))}</div>`;
}

// Shared delta parsing for stat and stat-list: `delta` is a raw number, a
// numeric string, or { value, tone: good|bad|neutral }. Returns
// { delta, deltaText, deltaTone } where delta is the parsed number or null
// and deltaTone is the validated tone name ('' = neutral).
function parseDelta(c) {
  let delta = null;
  let deltaTone = '';
  if (c.delta !== undefined && c.delta !== null) {
    let raw = null;
    if (typeof c.delta === 'object' && typeof c.delta.value === 'number') {
      raw = c.delta.value;
      deltaTone = ['good', 'bad', 'neutral'].includes(c.delta.tone) ? c.delta.tone : '';
    } else if (typeof c.delta === 'number' || typeof c.delta === 'string') {
      const n = Number(c.delta);
      if (Number.isFinite(n)) raw = n;
    }
    if (raw !== null) delta = raw;
  }
  const deltaText =
    delta === null
      ? ''
      : delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : `${delta}`;
  return { delta, deltaText, deltaTone };
}

// KPI/metric card: a labelled figure with a large value, an optional delta
// trend (good/bad/neutral), and an optional progress bar. Keeps the dashboard
// read-only: no interactivity, semantic text for screen readers.
function renderStat(c) {
  const value = normalizeText(c.value);
  const label = normalizeText(c.label || c.title || '');
  const prefixText = c.prefix ? normalizeText(c.prefix) : '';
  const suffixText = c.suffix ? normalizeText(c.suffix) : '';
  const caption = c.caption ? normalizeText(c.caption) : '';
  const { delta, deltaText, deltaTone } = parseDelta(c);
  const deltaToneAttr = deltaTone ? ` dg-stat-delta--${deltaTone}` : '';

  let progress = '';
  let progressName = '';
  if (c.progress !== undefined && c.progress !== null) {
    const pct = Number(c.progress);
    if (Number.isFinite(pct)) {
      const p = Math.max(0, Math.min(100, pct));
      const pTone = ['primary', 'success', 'warning', 'danger'].includes(c.progressTone)
        ? c.progressTone
        : 'primary';
      const pLabel = c.progressLabel ? normalizeText(c.progressLabel) : `${p}%`;
      progressName = pLabel;
      progress = `<div class="dg-stat-progress" aria-label="${attr(pLabel)}" role="img"><span class="dg-stat-progress-fill dg-stat-progress-fill--${pTone}" style="width:${p}%"></span></div>`;
    }
  }

  const deltaHtml = delta !== null ? `<div class="dg-stat-delta${deltaToneAttr}">${deltaText}</div>` : '';
  const captionHtml = caption ? `<div class="dg-stat-caption">${esc(caption)}</div>` : '';

  // The wrapper is role="img", which makes its children presentational to
  // assistive tech; spell the figure's data in the accessible name (matching
  // gauge and progress) so a screen reader hears more than the bare label.
  const figureText = `${prefixText}${value}${suffixText}`;
  const nameParts = label ? [`${label}: ${figureText}`] : [figureText];
  if (delta !== null) nameParts.push(deltaText);
  if (progressName) nameParts.push(progressName);

  return `<div class="dg-stat" role="img" aria-label="${attr(nameParts.join(', '))}">
  <div class="dg-stat-value">${esc(figureText)}</div>
  <div class="dg-stat-label">${esc(label)}</div>
  ${deltaHtml}${progress}${captionHtml}
</div>`;
}

// Auto-generated table of contents: a <nav> of links to every titled section
// on the page (the same s-<slug> anchors the section titles and auto nav use).
// The renderer reads the section list and anchors from state, which render.js
// threads through as it expands the layout, so a toc anywhere in the page (hero
// or a section content block) reflects all sections. `label` names the
// landmark; without titled sections the block renders nothing (like the auto
// nav, which only appears when there is a section to link).
function renderToc(c, state) {
  const sections = (state && state.sections) || [];
  const anchors = (state && state.sectionAnchors) || [];
  const links = sections
    .map((s, i) => {
      if (!s || typeof s !== 'object' || !s.title) return '';
      const anchor = anchors[i];
      const href = anchor ? `#${anchor}` : '#';
      const label = esc(normalizeText(s.title));
      return `<li><a class="dg-toc-link" href="${href}">${label}</a></li>`;
    })
    .join('');
  if (!links) return '';
  const label = c.label ? ` aria-label="${attr(normalizeText(c.label))}"` : ' aria-label="Contents"';
  return `<nav class="dg-toc"${label}><ul>${links}</ul></nav>`;
}

// KPI row list: a screen-reader-friendly band of label/value rows with the
// same optional delta trend as stat. A semantic <table> keeps the rows
// announceable (the value column is the cell text, not an image), the first
// cell is a row header when an explicit header is set, and the page stays
// zero-JS. Items are { label, value, prefix/suffix, delta }; a `caption` names
// the table for assistive tech; empty/missing items degrade to a no-data note
// like a table with no rows.
function renderStatList(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const rowHtml = items
    .map((item) => {
      const src = isObj(item) ? item : {};
      // A bare string item is treated as its label (an object carries
      // label/title) — the same string-shorthand kv uses for its keys.
      const label = normalizeText(isObj(item) ? (src.label || src.title || '') : String(item));
      const prefix = src.prefix ? esc(normalizeText(src.prefix)) : '';
      const suffix = src.suffix ? esc(normalizeText(src.suffix)) : '';
      const value = normalizeText(src.value);
      const { delta, deltaText, deltaTone } = parseDelta(src);
      const deltaCell = delta !== null
        ? `<td class="dg-statlist-delta dg-statlist-delta--${deltaTone || 'neutral'}">${deltaText}</td>`
        : '';
      return `<tr class="dg-statlist-row"><th scope="row">${esc(label)}</th><td class="dg-statlist-value">${prefix}${esc(value)}${suffix}</td>${deltaCell}</tr>`;
    })
    .join('\n');
  const body = rowHtml || '<tr><td class="dg-note" colspan="3">No data to draw.</td></tr>';
  const label = c.caption ? ` aria-label="${attr(normalizeText(c.caption))}"` : '';
  return `<div class="dg-scroll"><table class="dg-statlist"${label}><tbody>\n${body}\n</tbody></table></div>`;
}

function renderBadge(c) {
  const tone = ['neutral', 'primary', 'success', 'warning', 'danger'].includes(c.tone)
    ? c.tone
    : 'neutral';
  const text = normalizeText(c.text || '');
  return `<span class="dg-badge dg-badge--${tone}">${esc(text)}</span>`;
}

function renderDivider(c) {
  return '<hr class="dg-divider">';
}

function renderQuote(c) {
  const cite = c.cite
    ? `<footer class="dg-quote-cite">— ${esc(isTextField(c.cite) ? c.cite.text : normalizeText(c.cite))}</footer>`
    : '';
  return `<blockquote class="dg-quote"><p>${esc(normalizeText(c.text || ''))}</p>${cite}</blockquote>`;
}

// Block code snippet: install/usage/config examples for internal-tool pages.
// `code` is a string or a list of lines; `lang` shows a small label; `title`
// gives the block a labelled header. Content is fully HTML-escaped so markup
// samples render as text, and a bare snippet carries no aria-prefix (plain
// <pre> reads fine to assistive tech without a region role).
function renderCode(c) {
  const title = c.title ? normalizeText(c.title) : '';
  const lang = c.lang ? normalizeText(c.lang) : '';
  const body = Array.isArray(c.code) ? c.code.join('\n') : normalizeText(c.code || '');
  const headerBits = [];
  if (title) headerBits.push(`<span class="dg-code-title">${esc(title)}</span>`);
  if (lang) headerBits.push(`<span class="dg-code-lang">${esc(lang)}</span>`);
  const header = headerBits.length ? `<div class="dg-code-header">${headerBits.join('')}</div>` : '';
  const regionAttrs = title ? ` role="region" aria-label="${attr(title)}"` : '';
  const langAttr = lang ? ` data-code-lang="${attr(lang)}"` : '';
  return `<div class="dg-code"${regionAttrs}${langAttr}>${header}<pre class="dg-code-pre"><code class="dg-code-body">${esc(body)}</code></pre></div>`;
}

// Notice/callout block: maintenance windows, status flags, usage tips. `tone`
// sets the accent (primary/success/warning/danger/neutral); an optional
// `title` gets a labelled header and the block becomes a role="note" landmark
// so assistive tech can jump straight to it. A bare callout stays a plain
// div (the note role needs an accessible name).
function renderCallout(c) {
  const tone = ['primary', 'success', 'warning', 'danger', 'neutral'].includes(c.tone)
    ? c.tone
    : 'primary';
  const title = c.title ? normalizeText(c.title) : '';
  const titleHtml = title ? `<div class="dg-callout-title">${esc(title)}</div>` : '';
  const noteAttr = title ? ` role="note" aria-label="${attr(title)}"` : '';
  const body = normalizeText(c.text || '');
  return `<div class="dg-callout dg-callout--${tone}"${noteAttr}>${titleHtml}<p class="dg-callout-body">${esc(body)}</p></div>`;
}

// Container: a responsive grid of cards. `items` entries are either full
// component objects ({type: "card", ...}) or shorthands ({title, text, intent}).
function renderGrid(c, state) {
  const cols = Number(c.columns) || 3;
  const width = Number(c.columnWidth);
  const min = isFinite(width) ? `${c.columnWidth}px` : c.columnWidth || '220px';
  // When `columns` is set it wins (fixed N-column grid); otherwise fall back
  // to fluid auto-fill columns driven by `columnWidth`/220px minimum.
  const columnsStyle = c.columns
    ? `grid-template-columns: repeat(${cols}, minmax(0, 1fr));`
    : `grid-template-columns: repeat(auto-fill, minmax(${min}, 1fr));`;
  const items = Array.isArray(c.items) ? c.items : [];
  const cells = items
    .map((item) => {
      if (item && typeof item === 'object' && item.type) {
        return `<div class="dg-cell">${invoke(item, state)}</div>`;
      }
      if (item && typeof item === 'object' && item.card) {
        return `<div class="dg-cell">${renderCard(item.card)}</div>`;
      }
      if (item && typeof item === 'object' && (item.title || item.text)) {
        return `<div class="dg-cell">${renderCard({ title: item.title, text: item.text, intent: item.intent })}</div>`;
      }
      return `<div class="dg-cell">${esc(String(item))}</div>`;
    })
    .join('\n');
  return `<div class="dg-grid" style="${columnsStyle}" data-grid-cols="${cols}">\n${cells}\n</div>`;
}

// Table rows: array of arrays (first string row = header by default) OR array
// of objects (header = union of keys). `headerOverride` (from `header:` on the
// component) forces header/no-header for array-of-arrays data.
function rowsToTableData(rows, headerOverride) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { hasHeader: false, header: null, body: [] };
  }
  if (Array.isArray(rows[0])) {
    let body = rows;
    let header = null;
    // A header is auto-detected only when the first row is all strings: numeric
    // first rows are data, not column titles (a label+value row like ["Jan", 10]
    // must stay in the body). `header: true` still forces a header.
    const strings = rows[0].every((cell) => typeof cell === 'string');
    if (headerOverride === true || (headerOverride !== false && strings)) {
      header = rows[0];
      body = rows.slice(1);
    }
    return {
      hasHeader: !!header,
      header,
      body: body.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
    };
  }
  // objects -> union of keys
  const keys = [];
  rows.forEach((row) => {
    if (isObj(row)) Object.keys(row).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
  });
  return {
    hasHeader: true,
    header: keys,
    body: rows.map((row) => keys.map((k) => {
      const v = isObj(row) ? row[k] : row;
      return v == null ? '' : v;
    })),
  };
}

function renderTable(c) {
  const { hasHeader, header, body } = rowsToTableData(c.rows, c.header);
  const label = c.caption ? ` aria-label="${attr(normalizeText(c.caption))}"` : '';
  let out = `<div class="dg-scroll"><table class="dg-table"${label}>`;
  if (hasHeader) {
    out += '<thead><tr>';
    header.forEach((h) => { out += `<th scope="col">${esc(h)}</th>`; });
    out += '</tr></thead>';
  }
  out += '<tbody>';
  body.forEach((row) => {
    out += '<tr>';
    row.forEach((cell, j) => {
      if (!hasHeader && j === 0) out += `<th scope="row">${esc(cell)}</th>`;
      else out += `<td>${esc(cell)}</td>`;
    });
    out += '</tr>';
  });
  out += '</tbody></table></div>';
  // An empty/absent rows list is not a visible table; render the same no-data
  // note the chart runtime uses so the section never shows a hollow empty
  // element.
  if (!body.length && !hasHeader) {
    return '<div class="dg-scroll"><p class="dg-note">No data to draw.</p></div>';
  }
  return out;
}

// Key/value definition list (spec/detail pages): a static <dl> of term/value
// pairs. Each item is { key, value } (`key` aliased by `label`); the term is a
// <dt> and the value a <dd>, so assistive tech and the DOM keep the pairing.
// Missing items render an empty container rather than throwing.
function renderKv(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const rows = items.map((item) => {
    const key = isObj(item) ? item.key || item.label || '' : String(item);
    const value = isObj(item) ? item.value : '';
    return `<div class="dg-kv-row"><dt>${esc(normalizeText(key))}</dt><dd>${esc(normalizeText(value))}</dd></div>`;
  });
  return `<dl class="dg-kv">${rows.join('')}</dl>`;
}

// Chart shell: rendered server-side, hydrated client-side. Render.js collects
// inline rows into window.__DG_DATA__ under the same dataId this figure emits:
//   - inline rows / { csv } / { json } -> dataId keys the embedded store
//   - a fetch spec { fetch: url } -> preserved as data-chart-source for the
//     runtime to load
//   - a local data file (file: data.json|.csv) -> resolved at build time
// The figure always carries an accessible name (caption or title) and role="img".
function renderChart(c, state) {
  const type = ['line', 'bar', 'pie'].includes(c.kind) ? c.kind : 'line';
  // The store (render.js collect pass) keys rows under the same id.
  const dataId = c.dataId || `chart-${state.next()}`;
  const title = normalizeText(c.title || 'Chart');
  const caption = c.caption ? normalizeText(c.caption) : '';
  const figureLabel = caption || title;
  const source = isObj(c.data) && typeof c.data.fetch === 'string' ? c.data.fetch : '';
  const swatches = c.swatches && isObj(c.swatches) ? JSON.stringify(c.swatches).replace(/"/g, '&quot;') : '';
  const start = c.start !== undefined ? String(c.start) : '';

  let attrs = ` data-chart-type="${attr(type)}" data-chart-title="${attr(title)}" data-chart-data="${attr(dataId)}"`;
  if (source) attrs += ` data-chart-source="${attr(source)}"`;
  if (swatches) attrs += ` data-chart-swatches="${swatches}"`;
  if (start) attrs += ` data-chart-start="${attr(start)}"`;
  const note = caption ? `<p class="dg-note">${esc(caption)}</p>\n` : '';

  return `<div class="dg-figure dg-chart"${attrs} role="img" aria-label="${attr(figureLabel)}">
  <div class="dg-chart-title">${esc(title)}</div>
  ${note}<noscript><p class="dg-note">Chart renders with JavaScript enabled.</p></noscript>
</div>`;
}

// Build-time static trend: a compact single-series sparkline rendered as inline
// SVG at build time — no runtime, no fetch, no JS (unlike a chart figure, which
// only takes shape client-side). `data` accepts plain numbers, [label, value]
// pairs, or { value } / { label, value } rows (the same value shapes chart rows
// use); `title` names the figure and an optional `caption` adds a note line.
// The figure exposes itself as role="img" with an accessible name (a11y check
// 6) while the SVG stays decorative (aria-hidden), mirroring how stat figures
// label a visually rich value. Empty or all-non-numeric data degrades to the
// no-data note the table renderer uses; a single point draws as a centered dot.
function renderSparkline(c) {
  const title = normalizeText(c.title || 'Trend');
  const caption = c.caption ? normalizeText(c.caption) : '';
  const values = sparklineValues(c.data);

  let svg = '';
  if (values.length > 0) {
    const W = 100;
    const H = 32;
    const TOP = 3;
    const BOT = H - TOP;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const x = (i) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * W);
    const y = (v) => BOT - ((v - min) / range) * (BOT - TOP);
    const pts = values.map((v, i) => [
      Math.round(x(i) * 10) / 10,
      Math.round(y(v) * 10) / 10,
    ]);
    const last = pts[pts.length - 1];
    const path = pts.length >= 2
      ? `<path class="dg-sparkline-line" d="M${pts.map((p) => ` ${p[0]} ${p[1]}`).join('L')}"/>`
      : '';
    svg =
      `<svg class="dg-sparkline-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">` +
      path +
      `<circle class="dg-sparkline-dot" cx="${last[0]}" cy="${last[1]}" r="2.5"/>` +
      `</svg>`;
  }

  const note = values.length === 0 ? '<p class="dg-note">No data to draw.</p>' : '';
  const cap = caption ? `<p class="dg-note dg-sparkline-cap">${esc(caption)}</p>` : '';
  const label = caption || title;
  return `<div class="dg-figure dg-sparkline" role="img" aria-label="${attr(label)}">\n` +
    `<div class="dg-sparkline-title">${esc(title)}</div>\n` +
    `${svg}${note}${cap}\n</div>`;
}

// The value shapes chart rows accept: numbers, [label, value] / [value] pairs,
// and { value } / { label, value } rows. Non-numeric entries drop out so a
// mixed or sparse series still plots its numeric core.
function sparklineValues(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => {
      let n;
      if (isObj(d)) n = d.value ?? d[1];
      else if (Array.isArray(d)) n = d[1] ?? d[0];
      else n = d;
      const v = Number(n);
      return Number.isFinite(v) ? v : NaN;
    })
    .filter((v) => Number.isFinite(v));
}

// Service-health list: a static status strip of services/components and their
// last-known state. Items are { name|service, state, detail } (a bare string
// lists the name alone); `state` is one of healthy/degraded/down/maintenance
// and is spelled as visible text — never color-only — so assistive tech reads
// the meaning directly (a11y check 6, color-not-sole-signal), with the dot
// purely decorative (aria-hidden). An unrecognized state falls back to a
// neutral "unknown" carried as the raw text; a missing state reads "Unknown".
// Blank names, non-array items, and an all-empty list degrade away.
const STATUS_STATES = new Set(['healthy', 'degraded', 'down', 'maintenance']);

function renderStatus(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const entries = items
    .map((item) => {
      let name = '';
      let state = '';
      let detail = '';
      if (isObj(item)) {
        name = normalizeText(item.name || item.service || '');
        state = item.state === undefined || item.state === null ? '' : String(item.state).toLowerCase().trim();
        detail = normalizeText(item.detail || '');
      } else if (typeof item === 'string') {
        name = normalizeText(item);
      }
      if (!name.trim()) return '';
      const key = STATUS_STATES.has(state) ? state : 'unknown';
      const label = key === 'unknown'
        ? (state || 'Unknown')
        : state.charAt(0).toUpperCase() + state.slice(1);
      return `<li class="dg-status-item dg-status-item--${key}">` +
        `<span class="dg-status-dot dg-status-dot--${key}" aria-hidden="true"></span>` +
        `<span class="dg-status-name">${esc(name)}</span>` +
        `<span class="dg-status-state dg-status-state--${key}">${esc(label)}</span>` +
        (detail ? `<span class="dg-status-detail">${esc(detail)}</span>` : '') +
        `</li>`;
    })
    .filter(Boolean)
    .join('');
  if (!entries) return '';
  const title = c.title ? `<div class="dg-status-title">${esc(normalizeText(c.title))}</div>` : '';
  return `<div class="dg-status">${title}<ul class="dg-status-list">${entries}</ul></div>`;
}

// Intensity heatmap: a weekday/hour (or any category × category) density grid
// rendered as a real <table> so every cell carries its numeric value as text —
// the color ramp is decoration, never the sole signal (a11y check 6). `rows`
// are labels or { label, values } objects (bare labels pull their row from the
// `data` matrix); `columns` label the grid; values map onto a 1..5 intensity
// class scaled by the row maximum (zero/no-value cells render a muted "·" at
// --l0) and the wrap carries a Low→High legend in visible text. Non-finite
// values, ragged rows (truncated/padded to column count), and an all-empty or
// missing grid degrade away so no dead markup renders.
function renderHeatmap(c) {
  const title = normalizeText(c.title || 'Heatmap');
  const columns = Array.isArray(c.columns) ? c.columns.map(normalizeText).filter(Boolean) : [];
  const rows = Array.isArray(c.rows) ? c.rows : [];
  if (!columns.length || !rows.length) return '';

  const grid = [];
  const data = Array.isArray(c.data) ? c.data : [];
  rows.forEach((row, i) => {
    let label;
    let values;
    if (isObj(row)) {
      label = normalizeText(row.label || row.name || '');
      values = Array.isArray(row.values) ? row.values : [];
    } else {
      label = normalizeText(row);
      values = Array.isArray(data[i]) ? data[i] : [];
    }
    if (!label.trim()) return;
    const nums = values
      .map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      })
      .slice(0, columns.length);
    while (nums.length < columns.length) nums.push(0);
    grid.push({ label, values: nums, max: Math.max(...nums) });
  });
  if (!grid.length) return '';

  const level = (v, rowMax) => (v <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((v / rowMax) * 5))));
  const cell = (v, rowMax) => {
    const l = level(v, rowMax);
    const text = v <= 0 ? '·' : String(v);
    return `<td class="dg-heatmap-cell dg-heatmap-cell--l${l}">${esc(text)}</td>`;
  };

  const head = `<tr><th scope="col" class="dg-heatmap-corner"></th>${columns
    .map((c) => `<th scope="col">${esc(c)}</th>`)
    .join('')}</tr>`;
  const body = grid
    .map(
      (r) =>
        `<tr><th scope="row">${esc(r.label)}</th>${r.values.map((v) => cell(v, r.max)).join('')}</tr>`
    )
    .join('');
  const legend = [0, 1, 2, 3, 4, 5]
    .map((l) => `<i class="dg-heatmap-cell dg-heatmap-cell--l${l}" aria-hidden="true"></i>`)
    .join('');
  return `<div class="dg-heatmap">\n` +
    `<div class="dg-heatmap-title">${esc(title)}</div>\n` +
    `<div class="dg-scroll"><table class="dg-heatmap-table" aria-label="${attr(title)}">` +
    `<thead>${head}</thead><tbody>${body}</tbody></table></div>\n` +
    `<div class="dg-heatmap-legend"><span class="dg-heatmap-legend-label">Low</span>${legend}<span class="dg-heatmap-legend-label">High</span></div>\n` +
    `</div>`;
}

// Labelled completion bar: a standalone progress strip with the percentage
// always rendered as visible text next to the fill, so width/color are
// decoration, never the sole signal (a11y check 6). The wrap exposes itself
// as role="img" with the label + percent spelled as its accessible name
// (matching stat's progress bar). `value` is clamped to 0-100; `tone`
// (primary/success/warning/danger) recolors the fill; a missing label is
// omitted; a non-finite value degrades away so no dead markup renders.
function renderProgress(c) {
  const raw = Number(c.value);
  if (!Number.isFinite(raw)) return '';
  const pct = Math.max(0, Math.min(100, raw));
  const tone = ['primary', 'success', 'warning', 'danger'].includes(c.tone) ? c.tone : 'primary';
  const label = normalizeText(c.label || c.title || '');
  const text = `${pct}%`;
  const name = label ? `${label}: ${text}` : text;
  const labelHtml = label ? `<div class="dg-progress-label">${esc(label)}</div>\n` : '';
  return `<div class="dg-progress" role="img" aria-label="${attr(name)}">\n` +
    `${labelHtml}<div class="dg-progress-track"><span class="dg-progress-fill dg-progress-fill--${tone}" style="width:${pct}%"></span></div>\n` +
    `<div class="dg-progress-value">${text}</div>\n` +
    `</div>`;
}

// Console transcript: a replay of CLI output for deploy/rollback /runbook
// procedures — what the paste-into-the-terminal steps actually print. `items`
// are strings (plain output at info level) or { text, level } where level is
// cmd/info/ok/warn/err. A `prompt` (default `$`) prefixes command lines, and
// ok/warn/err spell their level as a visible uppercase tag before the text so
// tone is decoration, never the sole signal (a11y check 6). An unknown level
// falls back to info; multiline text splits into one line per break; blank
// lines are skipped. A bare block reads as plain text to assistive tech; a
// `title` turns the wrapper into a labelled region.
const TERMINAL_LEVELS = ['cmd', 'info', 'ok', 'warn', 'err'];
function renderTerminal(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const lines = [];
  for (const item of items) {
    const obj = isObj(item);
    const text = normalizeText(obj ? item.text : item);
    if (/^\s*$/.test(text)) continue;
    const level = obj && TERMINAL_LEVELS.includes(item.level) ? item.level : 'info';
    for (const part of text.split('\n')) {
      lines.push({ text: part, level });
    }
  }
  if (lines.length === 0) return '';
  const prompt = normalizeText(c.prompt || '$');
  const body = lines
    .map(({ text, level }) => {
      if (level === 'cmd') {
        return `<span class="dg-terminal-line dg-terminal-line--cmd">${esc(prompt)} ${esc(text)}</span>`;
      }
      const tag = level === 'info' ? '' : `<span class="dg-tl-tag">${level}</span> `;
      return `<span class="dg-terminal-line dg-terminal-line--${level}">${tag}${esc(text)}</span>`;
    })
    .join('\n');
  const title = normalizeText(c.title || '');
  const header = title ? `<div class="dg-terminal-header"><span class="dg-terminal-title">${esc(title)}</span></div>` : '';
  const regionAttrs = title ? ` role="region" aria-label="${attr(title)}"` : '';
  return `<div class="dg-terminal"${regionAttrs}>${header}<pre class="dg-terminal-body">${body}</pre></div>`;
}

// Semicircular gauge readout: a build-time SVG arc (viewBox 0 0 100 58, center
// 50,50 radius 40) whose sweep shows value's position between `min` (default
// 0) and `max` (default 100). The value is always rendered as visible text in
// the readout, so the arc color/shape are decoration, never the sole signal
// (a11y check 6); the wrapper exposes role="img" with "label: value suffix"
// spelled as its accessible name (matching progress). `tone`
// (primary/success/warning/danger) recolors the arc; `suffix` (%, ms) and
// `caption` are optional. A non-finite value, a non-finite or empty
// min..max range, and a value that leaves the range undefined all degrade
// away so no dead markup renders; the value itself is clamped into range.
function renderGauge(c) {
  const min = Number(c.min === undefined ? 0 : c.min);
  const max = Number(c.max === undefined ? 100 : c.max);
  const raw = Number(c.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(raw) || max <= min) return '';
  const f = Math.max(0, Math.min(1, (raw - min) / (max - min)));
  const tone = ['primary', 'success', 'warning', 'danger'].includes(c.tone) ? c.tone : 'primary';
  const suffix = c.suffix ? normalizeText(c.suffix) : '';
  const numeric = String(raw);
  const label = normalizeText(c.label || c.title || '');
  const name = label ? `${label}: ${numeric}${suffix}` : `${numeric}${suffix}`;

  const CX = 50;
  const CY = 50;
  const R = 40;
  const track = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  let arc = '';
  if (f > 0) {
    const rad = (Math.PI / 180) * (180 + 180 * f);
    const ex = Math.round((CX + R * Math.cos(rad)) * 100) / 100;
    const ey = Math.round((CY + R * Math.sin(rad)) * 100) / 100;
    arc = f >= 1
      ? track
      : `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${ex} ${ey}`;
  }
  const svg = '<svg class="dg-gauge-svg" viewBox="0 0 100 58" aria-hidden="true" focusable="false">' +
    `<path class="dg-gauge-track" d="${track}"/>` +
    (arc ? `<path class="dg-gauge-arc dg-gauge-arc--${tone}" d="${arc}"/>` : '') +
    '</svg>';
  const caption = c.caption ? `<p class="dg-note dg-gauge-cap">${esc(normalizeText(c.caption))}</p>` : '';
  return `<div class="dg-figure dg-gauge" role="img" aria-label="${attr(name)}">\n` +
    `<div class="dg-gauge-title">${esc(label)}</div>\n` +
    `<div class="dg-gauge-main">${svg}` +
    `<div class="dg-gauge-readout"><span class="dg-gauge-value">${esc(numeric + suffix)}</span>` +
    `<span class="dg-gauge-range">${esc(String(min))} – ${esc(String(max))}</span></div></div>\n` +
    `${caption}</div>`;
}

// Breadcrumb trail: an <nav aria-label="..."> (default "Breadcrumb",
// overridable via `label`) wrapping an <ol> whose items are strings or
// { label, href }. Every item with an href becomes a link; the final item is
// the current page and always renders as plain text marked with
// aria-current="page". Trail items without an href render as plain text spans.
// Entries that are neither a string nor an object are malformed and skipped,
// so they cannot leak empty slots into the trail. A missing, empty, or
// all-blank items list degrades away entirely so no dead nav markup renders
// (a11y check 3 wants every nav labelled).
function renderBreadcrumbs(c) {
  const raw = c.items;
  if (!Array.isArray(raw) || raw.length === 0) return '';
  const trail = raw
    .filter((item) => typeof item === 'string' || isObj(item))
    .map((item) => {
      if (typeof item === 'string') return { label: item, href: '' };
      return { label: item.label || item.text || '', href: item.href || '' };
    });
  if (trail.every((t) => !t.label)) return '';
  const navLabel = normalizeText(c.label || 'Breadcrumb');
  const entries = trail.map((t, i) => {
    const label = normalizeText(t.label);
    const isLast = i === trail.length - 1;
    if (isLast) {
      return `<li class="dg-breadcrumbs-item"><span class="dg-breadcrumbs-current" aria-current="page">${esc(label)}</span></li>`;
    }
    return t.href
      ? `<li class="dg-breadcrumbs-item"><a class="dg-breadcrumbs-link" href="${attr(t.href)}">${esc(label)}</a></li>`
      : `<li class="dg-breadcrumbs-item"><span class="dg-breadcrumbs-text">${esc(label)}</span></li>`;
  });
  return `<nav class="dg-breadcrumbs" aria-label="${attr(navLabel)}"><ol class="dg-breadcrumbs-list">${entries.join('')}</ol></nav>`;
}

// Static image: resolved at build time and embedded as a data URI so the
// generated page stays a single offline file. `file` is a path relative to the
// source YAML (or absolute); a caption wraps the image in a labelled <figure>.
// Always emits alt (required by the a11y check) — falls back to the caption.
function renderImage(c, state) {
  const { DataFileError } = require('./errors');
  const fs = require('node:fs');
  const path = require('node:path');
  const file = c.file;
  if (typeof file !== 'string' || !file) {
    throw new DataFileError('image "file" must be a non-empty path', 'component.image');
  }
  const fileDir = state && state.fileDir;
  const abs = path.isAbsolute(file) ? file : path.join(fileDir || '.', file);
  let data;
  try {
    data = fs.readFileSync(abs);
  } catch (err) {
    throw new DataFileError(`Could not read image file "${file}" (${err.code || err.message})`, 'component.image');
  }
  const mime = IMAGE_MIME[path.extname(abs).toLowerCase()];
  if (!mime) {
    throw new DataFileError(`Unsupported image extension "${path.extname(abs).toLowerCase()}" (use .png, .jpg, .gif, .webp, .svg).`, 'component.image');
  }
  const href =
    mime === 'image/svg+xml'
      ? `data:image/svg+xml;utf8,${encodeURIComponent(data.toString('utf8'))}`
      : `data:${mime};base64,${data.toString('base64')}`;
  const alt = c.alt !== undefined ? normalizeText(c.alt) : c.caption ? normalizeText(c.caption) : '';
  const img = `<img src="${esc(href)}" alt="${attr(alt)}"${c.width ? ` width="${esc(String(c.width))}"` : ''}${c.height ? ` height="${esc(String(c.height))}"` : ''}>`;
  const caption = c.caption ? `<figcaption class="dg-image-caption">${esc(normalizeText(c.caption))}</figcaption>` : '';
  const label = c.caption ? ` aria-label="${attr(normalizeText(c.caption))}"` : '';
  return caption
    ? `<figure class="dg-figure dg-image"${label}>${img}${caption}</figure>`
    : img;
}

// Collapsible block: native <details>/<summary> keeps the page zero-JS while
// giving runbook/troubleshooting content a foldable section. `summary` (or
// `title`) labels the toggle; a nested `content` array renders full components
// (a plain string or `text` renders as a paragraph); `open: true` starts
// expanded. The summary is escaped text, so the toggle never carries markup.
function renderDetails(c, state) {
  const summary = normalizeText(c.summary || c.title || 'Details');
  const open = c.open === true ? ' open' : '';
  let body;
  if (Array.isArray(c.content)) {
    body = c.content
      .map((item) => {
        if (item && typeof item === 'object' && item.type) {
          return invoke(item, state);
        }
        return `<p class="dg-paragraph">${esc(String(item))}</p>`;
      })
      .join('\n');
  } else if (c.text) {
    body = `<p class="dg-paragraph">${esc(normalizeText(c.text))}</p>`;
  } else {
    body = '<p class="dg-paragraph">No content.</p>';
  }
  return `<details class="dg-details"${open}><summary class="dg-details-summary">${esc(summary)}</summary>\n<div class="dg-details-body">${body}</div>\n</details>`;
}

// Tabbed content block: hidden radio inputs + labels give zero-JS tab switching
// (the checked radio styles its label and reveals the adjacent panel; arrow
// keys move between the radios natively). `tabs[]` items carry a `label` and a
// nested `content` array rendered as full components (strings as paragraphs);
// `active` picks the checked tab (0-based, default first). Group ids come from
// `state.next()` so they never collide with chart ids elsewhere on the page.
function renderTabs(c, state) {
  let items = Array.isArray(c.tabs) ? c.tabs : [];
  // Empty/missing tabs still render a single empty pane, so a bare tabs block
  // degrades like details does (a "No content." note) instead of vanishing.
  if (items.length === 0) items = [{}];
  const group = `dg-tabs-${state.next()}`;
  const active = Number.isInteger(c.active) && c.active >= 0 && c.active < items.length ? c.active : 0;
  return `<div class="dg-tabs">${items
    .map((tab, i) => {
      const label = (isObj(tab) ? tab.label : tab) || `Tab ${i + 1}`;
      const checked = i === active ? ' checked' : '';
      let body;
      if (isObj(tab) && Array.isArray(tab.content)) {
        body = tab.content
          .map((item) => {
            if (isObj(item) && item.type) {
              return invoke(item, state);
            }
            return `<p class="dg-paragraph">${esc(String(item))}</p>`;
          })
          .join('\n');
      } else if (isObj(tab) && tab.text) {
        body = `<p class="dg-paragraph">${esc(normalizeText(tab.text))}</p>`;
      } else {
        body = '<p class="dg-paragraph">No content.</p>';
      }
      return `<input type="radio" name="${group}" id="${group}-${i}" class="dg-tab-input"${checked}>\n` +
        `<label class="dg-tab-label" for="${group}-${i}">${esc(normalizeText(label))}</label>\n` +
        `<div class="dg-tab-panel">${body}</div>`;
    })
    .join('\n')}\n</div>`;
}

// Status / pre-flight checklist: done and pending items side by side with a
// state marker (✓ done, ○ still open), so a block reads as a static status
// list rather than an interactive todo — no checkbox roles or JS, just glyphs
// in the DOM the same way stat deltas carry ▲/▼. Items may be bare strings
// (pending) or { text, done: true|false } objects; empty text entries and
// non-array items degrade away, and an all-empty checklist renders nothing.
function renderChecklist(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const entries = items
    .map((item) => {
      const text = normalizeText(isObj(item) ? item.text : (typeof item === 'string' ? item : ''));
      if (!text.trim()) return '';
      const done = isObj(item) ? !!item.done : false;
      const mark = done ? '✓' : '○';
      return `<li class="dg-checklist-item dg-checklist-item--${done ? 'done' : 'pending'}"><span class="dg-checklist-mark">${mark}</span><span class="dg-checklist-text">${esc(text)}</span></li>`;
    })
    .filter(Boolean)
    .join('');
  if (!entries) return '';
  return `<ul class="dg-checklist">${entries}</ul>`;
}

// Small-print footnote: a muted end-note (disclaimer / datum source) with an
// explicit `label` for the note itself. Rendered semantically as an <aside>
// with the ARIA footnote role so assistive tech can jump to it; a bare block
// also carries the "Footnote" default name. Blank/missing text degrades away.
function renderFootnote(c) {
  const text = normalizeText(c.text);
  if (!text.trim()) return '';
  const label = c.label ? ` aria-label="${attr(normalizeText(c.label))}"` : ' aria-label="Footnote"';
  return `<aside class="dg-footnote" role="doc-footnote"${label}>${esc(text)}</aside>`;
}

// Chronological event timeline: a vertical time-stamped log (incident windows,
// release progress) that list/steps/kv do not express. Items are { time, text }
// (or bare strings with no stamp); the time is a semantic <time> element when
// the literal parses as a clock/datetime, plain text otherwise. A `title` names
// the list; blank text entries, non-object scalars, and an all-empty/missing
// list degrade away so the block renders nothing instead of dead markup.
function renderTimeline(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const entries = items
    .map((item) => {
      if (isObj(item)) {
        const text = normalizeText(item.text);
        const time = normalizeText(item.time);
        if (!text.trim()) return '';
        const timeHtml = time
          ? parseTime(time)
            ? `<time class="dg-timeline-time" datetime="${attr(parseTime(time))}">${esc(time)}</time>`
            : `<span class="dg-timeline-time">${esc(time)}</span>`
          : '';
        return `<li class="dg-timeline-item">${timeHtml}<span class="dg-timeline-text">${esc(text)}</span></li>`;
      }
      if (typeof item === 'string') {
        const text = normalizeText(item);
        if (!text.trim()) return '';
        return `<li class="dg-timeline-item"><span class="dg-timeline-text">${esc(text)}</span></li>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
  if (!entries) return '';
  const title = c.title ? `<div class="dg-timeline-title">${esc(normalizeText(c.title))}</div>` : '';
  return `<div class="dg-timeline">${title}<ul class="dg-timeline-list">${entries}</ul></div>`;
}

// The few machine-readable time stamps we pin: "HH:MM", "HH:MM:SS", and
// ISO-8601 date/datetime. Kept local to timeline (no external deps); anything
// else renders the time as inert text.
function parseTime(value) {
  const s = String(value);
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${s.split(':').length > 2 ? `:${s.split(':')[2]}` : ''}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/.test(s)) return s;
  return '';
}

// Plain key/value definition list (kv without the bordered band): a static
// <dl> of term/value pairs for running prose where kv's card look would be
// too heavy. Items are { key, value } (`key` aliased by `label`); the term is
// a <dt> and the value a <dd>, preserving the pairing for assistive tech.
// Blank rows and an all-empty/missing items list degrade away so the block
// renders nothing instead of dead markup.
function renderDefList(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const rows = items
    .map((item) => {
      const key = isObj(item)
        ? item.key || item.label || ''
        : item === null || item === undefined
          ? ''
          : String(item);
      const k = normalizeText(key);
      const v = normalizeText(isObj(item) ? item.value : '');
      if (!k.trim() && !v.trim()) return '';
      return `<div class="dg-def-list-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<dl class="dg-def-list">${rows}</dl>`;
}

// Step-marked progress: a stepper that fuses steps' chip numerals with a
// progress band. `current` (0-based) marks which step the rollout is on —
// earlier steps render as done (✓ chip), the current step is highlighted and
// the band before/including it fills with the accent track, later steps stay
// muted pending. Ordered semantics come from the wrapping <ol> and each
// chip/state pair is a --done/--current/--pending class, so assistive tech
// reads the position off the list order. A missing or out-of-range `current`
// leaves every step pending (a plain numbered stepper, no progress claim).
// Blank text entries, non-array scalars, and an all-empty list degrade away.
function renderStepper(c) {
  const items = Array.isArray(c.items) ? c.items.map(normalizeText) : [];
  const current =
    Number.isInteger(c.current) && c.current >= 0 && c.current < items.length
      ? c.current
      : -1;
  const entries = items
    .map((text, i) => {
      if (!text.trim()) return '';
      let state = 'pending';
      if (current >= 0) {
        if (i < current) state = 'done';
        else if (i === current) state = 'current';
      }
      const mark = state === 'done' ? '✓' : String(i + 1);
      const currentAttr = state === 'current' ? ' aria-current="step"' : '';
      return `<li class="dg-stepper-item dg-stepper-item--${state}"${currentAttr}><span class="dg-stepper-num">${mark}</span><span class="dg-stepper-text">${esc(text)}</span></li>`;
    })
    .filter(Boolean)
    .join('');
  if (!entries) return '';
  return `<ol class="dg-stepper">${entries}</ol>`;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const COMPONENTS = {
  headline: renderHeadline,
  paragraph: renderParagraph,
  list: renderList,
  steps: renderSteps,
  button: renderButton,
  link: renderLink,
  card: renderCard,
  stat: renderStat,
  'stat-list': renderStatList,
  toc: renderToc,
  badge: renderBadge,
  divider: renderDivider,
  quote: renderQuote,
  code: renderCode,
  callout: renderCallout,
  kv: renderKv,
  grid: renderGrid,
  table: renderTable,
  chart: renderChart,
  image: renderImage,
  details: renderDetails,
  tabs: renderTabs,
  checklist: renderChecklist,
  footnote: renderFootnote,
  timeline: renderTimeline,
  'def-list': renderDefList,
  stepper: renderStepper,
  sparkline: renderSparkline,
  status: renderStatus,
  heatmap: renderHeatmap,
  progress: renderProgress,
  terminal: renderTerminal,
  gauge: renderGauge,
  breadcrumbs: renderBreadcrumbs,
};

function invoke(c, state) {
  const fn = COMPONENTS[c.type];
  if (typeof fn !== 'function') {
    throw new StyleError(
      `Unknown component type "${c.type}". Supported types: ${Object.keys(COMPONENTS).join(', ')}`,
      'component.type'
    );
  }
  return fn(c, state);
}

module.exports = {
  COMPONENTS,
  invoke,
  esc,
  attr,
  slugify,
};
