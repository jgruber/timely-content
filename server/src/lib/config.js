import { ACCENTS, MODES, DEFAULT_PREFS } from './appearance.js';

/**
 * Declarative settings schema.
 *
 * Every setting resolves from three sources, highest priority first:
 *
 *   1. an environment variable  -- for containerised deployments
 *   2. settings.json            -- what the admin screen writes
 *   3. the built-in default
 *
 * A setting supplied by the environment is authoritative: the admin screen
 * shows it read-only rather than letting someone save a value that the next
 * restart would silently discard.
 */

const parsers = {
  string: (raw) => String(raw),

  int: (raw) => {
    const n = Number(String(raw).trim());
    if (!Number.isInteger(n)) throw new Error('must be a whole number');
    return n;
  },

  bool: (raw) => {
    const v = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
    throw new Error('must be true or false');
  },

  url: (raw) => {
    const v = String(raw).trim().replace(/\/+$/, '');
    if (v === '') return '';
    let parsed;
    try {
      parsed = new URL(v);
    } catch {
      throw new Error('must be a full URL, for example https://share.example.com');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('must use http or https');
    }
    return v;
  },

  email: (raw) => {
    const v = String(raw).trim();
    if (v === '') return '';
    // Deliberately loose: enough to catch a typo, not an RFC implementation.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('must be an email address');
    return v;
  },
};

function enumOf(values) {
  return (raw) => {
    const v = String(raw).trim();
    if (!values.includes(v)) throw new Error(`must be one of: ${values.join(', ')}`);
    return v;
  };
}

function range(min, max) {
  return (value) => {
    if (value < min || value > max) throw new Error(`must be between ${min} and ${max}`);
  };
}

/** Password reset needs a way to send mail and a trustworthy link to put in it. */
const whenResetEnabled = (values) => values.passwordResetEnabled;

export const SCHEMA = [
  {
    key: 'siteName', env: 'SITE_NAME', parse: parsers.string, def: 'Timely Content',
    label: 'Site name',
    help: 'Shown in the header, on the sign-in screen and in the browser tab.',
    check: (v) => { if (!v.trim()) throw new Error('cannot be empty'); },
  },
  {
    key: 'defaultMode', env: 'DEFAULT_MODE', parse: enumOf(MODES), def: DEFAULT_PREFS.mode,
    label: 'Default appearance mode',
    help: 'light, dark or system. Used for the sign-in screen and shared QR pages.',
  },
  {
    key: 'defaultAccent', env: 'DEFAULT_ACCENT', parse: enumOf(ACCENTS), def: DEFAULT_PREFS.accent,
    label: 'Default colour theme',
    help: `One of: ${ACCENTS.join(', ')}.`,
  },
  {
    key: 'publicUrl', env: 'PUBLIC_URL', parse: parsers.url, def: '',
    label: 'Public URL',
    help: 'The address your reverse proxy publishes, e.g. https://share.example.com. '
      + 'QR codes and password-reset links are built from this.',
    requiredWhen: whenResetEnabled,
    requiredBecause: 'password-reset links must never be built from the request Host header, '
      + 'which an attacker can forge to redirect a reset link to themselves',
  },
  {
    key: 'enforceHost', env: 'ENFORCE_HOST', parse: parsers.bool, def: false,
    label: 'Validate the request hostname',
    help: 'true to refuse requests whose Host header does not match the public URL.',
  },
  {
    key: 'maxUploadMb', env: 'MAX_UPLOAD_MB', parse: parsers.int, def: 25,
    label: 'Maximum upload size (MB)', help: 'Between 1 and 2048.',
    check: range(1, 2048),
  },
  {
    key: 'maxPackageMb', env: 'MAX_PACKAGE_MB', parse: parsers.int, def: 500,
    label: 'Maximum total size per upload (MB)',
    help: 'Combined size of all files in one upload. Between 1 and 20480.',
    check: range(1, 20480),
  },
  {
    key: 'maxFilesPerPackage', env: 'MAX_FILES_PER_PACKAGE', parse: parsers.int, def: 100,
    label: 'Maximum files per upload', help: 'Between 1 and 1000.',
    check: range(1, 1000),
  },
  {
    key: 'sessionHours', env: 'SESSION_HOURS', parse: parsers.int, def: 12,
    label: 'Session length (hours)', help: 'Between 1 and 720.',
    check: range(1, 720),
  },

  // ---- Password reset -----------------------------------------------------
  {
    key: 'passwordResetEnabled', env: 'PASSWORD_RESET_ENABLED', parse: parsers.bool, def: true,
    label: 'Password reset by email',
    help: 'true to let users reset a forgotten password by email. Set false to run '
      + 'without an SMTP server; the "Forgot password" link is then hidden.',
  },
  {
    key: 'resetTokenMinutes', env: 'RESET_TOKEN_MINUTES', parse: parsers.int, def: 30,
    label: 'Reset link lifetime (minutes)', help: 'Between 5 and 1440.',
    check: range(5, 1440),
  },

  // ---- SMTP ---------------------------------------------------------------
  {
    key: 'smtp.host', env: 'SMTP_HOST', parse: parsers.string, def: '',
    label: 'SMTP host', help: 'Hostname of your mail relay, e.g. smtp.example.com.',
    requiredWhen: whenResetEnabled,
    requiredBecause: 'there is no way to send a reset email without a mail server',
  },
  {
    key: 'smtp.port', env: 'SMTP_PORT', parse: parsers.int, def: 587,
    label: 'SMTP port', help: 'Usually 587 (STARTTLS) or 465 (implicit TLS).',
    check: range(1, 65535),
  },
  {
    key: 'smtp.secure', env: 'SMTP_SECURE', parse: parsers.bool, def: false,
    label: 'SMTP implicit TLS', help: 'true for port 465, false for 587.',
  },
  {
    key: 'smtp.user', env: 'SMTP_USER', parse: parsers.string, def: '',
    label: 'SMTP username', help: 'Leave empty for a relay that does not require authentication.',
  },
  {
    key: 'smtp.pass', env: 'SMTP_PASS', parse: parsers.string, def: '', secret: true,
    label: 'SMTP password',
    help: 'Prefer setting this in the environment so it stays out of settings.json.',
  },
  {
    key: 'smtp.from', env: 'SMTP_FROM', parse: parsers.email, def: '',
    label: 'From address', help: 'The envelope sender, e.g. no-reply@example.com.',
    requiredWhen: whenResetEnabled,
    requiredBecause: 'mail servers reject a message with no sender address',
  },
  {
    key: 'smtp.fromName', env: 'SMTP_FROM_NAME', parse: parsers.string, def: '',
    label: 'From name', help: 'Display name on outgoing mail. Defaults to the site name.',
  },
];

