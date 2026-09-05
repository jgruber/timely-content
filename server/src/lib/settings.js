import { JsonStore } from './jsonstore.js';
import { SETTINGS_FILE } from './paths.js';
import {
  SCHEMA, resolve, defaults, getPath, setPath, schemaFor, publicValues, missingRequired,
} from './config.js';

export const settingsStore = new JsonStore(SETTINGS_FILE, { version: 1, ...defaults() });

/** Effective settings: environment first, then settings.json, then defaults. */
export async function getSettings() {
  const stored = await settingsStore.read((data) => structuredClone(data));
  return resolve(stored).values;
}

/** Effective settings plus which keys the environment is managing. */
export async function getSettingsDetail() {
  const stored = await settingsStore.read((data) => structuredClone(data));
  const { values, envManaged } = resolve(stored);
  return { values, envManaged, publicValues: publicValues(values) };
}

/**
 * Apply an admin edit.
 *
 * Keys supplied by the environment are refused rather than silently dropped:
 * saving them would look like it worked until the next restart put the
 * environment's value back.
 */
export async function saveSettings(input) {
  const stored = await settingsStore.read((data) => structuredClone(data));
  const { envManaged } = resolve(stored);

  const errors = [];
  const rejected = [];
  const next = structuredClone(stored);

  for (const s of SCHEMA) {
    const incoming = getPath(input, s.key);
    if (incoming === undefined) continue;

    // A secret comes back from the browser as the placeholder when untouched.
    if (s.secret && incoming === '__set__') continue;

    if (envManaged.includes(s.key)) {
      rejected.push(s.env);
      continue;
    }

    try {
      const parsed = s.parse(incoming);
      s.check?.(parsed);
      setPath(next, s.key, parsed);
    } catch (err) {
      errors.push(`${s.label} ${err.message}.`);
    }
  }

  if (errors.length) return { errors };

  // Enforce cross-field rules against the effective result, not the raw input.
  const effective = resolve(next).values;
  if (effective.enforceHost && !effective.publicUrl) {
    return { errors: ['Hostname validation requires a public URL to validate against.'] };
  }
  const missing = missingRequired(effective);
  if (missing.length) {
    return {
      errors: [`Cannot save: ${missing.map((m) => m.label).join(', ')} `
        + `${missing.length === 1 ? 'is' : 'are'} required while password reset is enabled.`],
    };
  }

  await settingsStore.write((data) => {
    for (const s of SCHEMA) setPath(data, s.key, getPath(next, s.key));
    data.version = 1;
  });

  return { values: effective, rejected };
}

/** Absolute URL a QR code should encode for a given share token. */
export function shareUrl(settings, token, req) {
  const base = settings.publicUrl || fallbackBase(req);
  return `${base.replace(/\/+$/, '')}/c/${token}`;
}

/**
 * Absolute URL for a password-reset link.
 *
 * Only ever built from the configured public URL. Deriving it from the request
 * Host header would let an attacker send a forged Host and have the victim's
 * reset link point at a server they control -- which is why PUBLIC_URL is a
 * required setting whenever password reset is enabled.
 */
export function resetUrl(settings, token) {
  if (!settings.publicUrl) return null;
  return `${settings.publicUrl.replace(/\/+$/, '')}/reset/${token}`;
}

function fallbackBase(req) {
  if (!req) return '';
  return `${req.protocol || 'http'}://${req.get('host')}`;
}

export { schemaFor, SCHEMA };
