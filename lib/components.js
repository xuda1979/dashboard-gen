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
  // A non-finite numeric value is absent like a nullish one: isNaN(Infinity)
  // === false, so an isNaN-style guard would pass Infinity/-Infinity/NaN
  // through and String() would spell them literally into every text surface.
  // A raw boolean is absent too: String(true) === 'true' would otherwise
  // fabricate literal flag text where a value was clearly never provided.
  // Typed strings like 'Infinity'/'true' and finite numbers stay verbatim.
  if (text === null || text === undefined) return '';
  if (typeof text === 'boolean') return '';
  if (typeof text === 'number' && !Number.isFinite(text)) return '';
  return String(text).replace(/\\n/g, '\n');
}

function normalizeAttr(value) {
  // Attribute twin of normalizeText: a raw boolean is truthy and NaN/Infinity
  // are truthy too, so `c.href ? ...` / `c.href || '#'` would otherwise give
  // truthy booleans and non-finite numbers a literal `href="true"` /
  // `id="Infinity"` attribute fabricated from never-provided values. Absent
  // here means empty, so callers' `|| '#'` / `|| ''` fallbacks re-apply.
  // Typed strings like '#'/'true' and finite numbers stay verbatim.
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return '';
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  return String(value);
}

function isTextField(v) {
  return isObj(v) && typeof v.text === 'string';
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderHeadline(c) {
  const level = /^[1-6]$/.test(String(c.level || '')) ? c.level : 2;
  const id = normalizeAttr(c.id) ? ` id="${attr(normalizeAttr(c.id))}"` : '';
  // A whitespace-only value is absent like a blank one: trim so a padding-only
  // headline degrades to the empty heading (assistive tech already skips it).
  const text = normalizeText(c.text).trim();
  return `<h${level}${id} class="dg-headline dg-h${level}">${esc(text)}</h${level}>`;
}

function renderParagraph(c) {
  // object form: { text, href, newtab } -> inline link paragraph
  // A whitespace-only value is absent like a blank one: trim so a padding-only
  // paragraph renders empty (the existing missing-body convention), not literal
  // spaces. The abutting link keeps its separating space only when a body is
  // actually present, so an absent body does not publish a stray leading pad.
  const body = normalizeText(c.text || '').trim();
  if (isTextField(c) && (c.href || isObj(c.link))) {
    const href = c.href || (isObj(c.link) ? c.link.href : '');
    const newtab = !!(c.newtab || (isObj(c.link) && c.link.newtab));
    // A padding-only href is absent like a missing one: trim so a link whose
    // address/text is only spaces degrades back to a plain paragraph instead
    // of publishing an anchor full of literal padding (the same source feeds
    // both the address attribute and the link text).
    const linkText = normalizeText(href).trim();
    if (!linkText) {
      return `<p class="dg-paragraph">${esc(body)}</p>`;
    }
    return `<p class="dg-paragraph">${esc(body)}${body ? ' ' : ''}` +
      `<a href="${attr(normalizeAttr(linkText))}" class="dg-link"${newtab ? ' target="_blank" rel="noopener"' : ''}>${esc(linkText)}</a></p>`;
  }
  return `<p class="dg-paragraph">${esc(body)}</p>`;
}

function renderList(c) {
  // A whitespace-only item is absent like a blank one: raw truthiness would
  // keep it and render a cell of literal spaces, where the missing-item
  // convention is an empty <li> (normalizeText maps null/undefined to '').
  const items = Array.isArray(c.items) ? c.items.map((t) => normalizeText(t).trim()) : [];
  const cls = c.ordered ? 'dg-ol' : 'dg-ul';
  const tag = c.ordered ? 'ol' : 'ul';
  return `<${tag} class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>`;
}

// Numbered procedure list (runbook / setup steps): each item gets an explicit
// step-number chip in the DOM (visible and read by assistive tech) while the
// wrapping <ol> keeps the ordered-list semantics for screen readers. Blank
// items (nullish/non-finite scalars or whitespace-only text) degrade away so
// the numbering stays dense, like stepper/checklist do.
function renderSteps(c) {
  const items = (Array.isArray(c.items) ? c.items : [])
    .map(normalizeText)
    .filter((t) => t.trim() !== '');
  return `<ol class="dg-steps">${items
    .map(
      (text, i) =>
        `<li class="dg-steps-item"><span class="dg-steps-num">${i + 1}</span><span class="dg-steps-text">${esc(text.trim())}</span></li>`
    )
    .join('')}</ol>`;
}

function renderButton(c) {
  const style = ['primary', 'secondary', 'subtle', 'danger'].includes(c.style)
    ? c.style
    : 'primary';
  const text = normalizeText(c.text).trim() || 'Button';
  const icon = c.icon ? `<svg class="dg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>` : '';
  if (normalizeAttr(c.href)) {
    return `<a href="${attr(normalizeAttr(c.href))}" class="dg-btn dg-btn--${style}"${c.newtab ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}${icon}</a>`;
  }
  return `<button type="button" class="dg-btn dg-btn--${style}">${esc(text)}${icon}</button>`;
}

function renderLink(c) {
  const text = normalizeText(c.text).trim() || normalizeText(c.label).trim() || 'Link';
  const href = normalizeAttr(c.href);
  const mode = c.style === 'button' ? ' dg-btn dg-btn--primary' : '';
  return `<a href="${attr(href || '#')}" class="dg-link${mode}"${c.newtab ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`;
}

function renderCard(c) {
  const intent = ['primary', 'secondary', 'success', 'danger', 'warning'].includes(c.intent) ? c.intent : '';
  let title = '';
  if (c.title) {
    const t = isTextField(c.title) ? c.title.text : c.title;
    const titleText = normalizeText(t).trim();
    if (titleText) title = `<h3 class="dg-card-title">${esc(titleText)}</h3>`;
  }
  return `<div class="dg-card${intent ? ` dg-card--${intent}` : ''}">${title}${esc(normalizeText(c.text).trim())}</div>`;
}

// Shared delta parsing for stat and stat-list: `delta` is a raw number, a
// numeric string, or { value, tone: good|bad|neutral }. Returns
// { delta, deltaText, deltaTone } where delta is the parsed number or null
// and deltaTone is the validated tone name ('' = neutral). A nullish or blank
// delta is absent like a missing one — Number('') is 0, so blank strings must
// not fabricate a "0" trend chip next to a real figure.
function parseDelta(c) {
  let delta = null;
  let deltaTone = '';
  if (c.delta !== undefined && c.delta !== null &&
      !(typeof c.delta === 'string' && c.delta.trim() === '')) {
    let raw = null;
    // A non-finite object value is absent like a nullish one: isNaN(Infinity)
    // === false, so an unconditional Number-style read would spell a literal
    // "▲ Infinity", "▼ Infinity" or "NaN" trend chip next to a real figure.
    if (typeof c.delta === 'object' && typeof c.delta.value === 'number') {
      if (Number.isFinite(c.delta.value)) raw = c.delta.value;
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
  // A non-finite numeric value is absent like a nullish one. Otherwise
  // Infinity would render as a literal "Infinity" figure next to its label
  // (isNaN(Infinity) === false, so isNaN-style guards let it through, and
  // "-Infinity" and "NaN" spell themselves the same way). Display strings
  // like "~1.2k" stay verbatim — only the malformed numeric reading degrades
  // away, matching delta/progress/gauge who drop non-finite numbers.
  const rawValue = c.value;
  // A padding-only figure is absent like a blank one: a raw-truthiness guard
  // would render '   ' as literal spaces next to the label, so the value is
  // trimmed like any other text slot (leading/trailing space in the value
  // itself is padding, unlike prefix/suffix whose internal spacing abuts the
  // figure).
  const value = (typeof rawValue === 'number' && !Number.isFinite(rawValue))
    ? ''
    : normalizeText(rawValue).trim();
  const label = normalizeText(c.label).trim() || normalizeText(c.title).trim() || '';
  // prefix/suffix abut the figure text, so their internal spacing is
  // meaningful (' /m' stays '123 /m'). Only a whitespace-only value is absent
  // like a blank one — a raw-truthiness guard would let '   ' leak literal
  // padding around the figure.
  const prefixTextRaw = normalizeText(c.prefix);
  const prefixText = prefixTextRaw.trim() ? prefixTextRaw : '';
  const suffixTextRaw = normalizeText(c.suffix);
  const suffixText = suffixTextRaw.trim() ? suffixTextRaw : '';
  const caption = normalizeText(c.caption).trim();
  const { delta, deltaText, deltaTone } = parseDelta(c);
  const deltaToneAttr = deltaTone ? ` dg-stat-delta--${deltaTone}` : '';

  let progress = '';
  let progressName = '';
  // A boolean progress is absent like a nullish/blank one: Number(true) === 1
  // would otherwise fabricate a 1% strip from a config flag the author never
  // meant as a percentage.
  if (c.progress !== undefined && c.progress !== null &&
      typeof c.progress !== 'boolean' &&
      !(typeof c.progress === 'string' && c.progress.trim() === '')) {
    const pct = Number(c.progress);
    if (Number.isFinite(pct)) {
      const p = Math.max(0, Math.min(100, pct));
      const pTone = ['primary', 'success', 'warning', 'danger'].includes(c.progressTone)
        ? c.progressTone
        : 'primary';
      const pLabel = normalizeText(c.progressLabel).trim() || `${p}%`;
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
      // A whitespace-only title is absent like a blank one: raw truthiness
      // would pass '   ' and fabricate an empty toc link for a never-titled
      // section; trim after normalize so the entry degrades away entirely.
      const rawTitle = normalizeText(s.title);
      if (!rawTitle.trim()) return '';
      const anchor = anchors[i];
      const href = anchor ? `#${anchor}` : '#';
      const label = esc(rawTitle.trim());
      return `<li><a class="dg-toc-link" href="${href}">${label}</a></li>`;
    })
    .join('');
  if (!links) return '';
  // A raw boolean/blank `label` is absent like a missing one: it is truthy,
  // so the pre-coercion check would fabricate an empty aria-label instead of
  // falling back to the "Contents" default name.
  const labelText = normalizeText(c.label).trim();
  const label = labelText ? ` aria-label="${attr(labelText)}"` : ' aria-label="Contents"';
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
      // Standalone label slot: trim, and let a padding-only label/title fall
      // through to the other instead of shadowing it into an empty cell.
      const label = isObj(item)
        ? (normalizeText(src.label).trim() || normalizeText(src.title).trim() || '')
        : (typeof item === 'number' && !Number.isFinite(item)) || typeof item === 'boolean' ? '' : String(item).trim();
      // Prefix/suffix abut the value text, so their internal spacing is meaningful
      // (' /m' stays '5 /m'); only a whitespace-only value is absent like a blank
      // one — a raw-truthiness guard would let '   ' leak literal padding.
      const prefixRaw = normalizeText(src.prefix);
      const prefix = prefixRaw.trim() ? esc(prefixRaw) : '';
      const suffixRaw = normalizeText(src.suffix);
      const suffix = suffixRaw.trim() ? esc(suffixRaw) : '';
      // A non-finite numeric row value is absent like a nullish one (see
      // renderStat): Infinity/NaN must not spell themselves into the cell.
      const rowValue = src.value;
      // A padding-only cell value is absent like a blank one (mirrors
      // renderStat): the value is trimmed so '   ' does not publish literal
      // spaces inside the cell between the abutting prefix/suffix.
      const value = (typeof rowValue === 'number' && !Number.isFinite(rowValue))
        ? ''
        : normalizeText(rowValue).trim();
      const { delta, deltaText, deltaTone } = parseDelta(src);
      const deltaCell = delta !== null
        ? `<td class="dg-statlist-delta dg-statlist-delta--${deltaTone || 'neutral'}">${deltaText}</td>`
        : '';
      return `<tr class="dg-statlist-row"><th scope="row">${esc(label)}</th><td class="dg-statlist-value">${prefix}${esc(value)}${suffix}</td>${deltaCell}</tr>`;
    })
    .join('\n');
  const body = rowHtml || '<tr><td class="dg-note" colspan="3">No data to draw.</td></tr>';
  const captionText = normalizeText(c.caption).trim();
  const label = captionText ? ` aria-label="${attr(captionText)}"` : '';
  return `<div class="dg-scroll"><table class="dg-statlist"${label}><tbody>\n${body}\n</tbody></table></div>`;
}

function renderBadge(c) {
  const tone = ['neutral', 'primary', 'success', 'warning', 'danger'].includes(c.tone)
    ? c.tone
    : 'neutral';
  // A whitespace-only value is absent like a blank one: trim so a padding-only
  // badge renders (and reads to assistive tech) as empty, not literal spaces.
  const text = normalizeText(c.text || '').trim();
  return `<span class="dg-badge dg-badge--${tone}">${esc(text)}</span>`;
}

function renderDivider(c) {
  return '<hr class="dg-divider">';
}

function renderQuote(c) {
  // A raw boolean/non-finite `cite` is absent like a missing one: it is
  // truthy, so the pre-coercion check would render a stray "— " footer from
  // a never-provided attribution instead of no footer at all.
  // A whitespace-only attribution is absent like a blank one: trim so a
  // padding-only cite does not publish a "--" footer with no attribution.
  const cite = normalizeText(isTextField(c.cite) ? c.cite.text : c.cite).trim();
  const citeHtml = cite
    ? `<footer class="dg-quote-cite">— ${esc(cite)}</footer>`
    : '';
  // A whitespace-only body is absent like a blank one: trim so a padding-only
  // quote does not publish literal spaces into the quoted paragraph.
  const body = normalizeText(c.text || '').trim();
  return `<blockquote class="dg-quote"><p>${esc(body)}</p>${citeHtml}</blockquote>`;
}

// Block code snippet: install/usage/config examples for internal-tool pages.
// `code` is a string or a list of lines; `lang` shows a small label; `title`
// gives the block a labelled header. Content is fully HTML-escaped so markup
// samples render as text, and a bare snippet carries no aria-prefix (plain
// <pre> reads fine to assistive tech without a region role).
function renderCode(c) {
  const title = normalizeText(c.title).trim();
  const lang = normalizeText(c.lang).trim();
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
  const titleRaw = normalizeText(c.title || '');
  const title = titleRaw.trim() ? titleRaw : '';
  const titleHtml = title ? `<div class="dg-callout-title">${esc(title)}</div>` : '';
  const noteAttr = title ? ` role="note" aria-label="${attr(title)}"` : '';
  // A whitespace-only body is absent like a blank one: trim so a padding-only
  // callout does not publish literal spaces into its body paragraph.
  const body = normalizeText(c.text || '').trim();
  return `<div class="dg-callout dg-callout--${tone}"${noteAttr}>${titleHtml}<p class="dg-callout-body">${esc(body)}</p></div>`;
}

// Container: a responsive grid of cards. `items` entries are either full
// component objects ({type: "card", ...}) or shorthands ({title, text, intent}).
function renderGrid(c, state) {
  // A nullish or blank columnWidth is absent like a missing one:
  // Number(null) === 0 and Number('') === 0 would otherwise pass the
  // isFinite check and fabricate the malformed "px"/"nullpx" minimum.
  const colW = c.columnWidth;
  const hasWidth = colW !== null && colW !== undefined &&
    !(typeof colW === 'string' && colW.trim() === '');
  const width = hasWidth ? Number(colW) : NaN;
  // Only a real non-negative length can size an auto-fill track. Number(true)
  // === 1 and Number(false) === 0 are finite, so booleans used to pass the
  // isFinite guard and fabricate the invalid "minmax(truepx, 1fr)" /
  // "minmax(falsepx, 1fr)" minimum — and a bare word like "abc", being truthy,
  // fell to the raw-string branch and leaked the unit-less "minmax(abc, 1fr)".
  // A non-numeric or negative scalar is absent like a missing width, so it
  // degrades to 220px; numbers, numeric strings, and unit-suffixed lengths
  // are still honored.
  const LENGTH_RE = /^(\d+\.?\d*|\.\d+)(px|em|rem|ch|vh|vw|vmin|vmax|%)$/;
  const NUMERIC_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
  const isLength = typeof colW === 'string' && LENGTH_RE.test(colW);
  const isNumeric = typeof colW === 'number' ||
    (typeof colW === 'string' && NUMERIC_RE.test(colW));
  const usable = (isNumeric && Number.isFinite(width) && width >= 0) || isLength;
  const min = usable ? (isLength ? colW : `${colW}px`) : '220px';
  // A nullish or blank `columns` is absent like a missing one: '   ' is
  // truthy, so it used to enter the fixed-N branch where Number('   ') === 0
  // and Number('abc') === NaN both fall through `|| 3` and fabricate a fixed
  // "repeat(3, ...)" grid from a blank or garbage count — and the string "0"
  // fabricated a fixed 3-column grid where the numeric 0 rendered auto-fill —
  // and Number(true) === 1 is finite too, so a boolean `columns` used to pass
  // the positive-count check and fabricate a fixed 1-column grid. Only a
  // finite positive count selects the fixed column grid; everything else
  // falls back to fluid auto-fill while `cols` keeps the old default for the
  // data-grid-cols attribute.
  const colCount = c.columns === null || c.columns === undefined ||
    typeof c.columns === 'boolean' ||
    (typeof c.columns === 'string' && c.columns.trim() === '')
    ? NaN
    : Number(c.columns);
  // The data-grid-cols attribute mirrors the effective fixed count; the
  // fluid layout reports the 3-column default regardless of any non-positive
  // count so the attribute never carries a malformed value.
  const cols = Number.isInteger(colCount) && colCount > 0 ? colCount : 3;
  // When `columns` is a real positive integer count it wins (fixed N-column
  // grid); otherwise fall back to fluid auto-fill driven by `columnWidth`/
  // 220px. A fractional count like 2.5 would emit the invalid CSS
  // "repeat(2.5, ...)" (repeat needs an integer), so it degrades too.
  const columnsStyle = Number.isInteger(colCount) && colCount > 0
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
      return `<div class="dg-cell">${esc((((item == null) || (typeof item === 'number' && !Number.isFinite(item)) || typeof item === 'boolean') ? '' : String(item)).trim())}</div>`;
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
      body: body.map((row) => row.map((cell) => (
        (typeof cell === 'number' && !Number.isFinite(cell)) || cell == null || typeof cell === 'boolean' ? '' : String(cell)
      ))),
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
      return (typeof v === 'number' && !Number.isFinite(v)) || v == null || typeof v === 'boolean' ? '' : v;
    })),
  };
}

