// CLI implementation: dg new / dg build / dg watch / dg serve

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { buildFromSource } = require('./build');
const { parseDsl } = require('./loader');
const {
  DashboardError,
  DataFileError,
  ParseError,
} = require('./errors');
const { checkA11y } = require('./a11y');

const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');

// ---------------------------------------------------------------------------
// Help / errors
// ---------------------------------------------------------------------------

const HELP = `dashboard-gen — declarative YAML/JSON -> static single-file page

Usage:
  dg new <name>             Bootstrap a new project (templates from examples/)
  dg build [src]            Build src (or dg.dsl.yaml) to dist/<name>.html
  dg build [src] --check    Build, then lint the page for a11y and fail on errors
  dg watch [src]            Build, then rebuild on DSL or data-file changes
  dg watch [src] --check    Same, and lint every rebuilt page for a11y (exit 1 on violations)
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
  // ensureArg only checks existence/directory-ness; an unreadable-but-existing
  // file (e.g. chmod 000) would make readFileSync throw a raw EACCES stack that
  // errorOut would leak verbatim. Convert it into the clean ParseError style
  // used for a missing DSL file.
  let source;
  try {
    source = fs.readFileSync(absSrcPath, 'utf8');
  } catch (err) {
    throw new ParseError(`Could not read DSL source: ${absSrcPath}`);
  }
  const fileDir = path.dirname(absSrcPath);
  const html = buildFromSource(source, absSrcPath, { fileDir });
  const outDir = path.dirname(outHtmlPath);

  // A plain file squatting on the output-directory path (the dir itself or any
  // ancestor) would make the recursive mkdir throw a raw EEXIST/ENOTDIR stack;
  // reject it with a clean one-line diagnostic instead (matches the
  // directory-output-path error style).
  let probeDir = outDir;
  while (probeDir) {
    if (fs.existsSync(probeDir) && !fs.statSync(probeDir).isDirectory()) {
      const rel = path.relative(process.cwd(), probeDir) || probeDir;
      throw new DashboardError(`Output directory is a file, not a directory: ${rel}`);
    }
    const parent = path.dirname(probeDir);
    if (parent === probeDir) break; // filesystem root
    probeDir = parent;
  }

  // The remaining writes can still hit raw filesystem errors — an unwritable
  // dist/ dir throws EACCES from writeFileSync, an unwritable parent throws it
  // from mkdirSync, an unreadable fixture throws it from copyFileSync. All of
  // those would leak verbatim through errorOut's else branch; convert them to
  // the clean one-line diagnostic style. Guard-thrown DashboardErrors (the
  // directory-squat checks above and DataFileErrors from copyLocalFixtures)
  // pass through untouched.
  try {
    fs.mkdirSync(outDir, { recursive: true });

    // A directory squatting on the output name would make writeFileSync throw a
    // raw EISDIR stack; reject it with a clean one-line diagnostic instead
    // (matches the directory-DSL-source error style).
    if (fs.existsSync(outHtmlPath) && fs.statSync(outHtmlPath).isDirectory()) {
      const rel = path.relative(process.cwd(), outHtmlPath) || outHtmlPath;
      throw new DashboardError(`Output path is a directory, not a file: ${rel}`);
    }
    copyLocalFixtures(source, absSrcPath, path.dirname(outHtmlPath));
    fs.writeFileSync(outHtmlPath, html);
  } catch (err) {
    if (err instanceof DashboardError) throw err;
    const rel = path.relative(process.cwd(), outHtmlPath) || outHtmlPath;
    throw new DashboardError(`Could not write output (${err.code || err.message}): ${rel}`);
  }
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
    try {
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
    } catch (err) {
      if (err instanceof DataFileError) throw err;
      throw new DataFileError(`Could not read fixture "${rel}" (${err.code || err.message})`);
    }
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
    // "self://data/x.json" -> "data/x.json": the whole path (hostname acts as
    // the first segment before any "/") maps to the relative fixture path.
    return require('./loader').normalizeFetchUrl(url);
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
  if (fs.statSync(abs).isDirectory()) {
    throw new ParseError(`DSL source is a directory, not a file: ${src}`);
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
  // `--check` runs the a11y linter (lib/a11y.js — the same checks as the
  // standalone scripts/a11y-check.mjs tool) on the built page and fails the
  // build with exit code 1 when the page violates a hard invariant.
  if (argv.check) {
    const { problems, warnings } = checkA11y(html);
    const ok = problems.length === 0;
    const rel = path.relative(process.cwd(), outAbs) || outAbs;
    console.log(`[dashboard-gen] a11y-check ${ok ? 'OK' : 'FAIL'} (${rel})`);
    problems.forEach((p) => console.error('  - ' + p));
    warnings.forEach((w) => console.log('  note: ' + w));
    if (!ok) {
      throw new DashboardError('Page failed the a11y accessibility checks above');
    }
  }
  return outAbs;
}

function siteNameFrom(srcAbs) {
  const base = path.basename(srcAbs, path.extname(srcAbs));
  return base === 'dg.dsl' ? 'site' : base;
}

function cmdWatch(argv) {
  const srcAbs = ensureArg(argv._[0]);
  const check = Boolean(argv.check);

  // Stop anything watching the previous file lock before starting a new watch.
  stopWatchers();
  return watch(srcAbs, { check });
}

let activeWatcher = null;
// Data-file watchers, per watch (the CLI only runs one watch at a time, but
// tests may create several). stopWatchers and the returned handle's close both
// tear them down so they never keep the event loop alive after a test.
const dataWatchers = new Set();
function stopWatchers() {
  if (activeWatcher) {
    try { activeWatcher.close(); } catch { /* already closed */ }
    activeWatcher = null;
  }
  dataWatchers.forEach((w) => { try { w.close(); } catch { /* already closed */ } });
  dataWatchers.clear();
}

// watch(): build then rebuild on DSL change, and on changes to the data files
// it embeds/copies (chart `file:` bindings and local fetch fixtures), which are
// edited independently of the DSL. Returns the watcher so tests can close it
// (avoids keeping the process alive).
function watch(srcAbs, opts) {
  const check = opts && opts.check ? true : false;
  const name = siteNameFrom(srcAbs.trim());
  const outName = process.env.DG_OUTPUT || `${name}.html`;
  const outAbs = path.resolve('dist', outName);

  // Parent-dir + basename shape matches the source watcher so editor
  // rename/delete+create saves stay live. Debounced: a single write can fire
  // multiple events (unlink+create) in quick succession.
  function watchDataFile(abs, runBuildRef) {
    let last = 0;
    let w;
    try {
      w = fs.watch(path.dirname(abs), (event, changed) => {
        if (changed !== null && changed !== path.basename(abs)) return;
        const now = Date.now();
        if (now - last < 300) return;
        last = now;
        runBuildRef('(data)');
      });
    } catch {
      return null; // un-watchable ref (missing parent dir); treat as non-fatal
    }
    dataWatchers.add(w);
    return w;
  }

  function runBuild(tag) {
    let html;
    try {
      html = buildOne(srcAbs, outAbs);
      const t = tag || '';
      console.log(`[dashboard-gen] ${new Date().toISOString()} built ${outName}${t ? ' ' + t : ''}`);
      watchDataRefs();
    } catch (err) {
      errorOut(err);
      return;
    }
    // `watch --check` runs the same a11y gate as `build --check` on every
    // rebuilt page. Failing sets the exit code but leaves the watcher running,
    // so the next edit that fixes the violation re-lints on the same watcher.
    if (check) {
      const { problems, warnings } = checkA11y(html);
      const ok = problems.length === 0;
      const rel = path.relative(process.cwd(), outAbs) || outAbs;
      console.log(`[dashboard-gen] a11y-check ${ok ? 'OK' : 'FAIL'} (${rel})`);
      problems.forEach((p) => console.error('  - ' + p));
      warnings.forEach((w) => console.log('  note: ' + w));
      if (!ok) {
        errorOut(new DashboardError('Page failed the a11y accessibility checks above'));
      }
    }
  }

  // (Re)bind watchers to the data files the current DSL references. Runs after
  // every successful build because the DSL can add or drop bindings; watchers
  // for stale refs are closed.
  function watchDataRefs() {
    const { collectLocalDataRefs } = require('./render');
    let refs;
    try {
      refs = collectLocalDataRefs(
        parseDsl(fs.readFileSync(srcAbs, 'utf8'), srcAbs).data,
        path.dirname(srcAbs)
      );
    } catch {
      return; // the failed build already reported; nothing to watch
    }
    const alive = new Set();
    refs.forEach((abs) => {
      const w = watchDataFile(abs, runBuild);
      if (w) alive.add(w);
    });
    dataWatchers.forEach((w) => {
      if (!alive.has(w)) {
        try { w.close(); } catch { /* already closed */ }
        dataWatchers.delete(w);
      }
    });
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
  // Named handler so closing a watch tears it down too; otherwise every watch
  // call in a long-lived process (and every watch() in a test run) pins another
  // SIGINT listener past close, eventually tripping MaxListenersExceededWarning.
  const onSigint = () => {
    stopWatchers();
    process.exit(0);
  };
  process.on('SIGINT', onSigint);
  // Wrap the handle so closing it (as the tests do) also closes this watch's
  // data watchers and drops the SIGINT handler; otherwise they keep the event
  // loop alive after a test.
  const handle = {
    close() {
      process.removeListener('SIGINT', onSigint);
      try { watcher.close(); } catch { /* already closed */ }
      if (activeWatcher === watcher) activeWatcher = null;
      dataWatchers.forEach((w) => { try { w.close(); } catch { /* already closed */ } });
      dataWatchers.clear();
    },
  };
  return handle;
}

function cmdServe(argv) {
  const dir = path.resolve(argv._[0] || 'dist');
  if (!fs.existsSync(dir)) {
    console.error(`[dashboard-gen] Serve dir missing: ${dir}. Build first (dg build).`);
    process.exitCode = 1;
    return null;
  }
  const port = Number(process.env.PORT || argv.port || 4173);
  // A bad port must fail with a clean diagnostic, not a raw ERR_SOCKET_BAD_PORT
  // stack from server.listen (matches the DirectorySource/empty-fixture error
  // style). NaN fails the integer bounds check below.
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`[dashboard-gen] Invalid port "${process.env.PORT || argv.port}". Use a number 0-65535.`);
    process.exitCode = 1;
    return null;
  }
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
      // The open/read can still fail after the stat above (file removed or
      // unreadable in between) — createReadStream spills that as an async
      // 'error' event, which with no listener would crash the whole serve
      // process with a raw "node:events:N throw er" stack (same async class as
      // the EADDRINUSE listen failure). Destroy just this response instead.
      fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
    });
  });
  // server.listen failures fire an async unhandled 'error' event on the Server
  // object, which would bypass errorOut's dispatch catch and dump a raw stack
  // (e.g. EADDRINUSE when the port is occupied). Attach an explicit handler
  // that converts them into the clean one-line diagnostic style.
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[dashboard-gen] Port ${port} already in use. Pick another port (--port <n> or the PORT env var).`);
    } else {
      console.error(`[dashboard-gen] Could not start server (${(err && err.code) || err}): ${dir}`);
    }
    process.exitCode = 1;
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

