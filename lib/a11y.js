// Basic accessibility invariants for a generated HTML page. Shared by the
// standalone `scripts/a11y-check.mjs` lint tool and `dg build --check`, so a
// single implementation backs both the README-documented script and the
// build-loop gate.
//
// Checks:
// - document <html lang>
// - single <main id="main"> landmark
// - every nav landmark carries an aria-label (page nav, toc, breadcrumbs)
// - no duplicate id attributes (skip-link #main, section anchors, tab radios,
//   aria-labelledby targets all resolve to exactly one element)
// - skip link
// - no images without alt
// - every element with role="img" has an accessible name (aria-label or
//   aria-labelledby); charts, stat values and progress bars all expose
//   themselves as role="img"
// - every <th> carries a scope attribute (scope="col" header / scope="row"
//   row header); tables are rendered semantically, so a bare <th> is a defect
// - heading levels do not skip more than one level
// - contrast: measure the theme token palettes (light + dark) against the
//   WCAG AA body-text threshold (4.5:1)

function checkA11y(html) {
  const problems = [];
  const warnings = [];

  function stripTags(s) {
    return s.replace(/<[^>]*>/g, '');
  }

  // 1. html lang
  if (!/<html[^>]*\blang=/i.test(html)) {
    problems.push('no <html lang> attribute');
  }

  // 2. single main landmark with id
  const mains = html.match(/<main\b[^>]*>/g) || [];
  if (mains.length !== 1) {
    problems.push(`expected exactly one <main>, got ${mains.length}`);
  } else if (!/<main[^>]*id="main"/.test(html)) {
    problems.push('<main> missing id="main"');
  }

  // 3. every nav landmark needs an aria-label. A generated page can carry
  //    several nav landmarks — the auto nav ("Primary"), a toc, breadcrumbs —
  //    and WCAG requires each region to be distinguishable by name, so a bare
  //    <nav> anywhere is a defect. A page with no nav at all also fails: the
  //    navigation landmark is a generated invariant, like the single <main>.
  const navs = html.match(/<nav\b[^>]*>/g) || [];
  if (navs.length === 0) {
    problems.push('no <nav> landmark');
  } else {
    for (const tag of navs) {
      if (!/\baria-label=/.test(tag)) {
        problems.push(`<nav> without aria-label: ${tag.slice(0, 60)}`);
      }
    }
  }

  // 4. skip link
  if (!/class="skip-link"[^>]*href="#main"/.test(html)) {
    problems.push('missing skip link to #main');
  }

  // 5. images must have alt (we don't emit <img> in core components, but check)
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  for (const tag of imgs) {
    if (!/\balt=/.test(tag)) {
      problems.push(`<img> missing alt: ${stripTags(tag).slice(0, 60)}`);
    }
  }

  // 6. every element with role="img" needs an accessible name. The renderers
  //    always emit aria-label: chart figures (caption || title), stat values
  //    (label) and stat progress bars (progressLabel or N%); data-chart-caption
  //    was a stale attribute the renderer never emitted, so only aria labels
  //    are checked here.
  const roleImgs = html.match(/<[a-z][^>]*\brole="img"[^>]*>/gi) || [];
  for (const tag of roleImgs) {
    if (/\baria-label="/.test(tag) || /\baria-labelledby=/.test(tag)) continue;
    problems.push(`role="img" without an accessible name: ${tag.slice(0, 90)}`);
  }
  warnings.push(`elements with role="img": ${roleImgs.length}`);

  // 7. every <th> carries a scope attribute. The README documents semantic
  //    tables as a generated invariant: header cells are scope="col" and
  //    row-label cells are scope="row" (stat lists, first cell without a data
  //    header). A bare <th> with no scope breaks that contract for screen
  //    readers, so it is an error — the no-data note renders as <td> and is
  //    not affected.
  const ths = html.match(/<th\b[^>]*>/g) || [];
  for (const tag of ths) {
    if (!/\bscope=/.test(tag)) {
      problems.push(`<th> without scope: ${tag.slice(0, 60)}`);
    }
  }
  warnings.push(`table headers: ${ths.length}`);

  // 8. every id attribute is unique across the document. The generated page
  //    depends on ids resolving to exactly one element — the skip link's #main,
  //    the section s-<slug> anchors the auto nav / toc / breadcrumbs link, the
  //    tab radio inputs their labels point at, and aria-labelledby targets on
  //    role="img" figures. Script and style bodies are stripped first: the
  //    inline chart runtime is JS (a CSS #selector or string "id=" there is not
  //    an element id).
  const styleLess = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const noScripts = styleLess.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const seenIds = new Set();
  for (const m of noScripts.matchAll(/\bid="([^"]+)"/g)) {
    const id = m[1];
    if (seenIds.has(id)) {
      problems.push(`duplicate id="${id}"`);
    }
    seenIds.add(id);
  }
  warnings.push(`elements with id: ${seenIds.size}`);

  // 9. heading levels: shouldn't skip from h2 to h4 without h3 etc.
  const levels = [];
  for (const m of html.matchAll(/<h([1-6])\b/g)) {
    levels.push(Number(m[1]));
  }
  let last = null;
  for (const l of levels) {
    if (last !== null && l - last > 1) {
      warnings.push(`heading level skip from h${last} to h${l}`);
    }
    last = l;
  }
  warnings.push(`heading levels used: ${[...new Set(levels)].sort().join(', ') || 'none'}`);

  // 10. contrast: compute the actual WCAG 2.x contrast ratio from the theme
  //    tokens (light palette in :root, dark palette in the prefers-color-scheme
  //    media block). Each measured palette is checked against the AA body-text
  //    threshold (4.5:1); a palette with a non-hex token falls back to a note.
  function rgbLuminance(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(a, b) {
    const la = rgbLuminance(a);
    const lb = rgbLuminance(b);
    if (la === null || lb === null) return null;
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }

  function checkPalette(label, pageBg, textColor) {
    if (!pageBg || !textColor) return;
    const ratio = contrastRatio(pageBg, textColor);
    if (ratio === null) {
      warnings.push(
        `contrast (${label}): tokens not hex (page-bg=${pageBg} text-color=${textColor}) — verify AA (4.5:1)`
      );
    } else if (ratio < 4.5) {
      problems.push(
        `contrast (${label}): ${ratio.toFixed(2)}:1 below AA 4.5:1 (page-bg=${pageBg} text-color=${textColor}; configurable via theme:)`
      );
    } else {
      warnings.push(
        `contrast (${label}): ${ratio.toFixed(2)}:1 (page-bg=${pageBg} text-color=${textColor}) — passes AA (4.5:1)`
      );
    }
  }

  const bgs = [...html.matchAll(/\-\-page-bg: (#[0-9a-fA-F]{3,8}|[a-z]+)/g)].map((m) => m[1]);
  const tcs = [...html.matchAll(/\-\-text-color: (#[0-9a-fA-F]{3,8}|[a-z]+)/g)].map((m) => m[1]);
  if (bgs.length) checkPalette('light', bgs[0], tcs[0]);
  if (bgs.length > 1 && tcs.length > 1) checkPalette('dark', bgs[1], tcs[1]);

  // 11. no external resources: offline requirement is about *fetched assets*
  //    (scripts/styles/fonts), not plain text links in page content. Data-URI
  //    images are inlined at build time, so only non-data img src counts.
  if (
    /<script[^>]*\bsrc=|<link[^>]*\bhref=|<source\b[^>]*\bsrc=/i.test(html) ||
    /<img\b[^>]*\bsrc=(?!["']?data:)/i.test(html)
  ) {
    warnings.push('found external script/style/img resource (offline requirement)');
  }

  return { problems, warnings };
}

module.exports = { checkA11y };
