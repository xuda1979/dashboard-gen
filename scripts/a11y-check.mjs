#!/usr/bin/env node
// Check a generated HTML file for basic accessibility invariants. The checks
// themselves live in lib/a11y.js (shared with `dg build --check`); this script
// is the standalone CLI documented in the README:
//
//   node scripts/a11y-check.mjs dist/chart.html

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { checkA11y } = require('../lib/a11y.js');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/a11y-check.mjs <html>');
  process.exit(2);
}

let html;
try {
  html = readFileSync(resolve(file), 'utf8');
} catch (err) {
  console.error(`[a11y-check] cannot read ${file}: ${err.message}`);
  process.exit(1);
}
const { problems, warnings } = checkA11y(html);

if (problems.length) {
  console.error(`[a11y-check] FAIL (${file})`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exitCode = 1;
} else {
  console.log(`[a11y-check] OK (${file})`);
}
warnings.forEach((w) => console.log('  note: ' + w));
