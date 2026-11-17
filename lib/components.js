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

// KPI/metric card: a labelled figure with a large value, an optional delta
// trend (good/bad/neutral), and an optional progress bar. Keeps the dashboard
// read-only: no interactivity, semantic text for screen readers.
function renderStat(c) {
  const value = normalizeText(c.value);
  const label = normalizeText(c.label || c.title || '');
  const prefix = c.prefix ? esc(normalizeText(c.prefix)) : '';
  const suffix = c.suffix ? esc(normalizeText(c.suffix)) : '';
  const caption = c.caption ? normalizeText(c.caption) : '';

  // delta: raw number, numeric string, or { value, tone: good|bad|neutral }
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
  const deltaToneAttr = deltaTone ? ` dg-stat-delta--${deltaTone}` : '';

  let progress = '';
  if (c.progress !== undefined && c.progress !== null) {
    const pct = Number(c.progress);
    if (Number.isFinite(pct)) {
      const p = Math.max(0, Math.min(100, pct));
      const pTone = ['primary', 'success', 'warning', 'danger'].includes(c.progressTone)
        ? c.progressTone
        : 'primary';
      const pLabel = c.progressLabel ? normalizeText(c.progressLabel) : `${p}%`;
      progress = `<div class="dg-stat-progress" aria-label="${attr(pLabel)}" role="img"><span class="dg-stat-progress-fill dg-stat-progress-fill--${pTone}" style="width:${p}%"></span></div>`;
    }
  }

  const deltaHtml = delta !== null ? `<div class="dg-stat-delta${deltaToneAttr}">${deltaText}</div>` : '';
  const captionHtml = caption ? `<div class="dg-stat-caption">${esc(caption)}</div>` : '';

  return `<div class="dg-stat" role="img" aria-label="${attr(label || 'stat')}">
  <div class="dg-stat-value">${prefix}${esc(value)}${suffix}</div>
  <div class="dg-stat-label">${esc(label)}</div>
  ${deltaHtml}${progress}${captionHtml}
</div>`;
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
      body: body.map((row) => row.map((cell) => String(cell))),
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
    body: rows.map((row) => keys.map((k) => (isObj(row) ? row[k] : row))),
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
