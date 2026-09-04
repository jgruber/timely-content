import { asyncRouter } from '../lib/router.js';
import { requireAdmin, setSessionCookie } from '../lib/session.js';
import {
  usersStore, findUser, publicUser, newUserRecord, USERNAME_RE,
} from '../lib/users.js';
import { hashPassword, validatePassword } from '../lib/passwords.js';
import { getSettings, settingsStore, normaliseSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { contentStore, purge } from '../lib/content.js';

const router = asyncRouter();
router.use(requireAdmin);

router.get('/users', async (req, res) => {
  const users = await usersStore.read((data) => data.users.map(publicUser));
  const counts = await contentStore.read((data) => {
    const map = {};
    for (const item of data.items) {
      if (item.pendingDelete) continue;
      map[item.owner] = (map[item.owner] || 0) + 1;
    }
    return map;
  });
  res.json({ users: users.map((u) => ({ ...u, contentCount: counts[u.username] || 0 })) });
});

router.post('/users', async (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  if (!USERNAME_RE.test(String(username ?? ''))) {
    return res.status(400).json({
      error: 'Username must be 2-32 characters using letters, numbers, dot, dash or underscore.',
    });
  }
  const invalid = validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  const hash = await hashPassword(password);
  const result = await usersStore.write((data) => {
    if (findUser(data, username)) return { conflict: true };
    const record = newUserRecord({ username, passwordHash: hash, isAdmin });
    data.users.push(record);
    return { user: publicUser(record) };
  });
  if (result.conflict) return res.status(409).json({ error: 'That username is already taken.' });

  res.status(201).json({ user: { ...result.user, contentCount: 0 } });
});

router.post('/users/:username/password', async (req, res) => {
  const invalid = validatePassword(req.body?.password);
  if (invalid) return res.status(400).json({ error: invalid });

  const hash = await hashPassword(req.body.password);
  const updated = await usersStore.write((data) => {
    const record = findUser(data, req.params.username);
    if (!record) return null;
    record.passwordHash = hash;
    // Force the user off every device they were signed in on.
    record.tokenVersion = (record.tokenVersion || 1) + 1;
    return publicUser(record);
  });
  if (!updated) return res.status(404).json({ error: 'User not found.' });

  // Bumping tokenVersion signs the target out everywhere. When an admin
  // resets their own password that would include this request's own session,
  // so re-issue a cookie for the current device.
  if (updated.username.toLowerCase() === req.user.username.toLowerCase()) {
    const refreshed = await usersStore.read((data) => {
      const record = findUser(data, updated.username);
      return record ? structuredClone(record) : null;
    });
    if (refreshed) await setSessionCookie(res, refreshed);
  }

  res.json({ ok: true, user: updated });
});

router.patch('/users/:username', async (req, res) => {
  const { isAdmin } = req.body || {};
  if (isAdmin === undefined) return res.status(400).json({ error: 'Nothing to update.' });

  const result = await usersStore.write((data) => {
    const record = findUser(data, req.params.username);
    if (!record) return { missing: true };
    // Never allow the last administrator to be demoted -- that would lock
    // everyone out of user management permanently.
    if (record.isAdmin && !isAdmin) {
      const admins = data.users.filter((u) => u.isAdmin).length;
      if (admins <= 1) return { lastAdmin: true };
    }
    record.isAdmin = !!isAdmin;
    return { user: publicUser(record) };
  });

  if (result.missing) return res.status(404).json({ error: 'User not found.' });
  if (result.lastAdmin) return res.status(400).json({ error: 'This is the only administrator.' });
  res.json({ user: result.user });
});

router.delete('/users/:username', async (req, res) => {
  const target = req.params.username;
  if (target.toLowerCase() === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const result = await usersStore.write((data) => {
    const record = findUser(data, target);
    if (!record) return { missing: true };
    if (record.isAdmin && data.users.filter((u) => u.isAdmin).length <= 1) return { lastAdmin: true };
    data.users.splice(data.users.indexOf(record), 1);
    return { username: record.username };
  });

  if (result.missing) return res.status(404).json({ error: 'User not found.' });
  if (result.lastAdmin) return res.status(400).json({ error: 'This is the only administrator.' });

  // Remove everything the deleted user owned, so no orphaned share links survive.
  const owned = await contentStore.read((data) =>
    data.items.filter((i) => i.owner === result.username).map((i) => i.id));
  for (const id of owned) await purge(id);

  res.json({ ok: true, removedContent: owned.length });
});

router.get('/settings', async (req, res) => {
  res.json({ settings: await getSettings() });
});

router.put('/settings', async (req, res) => {
  const current = await getSettings();
  const { next, errors } = normaliseSettings(req.body || {}, current);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const saved = await settingsStore.write((data) => {
    Object.assign(data, DEFAULT_SETTINGS, next);
    return structuredClone(data);
  });
  res.json({ settings: saved });
});

export default router;
