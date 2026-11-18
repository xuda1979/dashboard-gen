# dashboard-gen

Declarative landing-page / internal-tools dashboard generator. Write a
YAML/JSON **DSL**, get a **single self-contained HTML file** — no CDN, no
runtime dependencies, offline-openable. Charts are rendered as local
inline SVG (no chart library).

Generated pages are read-only static assets that deploy anywhere — GitHub
Pages, Netlify `_site`, an S3 bucket, or a USB stick.

## Quick start

```sh
npm install
npm test                # DSL fixture -> generate -> assert DOM structure

# CLI (local bin or `npm link`):
npx dg new my-site --template=dashboard
cd my-site && npx dg build    # -> dist/site.html (npm run build copies it to dist/index.html for Pages)
npx dg serve                  # http://localhost:4173
```

CLI commands:

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `dg new <name>`    | Bootstrap a project with a template + Pages action  |
| `dg build [src]`   | Render DSL → `dist/<name>.html`                     |
| `dg build --check` | Build, then lint the page for a11y and fail the build on errors |
| `dg watch [src]`   | Build, then rebuild when the DSL (or a bound data file/fixture) changes |
| `dg watch --check` | Same, and lint every rebuilt page for a11y; exit 1 on violations (watcher keeps running) |
| `dg serve [dir]`   | Static server for `dist/` at `localhost:4173`       |

## Page model (the DSL)

```yaml
title: Ops Console
layout: sidebar            # hero | grid | sidebar | section | landing
description: Read-only ops dashboard.
theme:                     # optional Tailwind-like CSS tokens
  accent: "#0ea5e9"
  radius: "6px"

hero:                      # optional: component list or { content: [...] }
  - type: headline
    level: 1
    text: Ops Console

sections:
  - title: Metrics
    content:
      - type: chart
        kind: line
        title: Requests / minute
        data:
          - label: 10:00
            series: { prod: 940, staging: 230 }
      - type: card
        title: P99 latency
        text: 212 ms
        intent: success
```

JSON works too — point `dg build` at a `.json` file with the same shape.

## Layouts

- `hero` — sections render as side-by-side hero columns
- `grid` — sections render as an auto-fit responsive column grid
- `sidebar` — the first section's `nav:` widget becomes a sticky sidebar;
  everything else flows into the content column
- `section` / `landing` — stacked sections with titles (default)

Sections may also carry `hero:` (a sub-hero strip) in addition to `content:`.

## Components

| type         | key fields                                              |
| ------------ | ------------------------------------------------------- |
| `headline`   | `text`, `level` (1-6), `id`                             |
| `paragraph`  | `text` (or `{text, href}` inline-link form)             |
| `list`       | `items[]`, `ordered`                                    |
| `steps`      | `items[]` (numbered procedure list)                     |
| `button`     | `text`, `href`, `style` (primary/secondary/subtle/danger), `newtab` |
| `link`       | `text`/`label`, `href`, `style` (`button`), `newtab`    |
| `card`       | `title`, `text`, `intent` (primary/success/danger/warning) |
| `stat`       | `value`, `label`, `prefix`/`suffix`, `delta`, `progress` (KPI metric) |
| `stat-list`  | `items[]` (`label`, `value`, `prefix`/`suffix`, `delta`), `caption` (KPI row table) |
| `toc`        | `label` (in-page table of contents linking every section title) |
| `badge`      | `text`, `tone` (neutral/primary/success/warning/danger) |
| `divider`    | —                                                       |
| `quote`      | `text`, `cite`                                          |
| `code`       | `code` (string or lines), `lang`, `title`               |
| `callout`    | `text`, `title`, `tone` (primary/success/warning/danger/neutral) |
| `kv`         | `items[]` (`{key, value}` definition list)                    |
| `grid`       | `items[]`, `columns`, `columnWidth`                     |
| `table`      | `rows` (array-of-arrays or array-of-objects), `caption`, `header` |
| `chart`      | `kind` (line/bar/pie), `title`, `caption`, `start`, `data`/`file`/`fetch` |
| `image`      | `file` (path, inlined as data URI), `alt`, `caption`, `width`/`height` |
| `details`    | `summary`/`title`, `content` (components or strings), `open`, `text` (collapsible block) |
| `tabs`       | `tabs[]` (`label` + `content`/`text`), `active` (radio-based, zero-JS tabs) |
| `checklist`  | `items[]` (string or `{text, done}` — done/pending status list)     |
| `footnote`   | `text`, `label` (small-print end note)                              |
| `timeline`   | `items[]` (`{time, text}` — chronological event log), `title`        |
| `def-list`   | `items[]` (`{key, value}` — plain definition list, no card band)     |
| `stepper`    | `items[]` (string or `{text}` steps), `current` (0-based — step-marked progress) |
| `sparkline`  | `data` (numbers, `[label, value]`/`[value]`, `{value}`/`{label, value}` — build-time SVG trend), `title`, `caption` |
| `status`     | `items[]` (string or `{name, state, detail}` — service-health list; states healthy/degraded/down/maintenance), `title` |
| `heatmap`    | `columns[]`, `rows[]` (string or `{label, values}`) / `data` matrix — intensity grid, every cell textual, Low→High legend, `title` |
| `progress`   | `value` (0-100, labelless standalone), `label`/`title`, `tone` (primary/success/warning/danger — labelled completion bar, percent always visible text) |
| `terminal`   | `items[]` (string or `{text, level}` where level cmd/info/ok/warn/err), `title`, `prompt` (console transcript; levels spelled as visible text) |
| `gauge`      | `value`, `min`/`max` (default 0/100), `label`, `suffix`, `tone` (primary/success/warning/danger), `caption` (semicircular arc readout; value always visible text) |
| `breadcrumbs` | `items[]` (string or `{label, href}`), `label` (`<nav>` trail ending in the current page as plain text with `aria-current="page"`) |

