#!/usr/bin/env node
// Check a generated HTML file for basic accessibility invariants:
// - document <html lang>
// - single <main id="main"> landmark
// - nav landmark with aria-label
// - skip link
// - no images without alt
// - every <figure role="img"> has an aria-label (or desc) when it carries
//   a chart role
// - heading levels do not skip more than one level
// - contrast note: report tokens to the user
//
// Usage:
//   node scripts/a11y-check.mjs dist/chart.html

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/a11y-check.mjs <html>');
  process.exit(2);
}

const html = readFileSync(resolve(file), 'utf8');
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

// 6. chart figures with role="img" need aria-label
const figs = html.match(/<div class="dg-figure dg-chart"[^>]*>/g) || [];
for (const tag of figs) {
  if (/\brole="img"/.test(tag) && !/\bdata-chart-caption="[^"]+"/.test(tag) && !/\baria-label="/.test(tag) && !/\baria-labelledby=/.test(tag)) {
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

// 8. contrast note: report the default/theme page-bg vs text-color (best-effort)
const bg = /\-\-page-bg: (#[0-9a-fA-F]{3,8}|[a-z]+)/.exec(html);
const tc = /\-\-text-color: (#[0-9a-fA-F]{3,8}|[a-z]+)/.exec(html);
warnings.push(
  `contrast note: page-bg=${bg ? bg[1] : 'default'} text-color=${tc ? tc[1] : 'default'} — verify AA (4.5:1) for body text; tokens are tailwind-like and configurable via theme:`
);

// 9. no external resources: offline requirement is about *fetched assets*
//    (scripts/styles/fonts), not plain text links in page content.
if (/<script[^>]*\bsrc=|<link[^>]*\bhref=|<img\b[^>]*\bsrc=|<source\b[^>]*\bsrc=/i.test(html)) {
  warnings.push('found external script/style/img resource (offline requirement)');
}

if (problems.length) {
  console.error(`[a11y-check] FAIL (${file})`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exitCode = 1;
} else {
  console.log(`[a11y-check] OK (${file})`);
}
warnings.forEach((w) => console.log('  note: ' + w));
