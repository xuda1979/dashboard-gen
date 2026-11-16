// Default theme tokens (Tailwind-like). Overridable per-page via `theme:` in the DSL.
// Dark values are emitted into a `prefers-color-scheme: dark` block.
const THEME = {
  titleColor: '#1f2328',
  textColor: '#3a3f46',
  mutedColor: '#5f6772',
  pageBg: '#f6f8fa',
  cardBg: '#ffffff',
  accent: '#2563eb',
  borderColor: '#e5e7eb',
  radius: '8px',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  dark: {
    titleColor: '#f3f4f6',
    textColor: '#d1d5db',
    mutedColor: '#9ca3af',
    pageBg: '#111827',
    cardBg: '#1f2937',
    borderColor: '#374151',
  },
};

module.exports = { THEME };
