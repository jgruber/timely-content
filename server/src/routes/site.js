import rateLimit from 'express-rate-limit';
import { asyncRouter } from '../lib/router.js';
import {
  getSettings, settingsStore, normaliseSettings, DEFAULT_SETTINGS,
} from '../lib/settings.js';
import {
  usersStore, publicUser, newUserRecord, countUsers, USERNAME_RE,
} from '../lib/users.js';
import { hashPassword, validatePassword } from '../lib/passwords.js';
import { setSessionCookie } from '../lib/session.js';

const router = asyncRouter();

/**
 * Unauthenticated bootstrap information for the SPA.
 *
 * This is deliberately the only settings the public may read: the name and
 * appearance needed to paint the sign-in and shared-content screens, plus
 * whether the instance still needs its first administrator. Nothing here
 * reveals anything about existing users or stored content.
 */
router.get('/', async (req, res) => {
  const settings = await getSettings();
  res.json({
    siteName: settings.siteName,
    appearance: { mode: settings.defaultMode, accent: settings.defaultAccent },
    setupRequired: (await countUsers()) === 0,
  });
});

const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many setup attempts. Try again later.' },
});

/**
 * First-run setup: create the first administrator.
 *
 * Only ever available while no users exist. The check and the insert happen
 * inside a single store write, so two browsers racing through setup cannot
 * both create an account.
 */
router.post('/setup', setupLimiter, async (req, res) => {
  if ((await countUsers()) > 0) {
    return res.status(409).json({ error: 'This instance has already been set up.' });
  }

  const { username, password, publicUrl } = req.body || {};

  if (!USERNAME_RE.test(String(username ?? ''))) {
    return res.status(400).json({
      error: 'Username must be 2-32 characters using letters, numbers, dot, dash or underscore.',
    });
  }
  const invalid = validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  // Validate the optional public URL before creating anything, so a typo does
  // not leave the instance half set up.
  let settingsPatch = null;
  if (publicUrl !== undefined && String(publicUrl).trim() !== '') {
    const current = await getSettings();
    const { next, errors } = normaliseSettings({ publicUrl }, current);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    settingsPatch = next;
  }

  const passwordHash = await hashPassword(password);
  const result = await usersStore.write((data) => {
    if (data.users.length > 0) return { taken: true };
    const record = newUserRecord({ username, passwordHash, isAdmin: true });
    data.users.push(record);
    return { user: structuredClone(record) };
  });

  if (result.taken) {
    return res.status(409).json({ error: 'This instance has already been set up.' });
  }

  if (settingsPatch) {
    await settingsStore.write((data) => {
      Object.assign(data, DEFAULT_SETTINGS, settingsPatch);
    });
  }

  console.log(`[setup] created first administrator "${result.user.username}"`);
  await setSessionCookie(res, result.user);
  res.status(201).json({ user: publicUser(result.user) });
});

export default router;
