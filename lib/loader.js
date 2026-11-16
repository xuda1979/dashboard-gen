// DSL loading & validation: YAML/JSON parse + shape checks.
// Data binding happens in render.js while assembling the page store.

const YAML = require('yaml');
const {
  StyleError,
  FetchSpecError,
  ParseError,
} = require('./errors');

const SUPPORTED_LAYOUTS = ['hero', 'grid', 'sidebar', 'section', 'landing'];
const CHART_TYPES = ['line', 'bar', 'pie'];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function detectSpec(lines, start) {
  const windowSize = 80;
  const sample = lines.slice(start, start + windowSize).join('\n');
  const trimmed = sample.replace(/^\uFEFF/, '').trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function parseDsl(str, filename) {
  const lines = String(str).split('\n');
  const isJsonish = detectSpec(lines, 0);
  if (isJsonish) {
    try {
      return { data: JSON.parse(String(str).replace(/^\uFEFF/, '')) };
    } catch (parseErr) {
      throw new ParseError(`JSON parse error: ${parseErr.message}`, filename || '.');
    }
  }
  try {
    return { data: YAML.parse(str, { prettyErrors: true }) };
  } catch (err) {
    throw new ParseError(`YAML parse error: ${err.message}`, filename || '.');
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function requireString(obj, key, at) {
  if (obj[key] !== undefined && typeof obj[key] !== 'string') {
    throw new StyleError(`"${key}" must be a string`, at);
  }
}

function validatePage(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new StyleError('Top-level DSL must be a mapping (a page object).', '.');
  }
  const pathBase = 'page';
  requireString(doc, 'title', 'page.title');
  requireString(doc, 'description', 'page.description');

  if (doc.layout) {
    if (typeof doc.layout !== 'string') {
      throw new StyleError('"layout" must be a string', 'page.layout');
    }
    const guarded = doc.layout.split(/\s+/)[0];
    if (!SUPPORTED_LAYOUTS.includes(guarded) && guarded !== 'landing') {
      throw new StyleError(
        `Unsupported layout "${doc.layout}". Supported: ${SUPPORTED_LAYOUTS.join(', ')} (or a page-style name).`,
        'page.layout'
      );
    }
  }

  if (doc.theme !== undefined && (doc.theme === null || typeof doc.theme !== 'object' || Array.isArray(doc.theme))) {
    throw new StyleError('"theme" must be a mapping of CSS tokens', 'page.theme');
  }

  const sectionList = doc.sections;
  if (sectionList !== undefined && !Array.isArray(sectionList)) {
    throw new StyleError('"sections" must be a list', 'page.sections');
  }

  // hero as either component list or { content: [...] }
  const hero = doc.hero;
  if (hero !== undefined) {
    const heroIsBad =
      !Array.isArray(hero) &&
      !(isPlainObject(hero) && Array.isArray(hero.content));
    if (heroIsBad) {
      throw new StyleError('"hero" must be a component list or { content: [...] }', 'page.hero');
    }
  }

  const nav = doc.nav;
  if (nav !== undefined && !Array.isArray(nav)) {
    throw new StyleError('"nav" must be a list of { label, href } items', 'page.nav');
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateFetchUrl(url) {
  // Relative paths are allowed: they resolve against the page URL at runtime
  // (e.g. "market.json" served next to the page).
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    return; // e.g. market.json
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchSpecError(`Invalid fetch URL "${url}". Use a relative path, absolute http(s) URL, or "self://examples/<file>.json".`, 'data.fetch');
  }
  const scheme = parsed.protocol.replace(/:$/, '');
  const isHttp = scheme === 'http' || scheme === 'https';
  if (!isHttp && scheme !== 'self') {
    throw new FetchSpecError(
      `Fetch URL scheme "${scheme}" not supported. Use http(s) or self://examples/<file>.json`,
      'data.fetch'
    );
  }
  const host = (parsed.hostname || '').toLowerCase();
  if (isHttp && (!host || !host.includes('.'))) {
    throw new FetchSpecError(`Fetch URL must include a valid hostname (got "${url}")`, 'data.fetch');
  }
}

// Reduce a fetch URL to the path the generated page actually loads at runtime.
// "self://<path>" asserts the page itself owns the fixture, but fetch() rejects
// unknown schemes, so the runtime manifest embeds "<path>" as a plain relative
// URL instead of the raw self:// spec. Relative paths pass through unchanged.
function normalizeFetchUrl(url) {
  if (typeof url !== 'string' || !/^self:/i.test(url)) return url;
  // Drop the scheme and any leading slashes: "self://data/x.json" -> "data/x.json".
  return url.replace(/^self:/i, '').replace(/^\/+/, '');
}

module.exports = {
  parseDsl,
  validatePage,
  validateFetchUrl,
  normalizeFetchUrl,
  SUPPORTED_LAYOUTS,
  CHART_TYPES,
};
