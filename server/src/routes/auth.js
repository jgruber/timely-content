import { asyncRouter } from '../lib/router.js';
import rateLimit from 'express-rate-limit';
import {
  usersStore, findByEmail, findById, publicUser, emailTaken,
  normaliseEmail, validateEmail, DISPLAY_NAME_MAX,
} from '../lib/users.js';
import { isValidMode, isValidAccent, DEFAULT_PREFS } from '../lib/appearance.js';
import { verifyPassword, hashPassword, validatePassword } from '../lib/passwords.js';
import { setSessionCookie, clearSessionCookie, requireAuth } from '../lib/session.js';
import { getSettings } from '../lib/settings.js';
import { issueToken, peekToken, consumeToken, revokeFor, RESET, VERIFY } from '../lib/emailtokens.js';
import { sendVerificationEmail, sendResetEmail } from '../lib/notify.js';

const router = asyncRouter();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
});

// Cost of a scrypt verification against a hash that matches nothing, so a
// missing account takes the same time as a wrong password.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA=='
  + '$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const address = normaliseEmail(email);

  const user = await usersStore.read((data) => {
    const found = findByEmail(data, address);
    return found ? structuredClone(found) : null;
  });

  const ok = await verifyPassword(String(password ?? ''), user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  // Checked only after the password is known good, so this never tells an
  // outsider which addresses are registered.
  if (!user.emailVerified) {
    return res.status(403).json({
      error: 'Confirm your email address before signing in. Check your inbox for the link.',
      reason: 'unverified',
    });
  }

  await usersStore.write((data) => {
    const record = findById(data, user.id);
    if (record) record.lastLoginAt = new Date().toISOString();
  });

  await setSessionCookie(res, user);
  res.json({ user: publicUser({ ...user, lastLoginAt: new Date().toISOString() }) });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user) });
});

router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const invalid = validatePassword(newPassword);
  if (invalid) return res.status(400).json({ error: invalid });

  const ok = await verifyPassword(String(currentPassword ?? ''), req.user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });

  const hash = await hashPassword(newPassword);
  const updated = await usersStore.write((data) => {
    const record = findById(data, req.user.id);
    if (!record) return null;
    record.passwordHash = hash;
    // Invalidate every session issued under the old password, including this
    // one -- a fresh cookie is handed back for the current device.
    record.tokenVersion = (record.tokenVersion || 1) + 1;
    return structuredClone(record);
  });
  if (!updated) return res.status(404).json({ error: 'User no longer exists.' });

  // Any reset link already sitting in an inbox must stop working.
  await revokeFor(updated.id, RESET);

  await setSessionCookie(res, updated);
  res.json({ ok: true, user: publicUser(updated) });
});

/**
 * Change your own email address.
 *
 * Gated on the current password because the address is the login identity and
 * the password-recovery channel. The new address starts unverified and a
 * confirmation link goes out; until it is confirmed the account cannot sign in
 * again, which is what makes a typo recoverable by an administrator rather
 * than silently locking the account to an inbox nobody owns.
 */
router.post('/email', requireAuth, async (req, res) => {
  const { password, email } = req.body || {};
  const wanted = normaliseEmail(email);

  const invalid = validateEmail(wanted);
  if (invalid) return res.status(400).json({ error: invalid });

  const ok = await verifyPassword(String(password ?? ''), req.user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Password is incorrect.' });

  if (wanted === normaliseEmail(req.user.email)) {
    return res.json({ user: publicUser(req.user), unchanged: true });
  }

  const settings = await getSettings();
  const result = await usersStore.write((data) => {
    const record = findById(data, req.user.id);
    if (!record) return { missing: true };
    if (emailTaken(data, wanted, record.id)) return { taken: true };
    record.email = wanted;
    if (settings.passwordResetEnabled) {
      record.emailVerified = false;
      record.tokenVersion = (record.tokenVersion || 1) + 1;
    }
    return { user: structuredClone(record) };
  });

  if (result.missing) return res.status(404).json({ error: 'User no longer exists.' });
  if (result.taken) return res.status(409).json({ error: 'Another account already uses that address.' });

  if (settings.passwordResetEnabled) {
    await sendVerificationEmail(settings, result.user);
    clearSessionCookie(res);
    return res.json({
      user: publicUser(result.user),
      verificationSent: true,
      signedOut: true,
    });
  }

  res.json({ user: publicUser(result.user) });
});

router.put('/prefs', requireAuth, async (req, res) => {
  const { mode, accent } = req.body || {};
  if (mode !== undefined && !isValidMode(mode)) {
    return res.status(400).json({ error: 'Unknown appearance mode.' });
  }
  if (accent !== undefined && !isValidAccent(accent)) {
    return res.status(400).json({ error: 'Unknown colour theme.' });
  }

  const updated = await usersStore.write((data) => {
    const record = findById(data, req.user.id);
    if (!record) return null;
    record.prefs = { ...DEFAULT_PREFS, ...(record.prefs || {}) };
    if (mode !== undefined) record.prefs.mode = mode;
    if (accent !== undefined) record.prefs.accent = accent;
    return structuredClone(record);
  });
  if (!updated) return res.status(404).json({ error: 'User no longer exists.' });

  res.json({ user: publicUser(updated) });
});

router.put('/profile', requireAuth, async (req, res) => {
  const displayName = String(req.body?.displayName ?? '').trim().slice(0, DISPLAY_NAME_MAX);
  if (!displayName) return res.status(400).json({ error: 'Display name cannot be empty.' });

  const updated = await usersStore.write((data) => {
    const record = findById(data, req.user.id);
    if (!record) return null;
    record.displayName = displayName;
    return structuredClone(record);
  });
  if (!updated) return res.status(404).json({ error: 'User no longer exists.' });

  res.json({ user: publicUser(updated) });
});

// ---- Forgotten passwords ---------------------------------------------------

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});

