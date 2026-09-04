export const ACCENTS = [
  { id: 'indigo', label: 'Indigo', swatch: '#4f46e5' },
  { id: 'teal', label: 'Teal', swatch: '#0d9488' },
  { id: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { id: 'rose', label: 'Rose', swatch: '#e11d48' },
  { id: 'amber', label: 'Amber', swatch: '#b45309' },
  { id: 'emerald', label: 'Emerald', swatch: '#059669' },
  { id: 'sky', label: 'Sky', swatch: '#0284c7' },
];

export const MODES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

// The effective appearance is mirrored here so the inline script in index.html
// can paint the correct theme before React loads. It is a cache, never the
// source of truth -- that is the signed-in user's profile, or the site default.
const STORAGE_KEY = 'tc.prefs';
export const DEFAULT_PREFS = { mode: 'system', accent: 'indigo' };

export function normalisePrefs(prefs) {
  const merged = { ...DEFAULT_PREFS, ...(prefs || {}) };
  return {
    mode: MODES.some((m) => m.id === merged.mode) ? merged.mode : DEFAULT_PREFS.mode,
    accent: ACCENTS.some((a) => a.id === merged.accent) ? merged.accent : DEFAULT_PREFS.accent,
  };
}

export function readStoredPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function storePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* private mode; the server copy is authoritative anyway */ }
}

export function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function isDarkMode(mode) {
  return mode === 'dark' || (mode === 'system' && prefersDark());
}

/** Push the theme onto <html> so CSS custom properties resolve correctly. */
export function applyPrefs(prefs) {
  const merged = normalisePrefs(prefs);
  document.documentElement.classList.toggle('dark', isDarkMode(merged.mode));
  document.documentElement.dataset.accent = merged.accent;
  storePrefs(merged);
}
