// Assemble the full HTML from a parsed doc. Separates concerns so tests can
// assert on the DOM structure of generated files.

const { parseDsl, validatePage } = require('./loader');
const { renderPage } = require('./render');

function renderHtml(doc, opts) {
  validatePage(doc);
  return renderPage(doc, opts || {});
}

function buildFromSource(source, filename, opts) {
  const { data } = parseDsl(source, filename);
  return renderHtml(data, opts);
}

module.exports = { renderHtml, buildFromSource };