/**
 * Start a password reset.
 *
 * Always answers identically. Whether the address is registered, whether it is
 * verified, and whether delivery succeeded are all invisible to the caller --
 * otherwise this becomes a way to enumerate accounts.
 */
router.post('/forgot', emailLimiter, async (req, res) => {
  const settings = await getSettings();
  if (!settings.passwordResetEnabled) {
    return res.status(404).json({ error: 'Password reset is not enabled on this server.' });
  }

  const address = normaliseEmail(req.body?.email);
  const generic = { ok: true };
  if (!address) return res.json(generic);

  const user = await usersStore.read((data) => {
    const found = findByEmail(data, address);
    return found ? structuredClone(found) : null;
  });

  if (user) {
    try {
      // An unverified account gets the confirmation link it is actually
      // waiting on, rather than a reset it cannot use.
      if (user.emailVerified) await sendResetEmail(settings, user);
      else await sendVerificationEmail(settings, user);
    } catch (err) {
      console.error('[auth] could not send account email:', err.message);
    }
  }

  res.json(generic);
});

router.get('/reset/:token', async (req, res) => {
  const entry = await peekToken(req.params.token, RESET);
  if (!entry) {
    return res.status(410).json({ error: 'This reset link has expired or has already been used.' });
  }
  const user = await usersStore.read((data) => {
    const found = findById(data, entry.userId);
    return found ? { email: found.email } : null;
  });
  if (!user) return res.status(410).json({ error: 'This reset link is no longer valid.' });

  res.json({ valid: true, email: user.email, expires: entry.expires });
});

router.post('/reset', emailLimiter, async (req, res) => {
  const { token, password } = req.body || {};

  const invalid = validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  const userId = await consumeToken(String(token ?? ''), RESET);
  if (!userId) {
    return res.status(410).json({ error: 'This reset link has expired or has already been used.' });
  }

  const hash = await hashPassword(password);
  const updated = await usersStore.write((data) => {
    const record = findById(data, userId);
    if (!record) return null;
    record.passwordHash = hash;
    // Whoever prompted the reset may be sitting on a stolen session.
    record.tokenVersion = (record.tokenVersion || 1) + 1;
    // Receiving mail at the address proves it works.
    record.emailVerified = true;
    return structuredClone(record);
  });

  if (!updated) return res.status(410).json({ error: 'This reset link is no longer valid.' });
  await revokeFor(userId);

  res.json({ ok: true, email: updated.email });
});

// ---- Address confirmation --------------------------------------------------

router.get('/verify/:token', async (req, res) => {
  const entry = await peekToken(req.params.token, VERIFY);
  if (!entry) {
    return res.status(410).json({ error: 'This confirmation link has expired or has already been used.' });
  }
  const user = await usersStore.read((data) => {
    const found = findById(data, entry.userId);
    return found ? { email: found.email } : null;
  });
  if (!user) return res.status(410).json({ error: 'This confirmation link is no longer valid.' });

  res.json({ valid: true, email: user.email });
});

/**
 * Spend a confirmation link.
 *
 * Deliberately a POST: mail clients and security scanners routinely fetch
 * every link in a message, and a GET here would let them consume the token
 * before the person ever clicked it.
 */
router.post('/verify', emailLimiter, async (req, res) => {
  const userId = await consumeToken(String(req.body?.token ?? ''), VERIFY);
  if (!userId) {
    return res.status(410).json({ error: 'This confirmation link has expired or has already been used.' });
  }

  const updated = await usersStore.write((data) => {
    const record = findById(data, userId);
    if (!record) return null;
    record.emailVerified = true;
    return structuredClone(record);
  });
  if (!updated) return res.status(410).json({ error: 'This confirmation link is no longer valid.' });

  res.json({ ok: true, email: updated.email });
});

/** Ask for a fresh confirmation link. Non-enumerating, like /forgot. */
router.post('/resend-verification', emailLimiter, async (req, res) => {
  const settings = await getSettings();
  const address = normaliseEmail(req.body?.email);
  const generic = { ok: true };
  if (!address || !settings.passwordResetEnabled) return res.json(generic);

  const user = await usersStore.read((data) => {
    const found = findByEmail(data, address);
    return found ? structuredClone(found) : null;
  });

  if (user && !user.emailVerified) {
    try {
      await sendVerificationEmail(settings, user);
    } catch (err) {
      console.error('[auth] could not send confirmation email:', err.message);
    }
  }

  res.json(generic);
});

export default router;
