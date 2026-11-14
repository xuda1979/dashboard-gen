// DSL loading & validation: YAML/JSON parse, shape checks, data binding.
// Produces a normalized page model ready for rendering.

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const {
  DashboardError,
  StyleError,
  FetchSpecError,
  DataFileError,
  ParseError,
} = require('./errors');
const { COMPONENTS } = require('./components');

const SUPPORTED_LAYOUTS = ['hero', 'grid', 'sidebar', 'section'];
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
// Data binding normalization
// ---------------------------------------------------------------------------

// Returns the store (id -> rows) and keeps fetch specs in the component.
// - component.data  -> array of rows            (inline)
// - component.data  -> object { csv: "a,b\n1,2" } (inline CSV string)
// - component.data  -> object { json: [...] }    (inline JSON)
// - component.file  -> "data.json" or "data.csv" (local data file, resolved by build)
// - component.data  -> object { fetch: url }     (fetched at runtime)
// Inline data is serialized into window.__DG_DATA__; fetch specs stay in the
// shell data-attributes for the runtime to load.
function normalizeChartData(c, fileDir, state) {
  const key = c.dataId || chartKeyFor(state);
  let shell = { source: '' };
  if (c.data === undefined) {
    shell.source = '';
  } else if (Array.isArray(c.data)) {
    state.store[key] = c.data;
  } else if (isPlainObject(c.data) && 'csv' in c.data) {
    checkOptions(c.data.csv);
    state.store[key] = parseCsv(c.data.csv, key);
  } else if (isPlainObject(c.data) && 'json' in c.data) {
    checkOptions(c.data.json);
    const parsed = JSON.parse(JSON.stringify(c.data.json));
    state.store[key] = parsed;
  } else if (isPlainObject(c.data) && 'fetch' in c.data) {
    if (typeof c.data.fetch !== 'string') {
      throw new FetchSpecError('data.fetch must be a URL string', `data.fetch`);
    }
    validateFetchUrl(c.data.fetch);
    shell.source = 'fetch';
  } else if (typeof c.file === 'string' && !isPlainObject(c.data)) {
    const resolved = resolveDataFile(c.file, fileDir);
    state.store[key] = resolved.rows;
    shell.source = '';
  } else {
    throw new StyleError(
      'chart "data" must be an inline array, { csv }, { json }, or { fetch: url }',
      `component.data`
    );
  }
  return shell;
}

function checkOptions(v) {
  if (typeof v !== 'string' && !Array.isArray(v)) {
    throw new StyleError('data.{csv,json} must be a string or array', 'component.data');
  }
}

function chartKeyFor(state) {
  return `chart-${state.count++}`;
}

// trim helper for small CSV
function parseCsv(text, key) {
  const raw = String(text).trim().split(/\r?\n/).map((line) => line.split(','));
  return raw.map((row) => row.map((cell) => cell.trim()));
}

// ---------------------------------------------------------------------------
// Data files
// ---------------------------------------------------------------------------

function resolveDataFile(relPath, fileDir) {
  if (!relPath) throw new StyleError('chart "file" must be a path string', 'component.file');
  const abs = path.isAbsolute(relPath) ? relPath : path.join(fileDir, relPath);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new DataFileError(`Could not read data file "${relPath}" (${err.code || err.message})`, 'component.file');
  }
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.json') {
    try {
      return { rows: JSON.parse(content) };
    } catch (err) {
      throw new DataFileError(`Data file "${relPath}" is not valid JSON: ${err.message}`, 'component.file');
    }
  }
  if (ext === '.csv') {
    return { rows: parseCsv(content, abs) };
  }
  throw new DataFileError(`Unsupported data file extension "${ext}" for "${relPath}" (use .json or .csv).`, 'component.file');
}

// ---------------------------------------------------------------------------
// Fetch spec
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

// Inline self://bundled datasets: registered by examples/build; used to run
// CORS-safe offline demos. The loader keeps a registry the build step populates.
const BUNDLED = new Map();

function registerBundled(name, rows) {
  BUNDLED.set(name, rows);
}

module.exports = {
  parseDsl,
  validatePage,
  normalizeChartData,
  parseCsv,
  resolveDataFile,
  validateFetchUrl,
  registerBundled,
  BUNDLED,
  SUPPORTED_LAYOUTS,
  CHART_TYPES,
};
