import { asyncRouter } from '../lib/router.js';
import rateLimit from 'express-rate-limit';
import { usersStore, findUser, publicUser } from '../lib/users.js';
import { isValidMode, isValidAccent, DEFAULT_PREFS } from '../lib/appearance.js';
import { verifyPassword, hashPassword, validatePassword } from '../lib/passwords.js';
import { setSessionCookie, clearSessionCookie, requireAuth } from '../lib/session.js';

const router = asyncRouter();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const user = await usersStore.read((data) => {
    const found = findUser(data, username);
    return found ? structuredClone(found) : null;
  });

  // Always run a verification so a missing user costs the same as a bad password.
  const reference = user?.passwordHash
    || 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const ok = await verifyPassword(String(password ?? ''), reference);

  if (!user || !ok) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  await usersStore.write((data) => {
    const record = findUser(data, user.username);
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
    const record = findUser(data, req.user.username);
    if (!record) return null;
    record.passwordHash = hash;
    // Invalidate every session issued under the old password, including
    // this one -- we immediately re-issue a cookie for the current device.
    record.tokenVersion = (record.tokenVersion || 1) + 1;
    return structuredClone(record);
  });
  if (!updated) return res.status(404).json({ error: 'User no longer exists.' });

  await setSessionCookie(res, updated);
  res.json({ ok: true, user: publicUser(updated) });
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
    const record = findUser(data, req.user.username);
    if (!record) return null;
    record.prefs = { ...DEFAULT_PREFS, ...(record.prefs || {}) };
    if (mode !== undefined) record.prefs.mode = mode;
    if (accent !== undefined) record.prefs.accent = accent;
    return structuredClone(record);
  });
  if (!updated) return res.status(404).json({ error: 'User no longer exists.' });

  res.json({ user: publicUser(updated) });
});

export default router;
