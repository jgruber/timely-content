import rateLimit from 'express-rate-limit';
import { asyncRouter } from '../lib/router.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import {
  usersStore, publicUser, newUserRecord, countUsers, validateEmail, normaliseEmail,
} from '../lib/users.js';
import { hashPassword, validatePassword } from '../lib/passwords.js';
import { setSessionCookie, requireAuth } from '../lib/session.js';
import { VERSION, REPOSITORY_URL, ISSUES_URL, STARTED_AT } from '../lib/version.js';

const router = asyncRouter();

/**
 * Unauthenticated bootstrap information for the SPA.
 *
 * Deliberately the only settings the public may read: the name and appearance
 * needed to paint the sign-in and shared-content screens, whether the instance
 * still needs its first administrator, and whether email flows are available.
 * Nothing here reveals anything about existing accounts or stored content.
 */
router.get('/', async (req, res) => {
  const settings = await getSettings();
  res.json({
    siteName: settings.siteName,
    appearance: { mode: settings.defaultMode, accent: settings.defaultAccent },
    setupRequired: (await countUsers()) === 0,
    passwordResetEnabled: !!settings.passwordResetEnabled,
  });
});

/**
 * Build identity for the About screen.
 *
 * Behind auth on purpose: telling anonymous visitors and share-link recipients
 * exactly which build is running only helps someone match it against a known
 * vulnerability. Signed-in users are the ones who file bug reports.
 */
router.get('/about', requireAuth, async (req, res) => {
  const settings = await getSettings();
  res.json({
    siteName: settings.siteName,
    version: VERSION,
    repositoryUrl: REPOSITORY_URL,
    issuesUrl: ISSUES_URL,
    startedAt: STARTED_AT,
    nodeVersion: process.version,
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
 * Only available while no accounts exist. The check and the insert happen in a
 * single store write, so two browsers racing through setup cannot both create
 * an account. This is the one account that skips email confirmation: there is
 * nobody yet who could approve it, and locking the operator out of their own
 * fresh instance because a relay is misconfigured helps no one.
 */
router.post('/setup', setupLimiter, async (req, res) => {
  if ((await countUsers()) > 0) {
    return res.status(409).json({ error: 'This instance has already been set up.' });
  }

  const { email, password, publicUrl, displayName } = req.body || {};

  const badEmail = validateEmail(email);
  if (badEmail) return res.status(400).json({ error: badEmail });

  const invalid = validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  // Validate the optional public URL before creating anything, so a typo does
  // not leave the instance half set up.
  if (publicUrl !== undefined && String(publicUrl).trim() !== '') {
    const check = await saveSettings({ publicUrl });
    if (check.errors) return res.status(400).json({ error: check.errors.join(' ') });
  }

  const passwordHash = await hashPassword(password);
  const result = await usersStore.write((data) => {
    if (data.users.length > 0) return { taken: true };
    const record = newUserRecord({
      email: normaliseEmail(email),
      displayName,
      passwordHash,
      isAdmin: true,
      emailVerified: true,
    });
    data.users.push(record);
    return { user: structuredClone(record) };
  });

  if (result.taken) {
    return res.status(409).json({ error: 'This instance has already been set up.' });
  }

  console.log(`[setup] created first administrator "${result.user.email}"`);
  await setSessionCookie(res, result.user);
  res.status(201).json({ user: publicUser(result.user) });
});

export default router;
