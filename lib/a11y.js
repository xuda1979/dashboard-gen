// Basic accessibility invariants for a generated HTML page. Shared by the
// standalone `scripts/a11y-check.mjs` lint tool and `dg build --check`, so a
// single implementation backs both the README-documented script and the
// build-loop gate.
//
// Checks:
// - document <html lang>
// - single <main id="main"> landmark
// - nav landmark with aria-label
// - skip link
// - no images without alt
// - every <figure role="img"> has an aria-label (or desc) when it carries
//   a chart role
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

  // 3. nav with aria-label
  if (!/<nav[^>]*aria-label="/.test(html)) {
    problems.push('no <nav> with aria-label');
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

  // 6. chart figures with role="img" need an accessible name. The renderer
  //    always emits aria-label (caption || title); data-chart-caption was a
  //    stale attribute that the renderer never emitted, so only aria labels are
  //    checked here.
  const figs = html.match(/<div class="dg-figure dg-chart"[^>]*>/g) || [];
  for (const tag of figs) {
    if (/\brole="img"/.test(tag) && !/\baria-label="/.test(tag) && !/\baria-labelledby=/.test(tag)) {
      problems.push(`chart figure missing accessible name: ${tag.slice(0, 90)}`);
    }
  }
  warnings.push(`charts with role="img": ${figs.length}`);

  // 7. heading levels: shouldn't skip from h2 to h4 without h3 etc.
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

  // 8. contrast: compute the actual WCAG 2.x contrast ratio from the theme
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

  // 9. no external resources: offline requirement is about *fetched assets*
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
