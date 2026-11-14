// User-facing error types. Invalid DSL produces rich, line-anchored messages.

class DashboardError extends Error {
  constructor(message, path) {
    super(message);
    this.name = this.constructor.name;
    this.path = path || '';
  }
  format() {
    const where = this.path ? `\n  at: ${this.path}` : '';
    return `${this.message}${where}`;
  }
}

// Bad DSL structure, wrong component type, missing field, etc.
class StyleError extends DashboardError {}

// Bad `data: fetch(...)` URL or unsupported scheme.
class FetchSpecError extends DashboardError {}

// Cross-file problem: referenced data file missing / unreadable.
class DataFileError extends DashboardError {}

// Parser-level YAML/JSON parse failure (line/position included by parser).
class ParseError extends DashboardError {}

// Chart type or chart data shape not supported yet.
class NotImplementedError extends DashboardError {}

module.exports = {
  DashboardError,
  StyleError,
  FetchSpecError,
  DataFileError,
  ParseError,
  NotImplementedError,
};