function renderTable(c) {
  const { hasHeader, header, body } = rowsToTableData(c.rows, c.header);
  const captionText = normalizeText(c.caption).trim();
  const label = captionText ? ` aria-label="${attr(captionText)}"` : '';
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
// A blank key and value together (bare null/undefined/non-finite items, or an
// empty {key, value} pair) drop the whole row instead of fabricating literal
// "null"/"undefined" terms; missing items still render an empty container.
function renderKv(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const rows = items
    .map((item) => {
      const key = isObj(item)
        ? normalizeText(item.key) || normalizeText(item.label) || ''
        : item === null || item === undefined
          ? ''
          : (typeof item === 'number' && !Number.isFinite(item)) || typeof item === 'boolean' ? '' : String(item);
      // Standalone cells: whitespace-only keys/values are absent like blank
      // ones, so trim (a dd is a block, internal padding is not meaningful).
      const k = normalizeText(key).trim();
      const v = normalizeText(isObj(item) ? item.value : '').trim();
      if (!k.trim() && !v.trim()) return '';
      return `<div class="dg-kv-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`;
    })
    .filter(Boolean)
    .join('');
  return `<dl class="dg-kv">${rows}</dl>`;
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
  const title = normalizeText(c.title).trim() || 'Chart';
  const caption = normalizeText(c.caption).trim();
  const figureLabel = caption || title;
  const source = isObj(c.data) && typeof c.data.fetch === 'string' ? c.data.fetch : '';
  const swatches = c.swatches && isObj(c.swatches) ? JSON.stringify(c.swatches).replace(/"/g, '&quot;') : '';
  // A nullish or blank start is absent like a missing one: '   ' is truthy so
  // it would reach the runtime as data-chart-start, where Number('   ') === 0
  // fabricates a y-baseline of 0 — and String(true) === 'true' reaches the
  // runtime as a literal "true" baseline that Number() turns into NaN.
  const start = c.start !== null && c.start !== undefined &&
    typeof c.start !== 'boolean' &&
    !(typeof c.start === 'string' && c.start.trim() === '') &&
    !(typeof c.start === 'number' && !Number.isFinite(c.start))
    ? String(c.start)
    : '';

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
  const title = normalizeText(c.title).trim() || 'Trend';
  const caption = normalizeText(c.caption).trim();
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
// mixed or sparse series still plots its numeric core. Nullish and blank
// entries are absent data points too — the project treats null/'' as missing
// everywhere — so they never render as fabricated zero readings (bare [value]
// pairs keep their first element, but a two-element [label, value] row whose
// value is nullish drops entirely rather than plotting the numeric label).
function sparklineValues(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => {
      let n;
      if (isObj(d)) n = d.value ?? d[1];
      else if (Array.isArray(d)) n = d.length >= 2 ? d[1] : d[0];
      else n = d;
      if (n === null || n === undefined || typeof n === 'boolean') return NaN;
      if (typeof n === 'string' && n.trim() === '') return NaN;
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
        // Standalone label slot: trim, and let a padding-only name fall through
        // to the service fallback instead of shadowing it into an empty item.
        const nameRaw = normalizeText(item.name).trim();
        const serviceRaw = normalizeText(item.service).trim();
        name = nameRaw || serviceRaw || '';
        state = item.state === undefined || item.state === null ||
          (typeof item.state === 'number' && !Number.isFinite(item.state)) ||
          typeof item.state === 'boolean'
          ? '' : String(item.state).toLowerCase().trim();
        // A whitespace-only detail is absent like a blank one: trim so a
        // padding-only note does not render a detail span full of spaces.
        detail = normalizeText(item.detail || '').trim();
      } else if (typeof item === 'string') {
        name = normalizeText(item).trim();
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
  const titleText = normalizeText(c.title).trim();
  const title = titleText ? `<div class="dg-status-title">${esc(titleText)}</div>` : '';
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
  const title = normalizeText(c.title).trim() || 'Heatmap';
  // A whitespace-only column header is absent like a blank one: filter(Boolean)
  // passes '   ', so blank cells must be dropped by trim instead of passing
  // literal padding into the grid header; typed headers keep their text.
  const columns = Array.isArray(c.columns) ? c.columns.map((t) => normalizeText(t).trim()).filter(Boolean) : [];
  const rows = Array.isArray(c.rows) ? c.rows : [];
  if (!columns.length || !rows.length) return '';

  const grid = [];
  const data = Array.isArray(c.data) ? c.data : [];
  rows.forEach((row, i) => {
    let label;
    let values;
    if (isObj(row)) {
      // Standalone label slot: trim, and let a padding-only label/name fall
      // through to the other instead of dropping the row.
      label = normalizeText(row.label).trim() || normalizeText(row.name).trim() || '';
      values = Array.isArray(row.values) ? row.values : [];
    } else {
      label = normalizeText(row).trim();
      values = Array.isArray(data[i]) ? data[i] : [];
    }
    if (!label.trim()) return;
    const nums = values
      .map((v) => {
        // A boolean is absent, not a reading: Number(true) === 1 would
        // otherwise plot as a fabricated low-intensity cell.
        if (v === null || v === undefined || typeof v === 'boolean') return 0;
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
// omitted; a nullish or blank value is absent and degrades away with a
// non-finite one, so no fabricated zero bar or dead markup renders.
function renderProgress(c) {
  // A boolean is absent like a nullish/blank value: Number(true) === 1 would
  // otherwise fabricate a 1% bar from a config the author never meant to set.
  if (c.value === undefined || c.value === null || typeof c.value === 'boolean') return '';
  if (typeof c.value === 'string' && c.value.trim() === '') return '';
  const raw = Number(c.value);
  if (!Number.isFinite(raw)) return '';
  const pct = Math.max(0, Math.min(100, raw));
  const tone = ['primary', 'success', 'warning', 'danger'].includes(c.tone) ? c.tone : 'primary';
  const label = normalizeText(c.label).trim() || normalizeText(c.title).trim() || '';
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
      // Middle segments of a multiline item follow the whole-item convention:
      // a whitespace-only line is absent like a blank one, not a span full of
      // literal padding.
      if (/^\s*$/.test(part)) continue;
      lines.push({ text: part, level });
    }
  }
  if (lines.length === 0) return '';
  const prompt = normalizeText(c.prompt).trim() || '$';
  const body = lines
    .map(({ text, level }) => {
      if (level === 'cmd') {
        return `<span class="dg-terminal-line dg-terminal-line--cmd">${esc(prompt)} ${esc(text)}</span>`;
      }
      const tag = level === 'info' ? '' : `<span class="dg-tl-tag">${level}</span> `;
      return `<span class="dg-terminal-line dg-terminal-line--${level}">${tag}${esc(text)}</span>`;
    })
    .join('\n');
  const title = normalizeText(c.title).trim();
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
// decays away so no dead markup renders; the value itself is clamped into
// range. A nullish or blank value is absent and drops the figure, matching
// how a missing value degrades; a nullish or blank min/max falls back to the
// 0/100 defaults instead of corrupting the range.
function renderGauge(c) {
  // A boolean min/max is absent like a nullish/blank one: Number(true) === 1
  // would otherwise shrink the default 0-100 range down to a 1..1 span.
  const min = Number(c.min === undefined || c.min === null || typeof c.min === 'boolean' || (typeof c.min === 'string' && c.min.trim() === '') ? 0 : c.min);
  const max = Number(c.max === undefined || c.max === null || typeof c.max === 'boolean' || (typeof c.max === 'string' && c.max.trim() === '') ? 100 : c.max);
  // A boolean value is absent like a nullish/blank one: Number(true) === 1
  // would otherwise fabricate a readout from a config flag the author never
  // set as a reading.
  if (c.value === undefined || c.value === null || typeof c.value === 'boolean') return '';
  if (typeof c.value === 'string' && c.value.trim() === '') return '';
  const raw = Number(c.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(raw) || max <= min) return '';
  const f = Math.max(0, Math.min(1, (raw - min) / (max - min)));
  const tone = ['primary', 'success', 'warning', 'danger'].includes(c.tone) ? c.tone : 'primary';
  // Suffix abuts the numeric readout, so its internal spacing is meaningful
  // (' MB' stays '43 MB'); only a whitespace-only suffix is absent.
  const suffixRaw = normalizeText(c.suffix);
  const suffix = suffixRaw.trim() ? suffixRaw : '';
  const numeric = String(raw);
  const label = normalizeText(c.label).trim() || normalizeText(c.title).trim() || '';
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
  const captionText = normalizeText(c.caption).trim();
  const caption = captionText ? `<p class="dg-note dg-gauge-cap">${esc(captionText)}</p>` : '';
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
      if (typeof item === 'string') return { label: normalizeText(item).trim(), href: '' };
      return {
        // A whitespace-only label is absent like a blank one: raw truthiness
        // would keep a padding-only item (it is truthy) and render a slot full
        // of literal spaces; trim after normalize so it degrades to the empty
        // span convention (the item is kept, matching missing-label behaviour).
        label: normalizeText(item.label || item.text || '').trim(),
        href: normalizeAttr(item.href),
      };
    });
  if (trail.every((t) => !t.label)) return '';
  const navLabel = normalizeText(c.label).trim() || 'Breadcrumb';
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
  // Whitespace-only alt degrades to a genuinely empty alt (the a11y check
  // requires the attribute) rather than spelling the blanks into it; the
  // caption fallback is normalized the same way so never-provided captions
  // never fabricate alt text. Typed alt strings stay verbatim except for
  // padding whitespace.
  const alt = normalizeText(c.alt !== undefined ? c.alt : (c.caption ? c.caption : '')).trim();
  const w = (c.width !== null && c.width !== undefined &&
    !(typeof c.width === 'number' && !Number.isFinite(c.width))) ? c.width : '';
  const h = (c.height !== null && c.height !== undefined &&
    !(typeof c.height === 'number' && !Number.isFinite(c.height))) ? c.height : '';
  const img = `<img src="${esc(href)}" alt="${attr(alt)}"${w ? ` width="${esc(String(w))}"` : ''}${h ? ` height="${esc(String(h))}"` : ''}>`;
  const captionText = normalizeText(c.caption).trim();
  const caption = captionText ? `<figcaption class="dg-image-caption">${esc(captionText)}</figcaption>` : '';
  const label = captionText ? ` aria-label="${attr(captionText)}"` : '';
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
  const summary = normalizeText(c.summary).trim() || normalizeText(c.title).trim() || 'Details';
  const open = c.open === true ? ' open' : '';
  let body;
  if (Array.isArray(c.content)) {
    body = c.content
      .map((item) => {
        if (item && typeof item === 'object' && item.type) {
          return invoke(item, state);
        }
        // A whitespace-only bare item is absent like a blank one: trim so the
        // paragraph follows the missing-body convention (empty), not a slot
        // full of literal spaces (mirrors the tabs bare-item handling).
        const bareText = (typeof item === 'number' && !Number.isFinite(item)) || typeof item === 'boolean' ? '' : String(item);
        return `<p class="dg-paragraph">${esc(bareText.trim())}</p>`;
      })
      .join('\n');
  } else if (c.text) {
    // A whitespace-only string is absent like a blank one: raw truthiness
    // would pass '   ' and fabricate a paragraph full of literal spaces
    // instead of the missing-body convention.
    const detailText = normalizeText(c.text).trim();
    body = `<p class="dg-paragraph">${esc(detailText)}</p>`;
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
      // A raw boolean/blank/non-finite `label` is absent like a missing one:
      // it is truthy, so the pre-coercion `||` fallback would not reach the
      // default name, and normalizeText would fabricate an empty <label>
      // instead of `Tab N`. Normalize first, then fall back.
      const labelText = normalizeText(isObj(tab) ? tab.label : tab).trim();
      const label = labelText || `Tab ${i + 1}`;
      const checked = i === active ? ' checked' : '';
      let body;
      if (isObj(tab) && Array.isArray(tab.content)) {
        body = tab.content
          .map((item) => {
            if (isObj(item) && item.type) {
              return invoke(item, state);
            }
            // A whitespace-only bare item is absent like a blank one: trim so
            // the paragraph follows the missing-body convention (empty), not
            // a slot full of literal spaces.
            return `<p class="dg-paragraph">${esc((typeof item === 'number' && !Number.isFinite(item)) || typeof item === 'boolean' ? '' : String(item)).trim()}</p>`;
          })
          .join('\n');
      } else if (isObj(tab) && tab.text) {
        // Whitespace-only text is absent like blank text: trim so the pane
        // follows the missing-body convention, not literal padding.
        body = `<p class="dg-paragraph">${esc(normalizeText(tab.text).trim())}</p>`;
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
      const text = normalizeText(isObj(item) ? item.text : (typeof item === 'string' ? item : '')).trim();
      if (!text) return '';
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
  const text = normalizeText(c.text).trim();
  if (!text.trim()) return '';
  // A raw boolean/blank `label` is absent like a missing one: it is truthy,
  // so the pre-coercion check would fabricate an empty aria-label instead of
  // falling back to the "Footnote" default name.
  const labelText = normalizeText(c.label).trim();
  const label = labelText ? ` aria-label="${attr(labelText)}"` : ' aria-label="Footnote"';
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
        const text = normalizeText(item.text).trim();
        // A whitespace-only stamp is absent like a missing one: raw truthiness
        // would pass '   ' and render a time slot full of literal spaces.
        const time = normalizeText(item.time).trim();
        if (!text) return '';
        const timeHtml = time
          ? parseTime(time)
            ? `<time class="dg-timeline-time" datetime="${attr(parseTime(time))}">${esc(time)}</time>`
            : `<span class="dg-timeline-time">${esc(time)}</span>`
          : '';
        return `<li class="dg-timeline-item">${timeHtml}<span class="dg-timeline-text">${esc(text)}</span></li>`;
      }
      if (typeof item === 'string') {
        const text = normalizeText(item).trim();
        if (!text) return '';
        return `<li class="dg-timeline-item"><span class="dg-timeline-text">${esc(text)}</span></li>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
  if (!entries) return '';
  const titleText = normalizeText(c.title).trim();
  const title = titleText ? `<div class="dg-timeline-title">${esc(titleText)}</div>` : '';
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
        ? normalizeText(item.key) || normalizeText(item.label) || ''
        : item === null || item === undefined
          ? ''
          : (typeof item === 'number' && !Number.isFinite(item)) || typeof item === 'boolean' ? '' : String(item);
      // Standalone cells: whitespace-only keys/values are absent like blank
      // ones, so trim (a dd is a block, internal padding is not meaningful).
      const k = normalizeText(key).trim();
      const v = normalizeText(isObj(item) ? item.value : '').trim();
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
      return `<li class="dg-stepper-item dg-stepper-item--${state}"${currentAttr}><span class="dg-stepper-num">${mark}</span><span class="dg-stepper-text">${esc(text.trim())}</span></li>`;
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
  normalizeText,
};
