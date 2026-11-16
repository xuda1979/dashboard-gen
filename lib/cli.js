// CLI implementation: dg new / dg build / dg watch / dg serve

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { buildFromSource } = require('./build');
const { parseDsl } = require('./loader');
const {
  DashboardError,
  ParseError,
} = require('./errors');

const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');

// ---------------------------------------------------------------------------
// Help / errors
// ---------------------------------------------------------------------------

const HELP = `dashboard-gen — declarative YAML/JSON -> static single-file page

Usage:
  dg new <name>             Bootstrap a new project (examples/new-site)
  dg build [src]            Build src (or dg.dsl.yaml) to dist/<name>.html
  dg watch [src]            Build, then rebuild when the DSL changes
  dg serve [dir]            Serve dist/ (or dir) at http://localhost:4173
  dg new --template=<t>     Pick a template (landing|table|chart|dashboard|fetch)

Output:
  dist/<name>.html   single self-contained page (no CDN, offline-openable)
`;

function printHelp() {
  console.log(HELP);
}

function errorOut(err) {
  if (err instanceof DashboardError) {
    process.stderr.write(`[dashboard-gen] ${err.format()}\n`);
  } else {
    process.stderr.write(`[dashboard-gen] ${err && err.stack ? err.stack : String(err)}\n`);
  }
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function buildOne(absSrcPath, outHtmlPath) {
  const source = fs.readFileSync(absSrcPath, 'utf8');
  const fileDir = path.dirname(absSrcPath);
  const html = buildFromSource(source, absSrcPath, { fileDir });
  fs.mkdirSync(path.dirname(outHtmlPath), { recursive: true });

  copyLocalFixtures(source, absSrcPath, path.dirname(outHtmlPath));
  fs.writeFileSync(outHtmlPath, html);
  return html;
}

// Copy any local fetch fixtures (relative URLs / self:// paths) next to the
// output so the served page can load them at runtime. Nested paths (e.g.
// "data/market.json") keep their subpath relative to the output dir.
function copyLocalFixtures(source, absSrcPath, outDir) {
  const { parseDsl } = require('./loader');
  const { collectFetchSpecs } = require('./render');
  const parsed = parseDsl(source, absSrcPath);
  const fetchUrls = collectFetchSpecs(parsed.data);
  const fileDir = path.dirname(absSrcPath);
  for (const url of fetchUrls) {
    const rel = relativeUrlPath(url);
    if (rel === null) continue; // absolute http(s) -> runtime fetch
    const srcFixture = path.resolve(fileDir, rel);
    if (!fs.existsSync(srcFixture)) continue;
    if (fs.statSync(srcFixture).isDirectory()) {
      copyDirRecursive(srcFixture, path.join(outDir, path.basename(rel)));
      continue;
    }
    if (!rel.includes(path.sep) && !rel.includes('/')) {
      // flat fixture next to the page root
      fs.copyFileSync(srcFixture, path.join(outDir, path.basename(rel)));
      continue;
    }
    // nested path — mirror the subpath so the page can resolve it
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcFixture, dest);
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const from = path.join(src, entry);
    const to = path.join(dest, entry);
    if (fs.statSync(from).isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

// Return the on-disk relative path for a fixture URL, or null for absolute
// http(s) and non-loadable schemes.
function relativeUrlPath(url) {
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    return url.replace(/^\.\//, '');
  }
  let spec;
  try {
    spec = new URL(url);
  } catch {
    return null;
  }
  if (spec.protocol === 'self:') {
    return spec.pathname.replace(/^\//, '');
  }
  return null;
}

function defaultSource() {
  const candidates = ['dg.dsl.yaml', 'dg.dsl.yml', 'dg.dsl.json', 'site.yaml'];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function ensureArg(srcArg, fallback) {
  const src = srcArg || fallback || defaultSource();
  if (!src) {
    console.error('[dashboard-gen] No DSL file given; look for dg.dsl.yaml / site.yaml.');
    throw new ParseError('missing DSL file');
  }
  const abs = path.resolve(src);
  if (!fs.existsSync(abs)) {
    throw new ParseError(`DSL file not found: ${src}`);
  }
  return abs;
}

function cmdBuild(argv) {
  const srcArg = argv._[0];
  const srcAbs = ensureArg(srcArg);
  const name = siteNameFrom(srcAbs);
  const outName = process.env.DG_OUTPUT || `${name}.html`;
  const outAbs = path.resolve('dist', outName);
  const html = buildOne(srcAbs, outAbs);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`[dashboard-gen] built ${path.relative(process.cwd(), outAbs)} (${kb} KiB)`);
  return outAbs;
}

function siteNameFrom(srcAbs) {
  const base = path.basename(srcAbs, path.extname(srcAbs));
  return base === 'dg.dsl' ? 'site' : base;
}

function cmdWatch(argv) {
  const srcAbs = ensureArg(argv._[0]);

  // Stop anything watching the previous file lock before starting a new watch.
  stopWatchers();
  return watch(srcAbs);
}

let activeWatcher = null;
function stopWatchers() {
  if (activeWatcher) {
    try { activeWatcher.close(); } catch { /* already closed */ }
    activeWatcher = null;
  }
}

// watch(): build then rebuild on DSL change. Returns the watcher so tests can
// close it (avoids keeping the process alive).
function watch(srcAbs) {
  const name = siteNameFrom(srcAbs.trim());
  const outAbs = path.resolve('dist', `${name}.html`);

  function runBuild(tag) {
    try {
      buildOne(srcAbs, outAbs);
      const t = tag || '';
      console.log(`[dashboard-gen] ${new Date().toISOString()} built ${name}.html${t ? ' ' + t : ''}`);
    } catch (err) {
      errorOut(err);
    }
  }

  runBuild();
  // Callback stays valid after the file is renamed/removed only if we use the
  // regular watcher, so keep using fs.watch on the parent dir.
  const dir = path.dirname(srcAbs);
  const base = path.basename(srcAbs);
  const watcher = fs.watch(dir, (event, changed) => {
    // Editors often replace the file via rename/delete+create, which may emit
    // events with a null filename — treat those as changes to our source.
    if (changed !== null && changed !== base) return;
    runBuild('(watch)');
  });
  activeWatcher = watcher;
  console.log(`[dashboard-gen] watching ${srcAbs}`);
  process.on('SIGINT', () => {
    stopWatchers();
    process.exit(0);
  });
  return watcher;
}

function cmdServe(argv) {
  const dir = path.resolve(argv._[0] || 'dist');
  if (!fs.existsSync(dir)) {
    console.error(`[dashboard-gen] Serve dir missing: ${dir}. Build first (dg build).`);
    process.exitCode = 1;
    return null;
  }
  const port = Number(process.env.PORT || argv.port || 4173);
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.csv': 'text/plain; charset=utf-8',
  };
  const server = http.createServer((req, res) => {
    const raw = req.url || '/';
    // Reject traversal before any URL normalization: a raw request path that
    // contains a ".." segment (or its percent-encoded form) must not be able
    // to escape the served tree.
    if (/(^|\/)\.\.(\/|$)/.test(raw) || /%2e%2e/i.test(raw)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(raw, 'http://localhost').pathname);
    } catch {
      res.writeHead(400); res.end('bad request'); return;
    }
    if (!urlPath.startsWith('/')) {
      res.writeHead(400); res.end('bad request'); return;
    }
    // Directory guard: normalize and resolve, then require the result to stay
    // inside the served tree (path.join alone is not a sufficient prefix check).
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const resolved = path.resolve(dir, rel);
    if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const filePath = resolved;
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
  });
  server.listen(port, () => {
    console.log(`[dashboard-gen] serving ${dir} at http://localhost:${port}`);
  });
  return server;
}

// ---------------------------------------------------------------------------
// new
// ---------------------------------------------------------------------------

const TEMPLATES = ['landing', 'table', 'chart', 'dashboard', 'fetch'];

// Internal data fixtures referenced by templates (resolved relative to the DSL
// at runtime and copied next to the generated page at build time).
const TEMPLATE_FIXTURES = {
  fetch: ['market.json'],
};

function templateSource(name) {
  const file = path.join(EXAMPLES_DIR, `${name}.yaml`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  return null;
}

function templateExtraFiles(template) {
  return TEMPLATE_FIXTURES[template] || [];
}

function cmdNew(argv) {
  const name = (argv._[0] || 'site').replace(/\.[^.]+$/, '');
  const template = firstDefined(argv.template, argv['template'],
    argv.t, argv['t'], 'landing');
  if (!TEMPLATES.includes(template)) {
    console.error(`[dashboard-gen] Unknown template "${template}". Choose from: ${TEMPLATES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const outDir = path.resolve(name);
  if (fs.existsSync(outDir)) {
    console.error(`[dashboard-gen] Directory "${name}" already exists.`);
    process.exitCode = 1;
    return;
  }
  const dsl = templateSource(template);
  if (!dsl) {
    console.error(`[dashboard-gen] Template source missing (examples/${template}.yaml).`);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'dg.dsl.yaml'), dsl);
  fs.writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify(
      {
        name: `${name}-site`,
        private: true,
        type: 'commonjs',
        scripts: {
          build: 'dg build dg.dsl.yaml && cp dist/site.html dist/index.html',
          serve: 'dg serve',
        },
        dependencies: { 'dashboard-gen': '*' },
      },
      null,
      2
    ) + '\n'
  );
  // Templates that bind a local fixture also copy the fixture into the project.
  const extra = templateExtraFiles(template);
  for (const f of extra) {
    const src = path.join(EXAMPLES_DIR, f);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(outDir, path.basename(f));
    fs.copyFileSync(src, dest);
  }
  fs.writeFileSync(
    path.join(outDir, '.github', 'workflows', 'pages.yml'),
    getPagesAction(name)
  );
  console.log(`[dashboard-gen] created "${outDir}" (template: ${template}).
  cd ${outDir}
  dg build          # -> dist/${name}.html
  dg serve          # open http://localhost:4173
`);
}

function getPagesAction(name) {
  return `name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm install
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

// ---------------------------------------------------------------------------

function cli(argv) {
  const [cmd, ...rest] = argv;
  const args = parseArgs(rest);
  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'new':
      cmdNew(args);
      return;
    case 'build':
      cmdBuild(args);
      return;
    case 'watch':
      cmdWatch(args);
      return;
    case 'serve':
      cmdServe(args);
      return;
    default:
      console.error(`[dashboard-gen] Unknown command "${cmd}".`);
      printHelp();
      process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          // --template landing (space-separated value form)
          out[key] = next;
          i++;
        } else {
          out[key] = true;
        }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        // -t landing
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function firstDefined() {
  for (const v of arguments) {
    if (v !== undefined && v !== null && v !== false && v !== '') return v;
  }
  return undefined;
}

module.exports = { cli, cmdBuild, cmdServe, cmdNew, cmdWatch, watch, HELP };