const BY_KEY = new Map(SCHEMA.map((s) => [s.key, s]));

export function getPath(obj, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

export function setPath(obj, key, value) {
  const parts = key.split('.');
  const last = parts.pop();
  let node = obj;
  for (const part of parts) {
    if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
    node = node[part];
  }
  node[last] = value;
}

export function defaults() {
  const out = {};
  for (const s of SCHEMA) setPath(out, s.key, s.def);
  return out;
}

/**
 * Merge stored settings with the environment.
 *
 * Returns the effective values, the set of keys the environment is managing,
 * and any values that were rejected. A bad stored value falls back to the
 * default; a bad environment value is an error worth failing on.
 */
export function resolve(stored = {}, env = process.env) {
  const values = {};
  const envManaged = [];
  const errors = [];

  for (const s of SCHEMA) {
    const raw = env[s.env];
    const hasEnv = raw !== undefined && String(raw).trim() !== '';

    if (hasEnv) {
      try {
        const parsed = s.parse(raw);
        s.check?.(parsed);
        setPath(values, s.key, parsed);
        envManaged.push(s.key);
        continue;
      } catch (err) {
        errors.push({ key: s.key, env: s.env, source: 'environment', message: err.message });
        setPath(values, s.key, s.def);
        continue;
      }
    }

    const storedValue = getPath(stored, s.key);
    if (storedValue !== undefined && storedValue !== null) {
      try {
        const parsed = s.parse(storedValue);
        s.check?.(parsed);
        setPath(values, s.key, parsed);
        continue;
      } catch {
        // A malformed stored value is not worth refusing to boot over.
        setPath(values, s.key, s.def);
        continue;
      }
    }

    setPath(values, s.key, s.def);
  }

  // A blank From name reads better as the site name than as an empty string.
  if (!values.smtp.fromName) values.smtp.fromName = values.siteName;

  return { values, envManaged, errors };
}

/** Settings that must have a value before the service will start. */
export function missingRequired(values) {
  const missing = [];
  for (const s of SCHEMA) {
    if (!s.requiredWhen || !s.requiredWhen(values)) continue;
    const v = getPath(values, s.key);
    if (v === undefined || v === null || String(v).trim() === '') missing.push(s);
  }
  return missing;
}

export function schemaFor(key) {
  return BY_KEY.get(key);
}

/** Keys safe to send to a browser -- everything except secrets. */
export function publicValues(values) {
  const out = JSON.parse(JSON.stringify(values));
  for (const s of SCHEMA) {
    if (s.secret) setPath(out, s.key, getPath(values, s.key) ? '__set__' : '');
  }
  return out;
}

/**
 * The message printed when the service refuses to start. It names every
 * missing setting, why it is needed, and both ways to supply it.
 */
export function startupHelp(missing) {
  const lines = [];
  lines.push('='.repeat(72));
  lines.push(' Timely Content cannot start: required configuration is missing.');
  lines.push('='.repeat(72));
  lines.push('');

  for (const s of missing) {
    lines.push(`  ${s.env}   (${s.label})`);
    lines.push(`      ${s.help}`);
    if (s.requiredBecause) lines.push(`      Required because ${s.requiredBecause}.`);
    lines.push('');
  }

  lines.push('  Set them as environment variables, for example in docker-compose.yml:');
  lines.push('');
  lines.push('    environment:');
  for (const s of missing) lines.push(`      ${s.env}: "..."`);
  lines.push('');
  lines.push('  Or add them to settings.json in the data volume:');
  lines.push('');
  // Build a real nested object so the example can be pasted as-is.
  const example = {};
  for (const s of missing) {
    const parts = s.key.split('.');
    const leaf = parts.pop();
    let node = example;
    for (const part of parts) {
      node[part] = node[part] || {};
      node = node[part];
    }
    node[leaf] = '...';
  }
  for (const line of JSON.stringify(example, null, 2).split('\n')) {
    lines.push(`    ${line}`);
  }
  lines.push('');
  lines.push('  Environment variables always win over settings.json.');
  lines.push('');
  lines.push('  Not using email? Set PASSWORD_RESET_ENABLED=false to start without an');
  lines.push('  SMTP server. The "Forgot password" link is hidden and every other');
  lines.push('  feature keeps working.');
  lines.push('='.repeat(72));
  return lines.join('\n');
}