## Data binding

Charts bind rows two ways:

1. **Inline** — `data:` as an array of arrays (optionally with a header row)
   or array of objects; or `data: { csv: "a,b\n1,2" }` / `data: { json: [...] }`.
   Rows are embedded in the page as `window.__DG_DATA__`.
   Pie charts accept either a single row with a multi-key `series:` map (one
   slice per series key) or one row per slice (`{ label, value }` / `[label, value]`).
2. **File** — `file: data.json` / `file: data.csv` (resolved at build time).
3. **Fetch (read-only)** — `data: { fetch: market.json }` loads the JSON at
   page-open time. Serve the fixture next to the page; for remote URLs the
   host must allow CORS. `self://<path>` is treated as a local relative path.

`dg watch` follows `file:` bindings and local fetch fixtures too, so editing
chart data rebuilds the page without touching the DSL.

## Accessibility

Generated pages include a skip link, `lang`, a single `<main id="main">`
landmark, every `<nav>` landmark labelled (auto nav, table of contents,
breadcrumbs), semantic tables (`scope="col"`/`scope="row"`),
every `role="img"` element (charts, stat values, progress bars) carries an
accessible name, all `id` attributes are unique (skip link, section
anchors, tab radios), and every id reference (fragment links, label `for`,
ARIA relations) resolves to an existing element. Lint any artifact, or fold
the same checks into the build:

```sh
node scripts/a11y-check.mjs dist/chart.html
dg build --check   # run the checks on each build; exit 1 on violations
dg watch --check   # same gate on every live rebuild (watch keeps running)
```

## GitHub Pages

Repo-level workflow at `.github/workflows/pages.yml` builds every example
into `dist/` (with the landing page copied to `dist/index.html` so the Pages
root shows it) and deploys. Projects scaffolded by `dg new` get their own copy
that builds that DSL into `dist/index.html`. Both gates on `dg build --check`,
so a page that fails the a11y invariants is not deployed. Enable Pages →
*GitHub Actions* in the repo settings.

## Development

- `test/` — `node --test`; fixture DSL → render → assert DOM/aria/chart output,
  plus a JS-dom stub that executes the embedded chart runtime to prove real
  `<path>`/`<rect>` SVG is produced.
- `examples/` — the five canonical DSLs: landing, table, chart, dashboard,
  fetch.
- `lib/` — `loader` (parse+validate+bind), `components` (per-type renderers),
  `render` (page assembly + inline SVG chart runtime), `style`/`theme`
  (token CSS), `cli` (`new/build/watch/serve`).

## License

Dual-licensed: the source code is released under the
**GNU Affero General Public License v3.0 (AGPL-3.0)** — see
[`LICENSE`](LICENSE). Any commercial or profit-making use, or use in a
product or service sold or licensed to others, requires a separate
written commercial authorization agreement with the copyright holder — see
[`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md).

Copyright (c) 2026 许达 (Xu Da) / 中国移动研究院 (China Mobile Research Institute).
