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
@media (max-width: 760px) { .dg-sidebar-wrap { grid-template-columns: 1fr; } .dg-sidebar { position: static; } }

/* cards */
.dg-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
.dg-card--primary { border-left: 4px solid var(--accent); }
.dg-card--success { border-left: 4px solid #16a34a; }
.dg-card--danger { border-left: 4px solid #dc2626; }
.dg-card--warning { border-left: 4px solid #d97706; }
.dg-card-title { color: var(--title-color); font-weight: 600; margin: 0; }

/* tables */
.dg-scroll { overflow-x: auto; }
.dg-table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.dg-table th { text-align: left; padding: 0.55rem 0.75rem; border-bottom: 2px solid var(--border-color); color: var(--title-color); }
.dg-table td, .dg-table th[scope="row"] { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border-color); color: var(--text-color); font-weight: normal; }
.dg-table tr:hover td, .dg-table tr:hover th[scope="row"] { background: var(--page-bg); }

/* charts */
.dg-figure { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1rem; }
.dg-chart-title { font-weight: 600; color: var(--title-color); margin-bottom: 0.25rem; }
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
