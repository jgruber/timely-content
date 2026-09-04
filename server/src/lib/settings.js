import { JsonStore } from './jsonstore.js';
import { SETTINGS_FILE } from './paths.js';
import { isValidMode, isValidAccent, DEFAULT_PREFS } from './appearance.js';

export const DEFAULT_SETTINGS = {
  version: 1,
  // Name shown in the header, on the sign-in screen and in the browser tab.
  siteName: 'Timely Content',
  // Appearance used wherever there is no signed-in user to have a preference:
  // the sign-in screen, the first-run setup, and every shared QR page.
  defaultMode: DEFAULT_PREFS.mode,
  defaultAccent: DEFAULT_PREFS.accent,
  // Base URL that QR codes point at, e.g. https://share.example.com.
  // Set this to whatever the TLS-terminating reverse proxy publishes.
  publicUrl: '',
  // When true, requests whose Host header does not match publicUrl are refused.
  enforceHost: false,
  maxUploadMb: 25,
  sessionHours: 12,
};

export const settingsStore = new JsonStore(SETTINGS_FILE, { ...DEFAULT_SETTINGS });

export function getSettings() {
  return settingsStore.read((s) => ({ ...DEFAULT_SETTINGS, ...s }));
}

export function normaliseSettings(input, current) {
  const next = { ...current };
  const errors = [];

  if (input.publicUrl !== undefined) {
    const raw = String(input.publicUrl || '').trim().replace(/\/+$/, '');
    if (raw === '') {
      next.publicUrl = '';
    } else {
      let url;
      try {
        url = new URL(raw);
      } catch {
        errors.push('Public URL must be a full URL, e.g. https://share.example.com');
      }
      if (url) {
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errors.push('Public URL must use http or https.');
        } else {
          next.publicUrl = raw;
        }
      }
    }
  }

  if (input.enforceHost !== undefined) next.enforceHost = !!input.enforceHost;

  if (input.siteName !== undefined) {
    const name = String(input.siteName || '').trim().slice(0, 60);
    if (!name) errors.push('Site name cannot be empty.');
    else next.siteName = name;
  }

  if (input.defaultMode !== undefined) {
    if (!isValidMode(input.defaultMode)) errors.push('Unknown default appearance mode.');
    else next.defaultMode = input.defaultMode;
  }

  if (input.defaultAccent !== undefined) {
    if (!isValidAccent(input.defaultAccent)) errors.push('Unknown default colour theme.');
    else next.defaultAccent = input.defaultAccent;
  }

  if (input.maxUploadMb !== undefined) {
    const mb = Number(input.maxUploadMb);
    if (!Number.isFinite(mb) || mb < 1 || mb > 2048) errors.push('Max upload size must be between 1 and 2048 MB.');
    else next.maxUploadMb = Math.floor(mb);
  }

  if (input.sessionHours !== undefined) {
    const hours = Number(input.sessionHours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) errors.push('Session length must be between 1 and 720 hours.');
    else next.sessionHours = Math.floor(hours);
  }

  if (next.enforceHost && !next.publicUrl) {
    errors.push('Hostname validation requires a public URL to validate against.');
  }

  return { next, errors };
}

/** Absolute URL a QR code should encode for a given share token. */
export function shareUrl(settings, token, req) {
  const base = settings.publicUrl || fallbackBase(req);
  return `${base.replace(/\/+$/, '')}/c/${token}`;
}

function fallbackBase(req) {
  if (!req) return '';
  const proto = req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}
