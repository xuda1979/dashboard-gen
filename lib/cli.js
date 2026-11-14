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

function parseDslOrThrow(absPath) {
  const source = fs.readFileSync(absPath, 'utf8');
  return source;
}

function buildOne(absSrcPath, outHtmlPath) {
  const source = fs.readFileSync(absSrcPath, 'utf8');
  const fileDir = path.dirname(absSrcPath);
  const html = buildFromSource(source, absSrcPath, { fileDir });
  fs.mkdirSync(path.dirname(outHtmlPath), { recursive: true });

  // Copy any local fetch fixtures (relative URLs) next to the output so the
  // served page can load them at runtime.
  const { parseDsl } = require('./loader');
  const { collectFetchSpecs } = require('./render');
  const parsed = parseDsl(source, absSrcPath);
  const fetchUrls = collectFetchSpecs(parsed.data);
  const outDir = path.dirname(outHtmlPath);
  for (const url of fetchUrls) {
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      // relative path on disk
      const srcFixture = path.resolve(fileDir, url.replace(/^\.\//, ''));
      if (fs.existsSync(srcFixture) && fs.statSync(srcFixture).isFile()) {
        fs.copyFileSync(srcFixture, path.join(outDir, path.basename(url)));
      }
      continue;
    }
    let spec;
    try {
      spec = new URL(url);
    } catch {
      continue;
    }
    if (spec.protocol === 'self:') {
      const rel = spec.pathname.replace(/^\//, '');
      const srcFixture = path.resolve(fileDir, rel);
      if (fs.existsSync(srcFixture) && fs.statSync(srcFixture).isFile()) {
        fs.copyFileSync(srcFixture, path.join(outDir, path.basename(rel)));
      }
      continue;
    }
    // http(s) absolute → runtime fetch, nothing to copy
  }

  fs.writeFileSync(outHtmlPath, html);
  return html;
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
  return watch(srcAbs);
}

// watch(): build then rebuild on DSL change. Returns the watcher so tests can
// close it (avoids keeping the process alive).
function watch(srcAbs) {
  const name = siteNameFrom(srcAbs);
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
  const watcher = fs.watch(path.dirname(srcAbs), (event, changed) => {
    if (changed !== path.basename(srcAbs)) return;
    runBuild('(watch)');
  });
  console.log(`[dashboard-gen] watching ${srcAbs}`);
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
  return watcher;
}

function cmdServe(argv) {
  const dir = path.resolve(argv._[0] || 'dist');
  if (!fs.existsSync(dir)) {
    console.error(`[dashboard-gen] Serve dir missing: ${dir}. Build first (dg build).`);
    process.exitCode = 1;
    return;
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
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    // Directory guard
    if (!filePath.startsWith(dir)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
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
}

// ---------------------------------------------------------------------------
// new
// ---------------------------------------------------------------------------

const TEMPLATES = ['landing', 'table', 'chart', 'dashboard', 'fetch'];

function templateSource(name) {
  const file = path.join(EXAMPLES_DIR, `${name}.yaml`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  return null;
}

function cmdNew(argv) {
  const name = (argv._[0] || 'site').replace(/\.[^.]+$/, '');
  const tFlag = argv.template || (argv['--template'] || '');
  const template = tFlag || 'landing';
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
    JSON.stringify({ name: `${name}-site`, private: true, scripts: { build: 'dg build' } }, null, 2) + '\n'
  );
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
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx dg build dg.dsl.yaml
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
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = true;
    } else if (a.startsWith('-') && a.length > 1) {
      out[a.slice(1)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

module.exports = { cli, cmdBuild, cmdServe, cmdNew, cmdWatch, watch, HELP };