// Minimal runbook so a freshly scaffolded repo (Pages workflow and all) tells
// a visitor how to build, serve, and edit the site without consulting the
// dashboard-gen README.
function scaffoldReadme(name, template) {
  const t = template === 'landing' ? 'the landing' : template;
  return `# ${name}-site

A static page generated from a declarative YAML DSL with the dashboard-gen
CLI. This project was scaffolded with the ${t} template.

## Commands

\`\`\`sh
npm install          # pull in the dashboard-gen CLI
npm run build        # render dg.dsl.yaml -> dist/site.html, copy to dist/index.html
npm run serve        # http://localhost:4173
\`\`\`

## Edit the page

Everything that renders comes from \`dg.dsl.yaml\` (here: the ${t}
template). Change the title, sections, and components there, then rebuild.
Generated output under \`dist/\` is read-only; do not edit it by hand.

See the dashboard-gen README for the full component catalog (charts, cards,
stats, tables, ...) and the a11y lint gate that \`npm run build\` applies
(\`--check\`).

## Deploy

Push to \`main\` and the included \`.github/workflows/pages.yml\` builds the
page and deploys it to GitHub Pages. Enable Pages -> GitHub Actions in the
repository settings.
`;
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
  // A plain file squatting on an ancestor of the project path (e.g. "block" is
  // a file and the name is "block/site") would make the recursive mkdir throw a
  // raw ENOTDIR stack; reject it with a clean one-line diagnostic instead
  // (matches the build output-directory guard).
  let probeDir = outDir;
  while (probeDir) {
    if (fs.existsSync(probeDir) && !fs.statSync(probeDir).isDirectory()) {
      const rel = path.relative(process.cwd(), probeDir) || probeDir;
      throw new DashboardError(`Project path is a file, not a directory: ${rel}`);
    }
    const parent = path.dirname(probeDir);
    if (parent === probeDir) break; // filesystem root
    probeDir = parent;
  }
  const dsl = templateSource(template);
  if (!dsl) {
    console.error(`[dashboard-gen] Template source missing (examples/${template}.yaml).`);
    process.exitCode = 1;
    return;
  }
  // The remaining writes can still hit raw filesystem errors — an unwritable
  // parent dir throws EACCES from the recursive mkdir, an unwritable project
  // dir throws it from writeFileSync. Those would leak verbatim through
  // errorOut's else branch; convert them to the clean one-line diagnostic style
  // (matching the build output-write guard). Guard-thrown DashboardErrors (the
  // path-squat probe above) pass through untouched.
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(path.join(outDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'dg.dsl.yaml'), dsl);
    fs.writeFileSync(path.join(outDir, 'README.md'), scaffoldReadme(name, template));
    fs.writeFileSync(
      path.join(outDir, 'package.json'),
      JSON.stringify(
        {
          name: `${name}-site`,
          private: true,
          type: 'commonjs',
          scripts: {
            // --check fails the build when the page violates a11y invariants,
            // so violations never reach Pages.
            build: 'dg build dg.dsl.yaml --check && cp dist/site.html dist/index.html',
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
  } catch (err) {
    if (err instanceof DashboardError) throw err;
    const rel = path.relative(process.cwd(), outDir) || outDir;
    throw new DashboardError(`Could not create project (${err.code || err.message}): ${rel}`);
  }
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
  try {
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
  } catch (err) {
    errorOut(err);
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
