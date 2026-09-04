/**
 * Appearance vocabulary shared by user preferences and the site-wide default.
 * Kept in its own module so settings and users can both reference it without
 * importing each other.
 */
export const ACCENTS = ['indigo', 'teal', 'violet', 'rose', 'amber', 'emerald', 'sky'];
export const MODES = ['system', 'light', 'dark'];

export const DEFAULT_PREFS = { mode: 'system', accent: 'indigo' };

export function isValidMode(mode) {
  return MODES.includes(mode);
}

export function isValidAccent(accent) {
  return ACCENTS.includes(accent);
}
