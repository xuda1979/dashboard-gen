// Static CSS emitted in every generated page. Tokens come from CSS custom
// properties set on :root from the theme (light) + dark-mode media block.

const BASE_CSS = `
/* base */
* { box-sizing: border-box; }
body { margin: 0; background: var(--page-bg); color: var(--text-color); font-family: var(--font-family); line-height: 1.55; }
a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* layout */
.dg-main { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.dg-hero { border-bottom: 1px solid var(--border-color); padding: 3.5rem 1.25rem; }
.dg-hero-inner { max-width: 960px; margin: 0 auto; }
.dg-nav { border-bottom: 1px solid var(--border-color); background: var(--card-bg); padding: 0.5rem 1.25rem; }
.dg-nav ul { display: flex; flex-wrap: wrap; gap: 0.25rem 1.5rem; list-style: none; margin: 0 auto; padding: 0; max-width: 960px; }
.dg-navlink { color: var(--muted-color); text-decoration: none; font-weight: 500; }
.dg-navlink.is-active, .dg-navlink:hover, .dg-navlink:focus { color: var(--accent); }
.dg-section { padding: 2rem 0; border-bottom: 1px solid var(--border-color); }
.dg-section:last-child { border-bottom: none; }
.dg-section-title { margin: 0 0 1rem; }
.dg-footer { color: var(--muted-color); font-size: 0.8rem; text-align: center; padding: 2rem 1.25rem; }
.skip-link { position: absolute; left: -9999px; top: 0; background: var(--accent); color: #fff; padding: 0.5rem 0.75rem; border-radius: 0 0 4px 0; }
.skip-link:focus { left: 0; }

/* typography */
.dg-headline { color: var(--title-color); margin: 0 0 0.5rem; }
.dg-h1 { font-size: 2.4rem; }
.dg-h2 { font-size: 1.7rem; }
.dg-h3 { font-size: 1.3rem; }
.dg-h4 { font-size: 1.1rem; }
.dg-paragraph { color: var(--text-color); max-width: 70ch; }
.dg-ul, .dg-ol { padding-left: 1.25rem; color: var(--text-color); }
.dg-steps { list-style: none; margin: 1rem 0; padding: 0; counter-reset: dg-step; }
.dg-steps-item { display: flex; align-items: baseline; gap: 0.7rem; padding: 0.45rem 0; }
.dg-steps-num { counter-increment: dg-step; flex: none; width: 1.5rem; height: 1.5rem; border-radius: 999px; background: var(--accent); color: #fff; font-size: 0.8rem; font-weight: 700; line-height: 1.5rem; text-align: center; }
.dg-steps-text { min-width: 0; }
.dg-kv { margin: 1rem 0; border: 1px solid var(--border-color); border-radius: var(--radius); overflow: hidden; }
.dg-kv-row { display: grid; grid-template-columns: minmax(8rem, max-content) 1fr; gap: 1rem; padding: 0.55rem 1rem; }
.dg-kv-row:nth-child(odd) { background: var(--card-bg); }
.dg-kv-row dt { font-weight: 600; color: var(--title-color); }
.dg-kv-row dd { margin: 0; color: var(--text-color); }
@media (max-width: 480px) { .dg-kv-row { grid-template-columns: 1fr; gap: 0.15rem; } }
.dg-note { color: var(--muted-color); font-size: 0.9rem; }

/* responsive grid */
.dg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; }

/* buttons */
.dg-btn { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.6rem 1.1rem; border-radius: var(--radius); font-weight: 600; text-decoration: none; cursor: pointer; border: 1px solid transparent; font-family: inherit; font-size: 1rem; }
.dg-btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.dg-btn--primary:hover { filter: brightness(1.06); }
.dg-btn--secondary { background: var(--card-bg); color: var(--title-color); border-color: var(--border-color); }
.dg-btn--subtle { background: transparent; color: var(--accent); }
.dg-btn--danger { background: #dc2626; color: #fff; border-color: #dc2626; }
.dg-icon { width: 1em; height: 1em; }

/* sidebar layout */
.dg-sidebar-wrap { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 2rem; align-items: start; }
.dg-sidebar { position: sticky; top: 1rem; display: flex; flex-direction: column; gap: 0.75rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.25rem; }
.dg-sidebar-main { min-width: 0; }
@media (max-width: 760px) { .dg-sidebar-wrap { grid-template-columns: 1fr; } .dg-sidebar { position: static; } }

/* grid layout */
.dg-layout-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1.5rem; align-items: start; }

/* hero layout */
.dg-hero-layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1.5rem; align-items: stretch; }
.dg-hero-col { padding: 1.5rem; }
.dg-hero-col--lead { font-size: 1.1rem; }
.dg-hero-sub { border-bottom: none; padding: 1.25rem 0; }

/* cards */
.dg-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
.dg-card--primary { border-left: 4px solid var(--accent); }
.dg-card--success { border-left: 4px solid #16a34a; }
.dg-card--danger { border-left: 4px solid #dc2626; }
.dg-card--warning { border-left: 4px solid #d97706; }
.dg-card-title { color: var(--title-color); font-weight: 600; margin: 0; }

/* stat KPI cards */
.dg-stat { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.1rem 1.25rem; display: flex; flex-direction: column; gap: 0.4rem; }
.dg-stat-value { font-size: 1.9rem; font-weight: 700; line-height: 1.15; color: var(--title-color); }
.dg-stat-prefix, .dg-stat-suffix { font-size: 1rem; font-weight: 600; color: var(--muted-color); }
.dg-stat-label { font-size: 0.9rem; font-weight: 600; color: var(--muted-color); text-transform: uppercase; letter-spacing: 0.04em; }
.dg-stat-caption { font-size: 0.85rem; color: var(--muted-color); }
.dg-stat-delta { font-size: 0.9rem; font-weight: 600; }
.dg-stat-delta--good { color: #16a34a; }
.dg-stat-delta--bad { color: #dc2626; }
.dg-stat-delta--neutral { color: var(--muted-color); }
.dg-stat-progress { height: 0.5rem; border-radius: 999px; background: var(--page-bg); border: 1px solid var(--border-color); overflow: hidden; margin-top: 0.25rem; }
.dg-stat-progress-fill { display: block; height: 100%; border-radius: 999px; }
.dg-stat-progress-fill--primary { background: var(--accent); }
.dg-stat-progress-fill--success { background: #16a34a; }
.dg-stat-progress-fill--warning { background: #d97706; }
.dg-stat-progress-fill--danger { background: #dc2626; }

/* stat list KPI band */
.dg-statlist { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.dg-statlist-row th { text-align: left; padding: 0.55rem 0.75rem; color: var(--muted-color); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.dg-statlist-row td { padding: 0.55rem 0.75rem; color: var(--text-color); }
.dg-statlist-row th[scope="row"] { border-bottom: 1px solid var(--border-color); }
.dg-statlist-value { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--title-color); }
.dg-statlist-delta { font-weight: 600; white-space: nowrap; }
.dg-statlist-delta--good { color: #16a34a; }
.dg-statlist-delta--bad { color: #dc2626; }
.dg-statlist-delta--neutral { color: var(--muted-color); }
.dg-statlist .dg-note { text-align: center; padding: 1rem 0.75rem; }

/* table of contents */
.dg-toc { margin: 1rem 0; }
.dg-toc ul { list-style: none; margin: 0; padding: 0; }
.dg-toc li { margin: 0.15rem 0; }
.dg-toc-link { color: var(--muted-color); text-decoration: none; font-weight: 500; }
.dg-toc-link:hover, .dg-toc-link:focus { color: var(--accent); text-decoration: underline; }

/* checklist */
.dg-checklist { list-style: none; margin: 1rem 0; padding: 0; border: 1px solid var(--border-color); border-radius: var(--radius); overflow: hidden; }
.dg-checklist-item { display: flex; align-items: baseline; gap: 0.6rem; padding: 0.5rem 1rem; }
.dg-checklist-item:nth-child(odd) { background: var(--card-bg); }
.dg-checklist-item--pending { color: var(--text-color); }
.dg-checklist-item--done { color: var(--muted-color); }
.dg-checklist-mark { flex: none; font-weight: 700; }
.dg-checklist-item--done .dg-checklist-mark { color: #16a34a; }
.dg-checklist-item--pending .dg-checklist-mark { color: var(--muted-color); }

/* footnote */
.dg-footnote { color: var(--muted-color); font-size: 0.85rem; border-top: 1px dashed var(--border-color); margin: 1.25rem 0 0.75rem; padding-top: 0.6rem; max-width: 70ch; }

/* timeline */
.dg-timeline { margin: 1rem 0; }
.dg-timeline-title { font-weight: 600; color: var(--title-color); margin-bottom: 0.4rem; }
.dg-timeline-list { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--border-color); padding-left: 1.1rem; }
.dg-timeline-item { position: relative; margin: 0 0 0.65rem; color: var(--text-color); line-height: 1.5; }
.dg-timeline-item::before { content: ""; position: absolute; left: -1.1rem; top: 0.45em; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); transform: translateX(-50%); }
.dg-timeline-time { display: block; font-size: 0.8rem; color: var(--muted-color); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.dg-timeline-text { display: block; }

/* def-list (kv without the bordered band) */
.dg-def-list { margin: 0.75rem 0; display: grid; grid-template-columns: minmax(8rem, max-content) 1fr; gap: 0.25rem 1rem; }
.dg-def-list-row { display: contents; }
.dg-def-list-row dt { font-weight: 600; color: var(--title-color); }
.dg-def-list-row dd { margin: 0; color: var(--text-color); }
@media (max-width: 480px) { .dg-def-list { grid-template-columns: 1fr; gap: 0.15rem; } }

/* stepper (step-marked progress) */
.dg-stepper { list-style: none; margin: 1rem 0; padding: 0; display: flex; align-items: flex-start; gap: 0.25rem; overflow-x: auto; }
.dg-stepper-item { flex: 1 1 0; min-width: 6rem; position: relative; color: var(--muted-color); }
.dg-stepper-item + .dg-stepper-item::before { content: ""; position: absolute; top: 0.75em; left: -0.25rem; right: calc(100% - 1.5rem + 0.25rem); height: 2px; background: var(--border-color); }
.dg-stepper-num { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 999px; background: var(--page-bg); border: 1px solid var(--border-color); font-size: 0.8rem; font-weight: 700; line-height: 1; position: relative; z-index: 1; }
.dg-stepper-text { display: block; margin-top: 0.3rem; font-size: 0.85rem; line-height: 1.35; }
.dg-stepper-item--pending .dg-stepper-num { background: var(--page-bg); border-color: var(--border-color); }
.dg-stepper-item--current { color: var(--text-color); }
.dg-stepper-item--current .dg-stepper-num { background: var(--accent); border-color: var(--accent); color: #fff; }
.dg-stepper-item--done { color: var(--text-color); }
.dg-stepper-item--done .dg-stepper-num { background: #16a34a; border-color: #16a34a; color: #fff; }
.dg-stepper-item--done + .dg-stepper-item::before { background: #16a34a; }
/* narrow screens fall back to a stacked list so labels stay readable */
@media (max-width: 480px) {
  .dg-stepper { flex-direction: column; gap: 0; overflow-x: visible; }
  .dg-stepper-item { min-width: 0; display: flex; gap: 0.7rem; align-items: baseline; padding: 0.45rem 0; }
  .dg-stepper-item + .dg-stepper-item::before { display: none; }
  .dg-stepper-num { flex: none; }
  .dg-stepper-text { margin-top: 0; }
}

/* badge, divider, quote */
.dg-badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; line-height: 1.4; border: 1px solid transparent; }
.dg-badge--neutral { color: var(--muted-color); background: var(--page-bg); border-color: var(--border-color); }
.dg-badge--primary { color: #1e40af; background: #dbeafe; border-color: #bfdbfe; }
.dg-badge--success { color: #14532d; background: #dcfce7; border-color: #bbf7d0; }
.dg-badge--warning { color: #78350f; background: #fef3c7; border-color: #fde68a; }
.dg-badge--danger { color: #7f1d1d; background: #fee2e2; border-color: #fecaca; }
.dg-divider { border: 0; border-top: 1px solid var(--border-color); margin: 1.5rem 0; }
.dg-quote { margin: 1rem 0; padding: 0.25rem 0 0.25rem 1rem; border-left: 3px solid var(--accent); color: var(--text-color); }
.dg-quote p { margin: 0; }
.dg-quote-cite { margin-top: 0.35rem; color: var(--muted-color); font-style: normal; font-size: 0.9rem; }

/* code blocks */
.dg-code { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); overflow: hidden; margin: 1rem 0; }
.dg-code-header { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.9rem; border-bottom: 1px solid var(--border-color); font-size: 0.8rem; color: var(--muted-color); }
.dg-code-title { font-weight: 600; color: var(--title-color); }
.dg-code-lang { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-transform: uppercase; letter-spacing: 0.05em; }
.dg-code-pre { margin: 0; padding: 0.9rem 1rem; overflow-x: auto; }
.dg-code-body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.86rem; line-height: 1.55; color: var(--text-color); white-space: pre; }

/* callouts */
.dg-callout { border: 1px solid var(--border-color); border-left-width: 4px; border-radius: var(--radius); padding: 0.7rem 1rem; margin: 1rem 0; background: var(--card-bg); color: var(--text-color); }
.dg-callout--primary { border-left-color: var(--accent); }
.dg-callout--success { border-left-color: #16a34a; }
.dg-callout--warning { border-left-color: #d97706; }
.dg-callout--danger { border-left-color: #dc2626; }
.dg-callout--neutral { border-left-color: var(--muted-color); }
.dg-callout-title { font-weight: 600; margin-bottom: 0.3rem; color: var(--title-color); }
.dg-callout-body { margin: 0; }

/* details */
.dg-details { border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--card-bg); margin: 1rem 0; }
.dg-details-summary { cursor: pointer; padding: 0.7rem 1rem; font-weight: 600; color: var(--title-color); user-select: none; }
.dg-details[open] .dg-details-summary { border-bottom: 1px solid var(--border-color); }
.dg-details-summary:focus-visible { outline-offset: -2px; }
.dg-details-body { padding: 0.35rem 1rem 0.75rem; }


/* tabs */
.dg-tabs { display: flex; flex-wrap: wrap; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--card-bg); margin: 1rem 0; }
.dg-tab-label { cursor: pointer; padding: 0.6rem 1rem; font-weight: 600; color: var(--muted-color); border-bottom: 2px solid transparent; user-select: none; }
.dg-tab-input { position: absolute; opacity: 0; pointer-events: none; }
.dg-tab-input:checked + .dg-tab-label { color: var(--accent); border-bottom-color: var(--accent); }
.dg-tab-input:focus-visible + .dg-tab-label { outline: 2px solid var(--accent); outline-offset: -2px; }
.dg-tab-panel { order: 99; flex-basis: 100%; padding: 0.35rem 1rem 0.75rem; border-top: 1px solid var(--border-color); display: none; }
.dg-tab-input:checked ~ .dg-tab-panel { display: block; }

/* tables */
.dg-scroll { overflow-x: auto; }
.dg-table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.dg-table th { text-align: left; padding: 0.55rem 0.75rem; border-bottom: 2px solid var(--border-color); color: var(--title-color); }
.dg-table td, .dg-table th[scope="row"] { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border-color); color: var(--text-color); font-weight: normal; }
.dg-table tr:hover td, .dg-table tr:hover th[scope="row"] { background: var(--page-bg); }

/* charts */
.dg-figure { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1rem; }
.dg-chart-title { font-weight: 600; color: var(--title-color); margin-bottom: 0.25rem; }

/* sparkline */
.dg-sparkline-title { font-weight: 600; color: var(--title-color); margin-bottom: 0.25rem; }
.dg-sparkline-svg { display: block; width: 100%; max-width: 24rem; height: auto; margin-top: 0.5rem; }
.dg-sparkline-line { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.dg-sparkline-dot { fill: var(--accent); }
.dg-sparkline-cap { margin-top: 0.5rem; }

/* status (service-health list) */
.dg-status { margin: 1rem 0; }
.dg-status-title { font-weight: 600; color: var(--title-color); margin-bottom: 0.4rem; }
.dg-status-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border-color); border-radius: var(--radius); overflow: hidden; }
.dg-status-item { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.5rem 1rem; }
.dg-status-item:nth-child(odd) { background: var(--card-bg); }
.dg-status-dot { flex: none; align-self: center; width: 0.6rem; height: 0.6rem; border-radius: 50%; }
.dg-status-name { font-weight: 600; }
.dg-status-state { margin-left: auto; font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
.dg-status-detail { flex-basis: 100%; order: 5; padding-left: 1.1rem; color: var(--muted-color); font-size: 0.85rem; }
.dg-status-dot--healthy { background: #16a34a; }
.dg-status-dot--degraded { background: #d97706; }
.dg-status-dot--down { background: #dc2626; }
.dg-status-dot--maintenance { background: var(--muted-color); }
.dg-status-dot--unknown { background: var(--muted-color); }
.dg-status-state--healthy { color: #16a34a; }
.dg-status-state--degraded { color: #d97706; }
.dg-status-state--down { color: #dc2626; }
.dg-status-state--maintenance { color: var(--muted-color); }
.dg-status-state--unknown { color: var(--muted-color); }
@media (max-width: 480px) { .dg-status-detail { padding-left: 0; } }

/* heatmap (intensity density grid) */
.dg-heatmap { margin: 1rem 0; }
.dg-heatmap-title { font-weight: 600; color: var(--title-color); margin-bottom: 0.5rem; }
.dg-heatmap-table { border-collapse: separate; border-spacing: 2px; width: auto; min-width: max-content; margin: 0 auto; }
.dg-heatmap-table th { font-size: 0.75rem; font-weight: 600; color: var(--muted-color); padding: 0.2rem 0.4rem; text-align: center; }
.dg-heatmap-table th[scope="row"] { text-align: right; white-space: nowrap; }
.dg-heatmap-corner { border: 0 !important; }
.dg-heatmap-cell { min-width: 2rem; height: 1.6rem; padding: 0.2rem 0.4rem; text-align: center; font-size: 0.8rem; font-variant-numeric: tabular-nums; border-radius: 3px; color: var(--text-color); }
.dg-heatmap-cell--l0 { background: var(--card-bg); color: var(--muted-color); }
.dg-heatmap-cell--l1 { background: #dbeafe; }
.dg-heatmap-cell--l2 { background: #93c5fd; }
.dg-heatmap-cell--l3 { background: #60a5fa; }
.dg-heatmap-cell--l4 { background: #3b82f6; color: #fff; }
.dg-heatmap-cell--l5 { background: #1d4ed8; color: #fff; }
.dg-heatmap-legend { display: flex; align-items: center; gap: 0.2rem; justify-content: center; margin-top: 0.5rem; font-size: 0.75rem; color: var(--muted-color); }
.dg-heatmap-legend .dg-heatmap-cell { width: 1rem; height: 1rem; min-width: 0; }
.dg-heatmap-legend-label { margin: 0 0.3rem; }

/* progress (labelled completion bar) */
.dg-progress { margin: 0.75rem 0; max-width: 30rem; }
.dg-progress-label { font-size: 0.85rem; font-weight: 600; color: var(--title-color); margin-bottom: 0.25rem; }
.dg-progress-track { height: 0.6rem; border-radius: 999px; background: var(--page-bg); border: 1px solid var(--border-color); overflow: hidden; }
.dg-progress-fill { display: block; height: 100%; border-radius: 999px; }
.dg-progress-fill--primary { background: var(--accent); }
.dg-progress-fill--success { background: #16a34a; }
.dg-progress-fill--warning { background: #d97706; }
.dg-progress-fill--danger { background: #dc2626; }
.dg-progress-value { margin-top: 0.25rem; font-size: 0.85rem; font-variant-numeric: tabular-nums; color: var(--muted-color); }

/* terminal (console transcript) */
.dg-terminal { background: #0b1220; border: 1px solid #1f2a44; border-radius: var(--radius); overflow: hidden; margin: 1rem 0; }
.dg-terminal-header { background: #0e1729; border-bottom: 1px solid #1f2a44; padding: 0.4rem 0.9rem; font-size: 0.8rem; color: #8b9cc4; display: flex; align-items: center; gap: 0.6rem; }
.dg-terminal-title { font-weight: 600; color: #e5edff; }
.dg-terminal-body { margin: 0; padding: 0.9rem 1rem; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.86rem; line-height: 1.6; color: #c7d3f2; white-space: pre; }
.dg-terminal-line { display: block; }
.dg-terminal-line--cmd { color: #e5edff; font-weight: 600; }
.dg-terminal-line--info { color: #c7d3f2; }
.dg-tl-tag { display: inline-block; min-width: 3.4em; font-weight: 700; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.04em; }
.dg-terminal-line--ok .dg-tl-tag { color: #4ade80; }
.dg-terminal-line--warn .dg-tl-tag { color: #fbbf24; }
.dg-terminal-line--err .dg-tl-tag { color: #f87171; }

/* gauge (semicircular arc readout) */
.dg-gauge { margin: 1rem 0; max-width: 22rem; }
.dg-gauge-title { font-size: 0.85rem; font-weight: 600; color: var(--title-color); margin-bottom: 0.4rem; }
.dg-gauge-main { display: flex; align-items: center; gap: 1rem; }
.dg-gauge-svg { width: 9.5rem; height: auto; flex: none; display: block; }
.dg-gauge-track { fill: none; stroke: var(--border-color); stroke-width: 8; stroke-linecap: round; }
.dg-gauge-arc { fill: none; stroke-width: 8; stroke-linecap: round; }
.dg-gauge-arc--primary { stroke: var(--accent); }
.dg-gauge-arc--success { stroke: #16a34a; }
.dg-gauge-arc--warning { stroke: #d97706; }
.dg-gauge-arc--danger { stroke: #dc2626; }
.dg-gauge-readout { display: flex; flex-direction: column; gap: 0.15rem; }
.dg-gauge-value { font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--title-color); line-height: 1.1; }
.dg-gauge-range { font-size: 0.8rem; color: var(--muted-color); font-variant-numeric: tabular-nums; }
.dg-gauge-cap { margin-top: 0.5rem; }

/* breadcrumbs (trail of in-page links ending at the current page) */
.dg-breadcrumbs { margin: 1rem 0; }
.dg-breadcrumbs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; font-size: 0.85rem; }
.dg-breadcrumbs-item { display: inline-flex; align-items: center; }
.dg-breadcrumbs-item + .dg-breadcrumbs-item::before { content: "/"; margin-right: 0.35rem; color: var(--muted-color); }
.dg-breadcrumbs-text { color: var(--muted-color); }
.dg-breadcrumbs-link { color: var(--accent); text-decoration: none; }
.dg-breadcrumbs-link:hover, .dg-breadcrumbs-link:focus-visible { text-decoration: underline; }
.dg-breadcrumbs-current { color: var(--title-color); font-weight: 600; }

/* images */
.dg-image { margin: 0; text-align: center; }
.dg-image img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
.dg-image-caption { margin-top: 0.6rem; font-size: 0.85rem; color: var(--muted-color); }
.dg-svg { width: 100%; height: auto; display: block; }
.dg-svg-pie { max-width: 12rem; margin: 0 auto; }
.dg-axis { fill: var(--muted-color); font-size: 10px; }
.dg-axis-x { dominant-baseline: hanging; }
.dg-label { font-size: 10px; fill: var(--muted-color); }
.dg-grid-v, .dg-grid-h { stroke: var(--border-color); stroke-width: 1; opacity: 0.55; }
.dg-legend-wrap { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin-top: 0.75rem; font-size: 0.85rem; }
.dg-legend { display: inline-flex; align-items: center; gap: 0.35rem; }
.dg-legend-swatch { width: 0.7rem; height: 0.7rem; border-radius: 2px; display: inline-block; }
.dg-pie-flex { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.dg-error { color: #b91c1c; border: 1px solid #fca5a5; background: #fef2f2; padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.85rem; }
`;

module.exports = { BASE_CSS };
