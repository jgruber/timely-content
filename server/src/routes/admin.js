import { asyncRouter } from '../lib/router.js';
import { requireAdmin, setSessionCookie } from '../lib/session.js';
import {
  usersStore, findById, publicUser, newUserRecord,
  emailTaken, normaliseEmail, validateEmail, DISPLAY_NAME_MAX,
} from '../lib/users.js';
import { hashPassword, validatePassword } from '../lib/passwords.js';
import { getSettings, getSettingsDetail, saveSettings } from '../lib/settings.js';
import { verifyTransport, sendMail, wrapEmail, escapeHtml } from '../lib/email.js';
import { sendVerificationEmail } from '../lib/notify.js';
import { revokeFor, RESET } from '../lib/emailtokens.js';
import { contentStore, purge, publicItem, anyItem, KIND_MARKDOWN } from '../lib/content.js';
import { sendZip, sendFile } from './content.js';
import { setDownloadHeaders } from '../lib/http.js';
import { shareUrl } from '../lib/settings.js';
import { blobPath } from '../lib/paths.js';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { SCHEMA } from '../lib/config.js';

const router = asyncRouter();
router.use(requireAdmin);

function countAdmins(data) {
  return data.users.filter((u) => u.isAdmin).length;
}

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
  res.json({ users: users.map((u) => ({ ...u, contentCount: counts[u.id] || 0 })) });
});

/**
 * Create an account.
 *
 * The address starts unverified and a confirmation link goes out: a new user
 * cannot sign in until they prove they own the inbox. Only the very first
 * administrator, created during setup, skips this.
 */
router.post('/users', async (req, res) => {
  const { email, password, isAdmin, displayName } = req.body || {};

  const badEmail = validateEmail(email);
  if (badEmail) return res.status(400).json({ error: badEmail });

  const invalid = validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  const settings = await getSettings();
  const address = normaliseEmail(email);
  const hash = await hashPassword(password);

  const result = await usersStore.write((data) => {
    if (emailTaken(data, address)) return { conflict: true };
    const record = newUserRecord({
      email: address,
      displayName,
      passwordHash: hash,
      isAdmin,
      // With no way to send mail there is no way to confirm an address, so
      // the account would be permanently unusable. Trust it instead.
      emailVerified: !settings.passwordResetEnabled,
    });
    data.users.push(record);
    return { user: structuredClone(record) };
  });

  if (result.conflict) {
    return res.status(409).json({ error: 'An account with that address already exists.' });
  }

  let verificationSent = false;
  if (settings.passwordResetEnabled) {
    try {
      await sendVerificationEmail(settings, result.user);
      verificationSent = true;
    } catch (err) {
      console.error('[admin] could not send confirmation email:', err.message);
    }
  }

  res.status(201).json({
    user: { ...publicUser(result.user), contentCount: 0 },
    verificationSent,
  });
});

/** Send another confirmation link to an account that has not verified yet. */
router.post('/users/:id/resend-verification', async (req, res) => {
  const settings = await getSettings();
  if (!settings.passwordResetEnabled) {
    return res.status(400).json({ error: 'Email is not configured on this server.' });
  }

  const user = await usersStore.read((data) => {
    const found = findById(data, req.params.id);
    return found ? structuredClone(found) : null;
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.emailVerified) return res.status(400).json({ error: 'That address is already confirmed.' });

  try {
    await sendVerificationEmail(settings, user);
  } catch (err) {
    return res.status(400).json({ error: `Could not send the email: ${err.message}` });
  }
  res.json({ ok: true, to: user.email });
});

/** Mark an address confirmed by hand, for when mail cannot reach someone. */
router.post('/users/:id/verify', async (req, res) => {
  const updated = await usersStore.write((data) => {
    const record = findById(data, req.params.id);
    if (!record) return null;
    record.emailVerified = true;
    return publicUser(record);
  });
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: updated });
});

router.post('/users/:id/password', async (req, res) => {
  const invalid = validatePassword(req.body?.password);
  if (invalid) return res.status(400).json({ error: invalid });

  const hash = await hashPassword(req.body.password);
  const updated = await usersStore.write((data) => {
    const record = findById(data, req.params.id);
    if (!record) return null;
    record.passwordHash = hash;
    // Force the account off every device it was signed in on.
    record.tokenVersion = (record.tokenVersion || 1) + 1;
    return structuredClone(record);
  });
  if (!updated) return res.status(404).json({ error: 'User not found.' });

  await revokeFor(updated.id, RESET);

  // An admin resetting their own password would otherwise log themselves out.
  if (updated.id === req.user.id) await setSessionCookie(res, updated);

  res.json({ ok: true, user: publicUser(updated) });
});

/** Change an account's login address. */
router.post('/users/:id/email', async (req, res) => {
  const badEmail = validateEmail(req.body?.email);
  if (badEmail) return res.status(400).json({ error: badEmail });

  const address = normaliseEmail(req.body.email);
  const settings = await getSettings();

  const result = await usersStore.write((data) => {
    const record = findById(data, req.params.id);
    if (!record) return { missing: true };
    if (emailTaken(data, address, record.id)) return { taken: true };
    const changed = normaliseEmail(record.email) !== address;
    record.email = address;
    if (changed && settings.passwordResetEnabled) {
      record.emailVerified = false;
      record.tokenVersion = (record.tokenVersion || 1) + 1;
    }
    return { user: structuredClone(record), changed };
  });

  if (result.missing) return res.status(404).json({ error: 'User not found.' });
  if (result.taken) return res.status(409).json({ error: 'Another account already uses that address.' });

  if (result.changed && settings.passwordResetEnabled) {
    try {
      await sendVerificationEmail(settings, result.user);
    } catch (err) {
      console.error('[admin] could not send confirmation email:', err.message);
    }
  }

  res.json({ user: publicUser(result.user) });
});

router.patch('/users/:id', async (req, res) => {
  const { isAdmin, displayName } = req.body || {};
  if (isAdmin === undefined && displayName === undefined) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const result = await usersStore.write((data) => {
    const record = findById(data, req.params.id);
    if (!record) return { missing: true };

    if (isAdmin !== undefined) {
      // Never let the last administrator be demoted -- that would lock
      // everyone out of user management permanently.
      if (record.isAdmin && !isAdmin && countAdmins(data) <= 1) return { lastAdmin: true };
      record.isAdmin = !!isAdmin;
    }
    if (displayName !== undefined) {
      const name = String(displayName).trim().slice(0, DISPLAY_NAME_MAX);
      if (!name) return { badName: true };
      record.displayName = name;
    }
    return { user: publicUser(record) };
  });

  if (result.missing) return res.status(404).json({ error: 'User not found.' });
  if (result.lastAdmin) return res.status(400).json({ error: 'This is the only administrator.' });
  if (result.badName) return res.status(400).json({ error: 'Display name cannot be empty.' });
  res.json({ user: result.user });
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const result = await usersStore.write((data) => {
    const record = findById(data, req.params.id);
    if (!record) return { missing: true };
    if (record.isAdmin && countAdmins(data) <= 1) return { lastAdmin: true };
    data.users.splice(data.users.indexOf(record), 1);
    return { id: record.id };
  });

  if (result.missing) return res.status(404).json({ error: 'User not found.' });
  if (result.lastAdmin) return res.status(400).json({ error: 'This is the only administrator.' });

  await revokeFor(result.id);

  // Remove everything they owned, so no orphaned share links survive.
  const owned = await contentStore.read((data) =>
    data.items.filter((i) => i.owner === result.id).map((i) => i.id));
  for (const id of owned) await purge(id);

  res.json({ ok: true, removedContent: owned.length });
});

// ---- Content oversight -----------------------------------------------------

/**
 * Everything stored on the instance, whoever owns it.
 *
 * Administrators need this to answer "what is being shared from my server"
 * and to take something down. Owner-facing routes stay scoped to the signed-in
 * account; this is the only place that reads across accounts.
 */
router.get('/content', async (req, res) => {
  const settings = await getSettings();
  const owners = await usersStore.read((data) => {
    const map = {};
    for (const u of data.users) {
      map[u.id] = { id: u.id, email: u.email, displayName: u.displayName };
    }
    return map;
  });

  const items = await contentStore.read((data) =>
    data.items.filter((i) => !i.pendingDelete).map((i) => structuredClone(i)));
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    items: items.map((i) => ({
      ...publicItem(i, shareUrl(settings, i.token, req)),
      // A deleted account's content is purged with it, but a stale row would
      // otherwise render as blank -- name it so it can still be cleaned up.
      owner: owners[i.owner] || { id: i.owner, email: '', displayName: 'unknown account' },
    })),
    publicUrlConfigured: !!settings.publicUrl,
  });
});

/** Inspect one item. Markdown comes back inline; no QR access is consumed. */
router.get('/content/:id', async (req, res) => {
  const item = await contentStore.read((data) => {
    const found = anyItem(data, req.params.id);
    return found ? structuredClone(found) : null;
  });
  if (!item) return res.status(404).json({ error: 'Content not found.' });

  const settings = await getSettings();
  const payload = { item: publicItem(item, shareUrl(settings, item.token, req)) };
  if (item.kind === KIND_MARKDOWN) {
    payload.body = await fs.readFile(blobPath(item.id), 'utf8');
  }
  res.json(payload);
});

/** Download anything stored, whoever owns it. Does not spend a QR access. */
router.get('/content/:id/download', async (req, res, next) => {
  const item = await contentStore.read((data) => {
    const found = anyItem(data, req.params.id);
    return found ? structuredClone(found) : null;
  });
  if (!item) return res.status(404).json({ error: 'Content not found.' });

  if (item.kind === KIND_MARKDOWN) {
    setDownloadHeaders(res, { filename: `${item.title || 'note'}.md`, mime: 'text/markdown' });
    return createReadStream(blobPath(item.id)).on('error', next).pipe(res);
  }
  if (item.files?.length === 1) return sendFile(res, item, item.files[0].id, next);
  return sendZip(res, item, next);
});

/** Take something down, whoever posted it. The share link dies immediately. */
router.delete('/content/:id', async (req, res) => {
  const item = await contentStore.read((data) => {
    const found = anyItem(data, req.params.id);
    return found ? structuredClone(found) : null;
  });
  if (!item) return res.status(404).json({ error: 'Content not found.' });

  await purge(item.id);
  console.log(`[admin] ${req.user.email} removed content "${item.title}" (${item.id})`);
  res.json({ ok: true });
});

// ---- System settings -------------------------------------------------------

router.get('/settings', async (req, res) => {
  const { envManaged, publicValues: values } = await getSettingsDetail();
  res.json({
    settings: values,
    // Keys the environment is managing, so the UI can show them read-only
    // instead of offering an edit the next restart would undo.
    envManaged,
    schema: SCHEMA.map((s) => ({ key: s.key, env: s.env, label: s.label, help: s.help })),
  });
});

router.put('/settings', async (req, res) => {
  const result = await saveSettings(req.body || {});
  if (result.errors) return res.status(400).json({ error: result.errors.join(' ') });

  const { envManaged, publicValues: values } = await getSettingsDetail();
  res.json({ settings: values, envManaged, rejected: result.rejected });
});

/** Prove the SMTP settings work by sending a real message. */
router.post('/settings/test-email', async (req, res) => {
  const settings = await getSettings();
  if (!settings.smtp.host) {
    return res.status(400).json({ error: 'Set an SMTP host before testing.' });
  }

  const verified = await verifyTransport(settings.smtp);
  if (!verified.ok) {
    return res.status(400).json({ error: `Could not reach the mail server: ${verified.error}` });
  }

  const to = normaliseEmail(req.body?.to) || normaliseEmail(req.user.email);
  if (!to) return res.status(400).json({ error: 'No address to send to.' });

  try {
    const result = await sendMail(settings.smtp, {
      to,
      subject: `${settings.siteName} test message`,
      html: wrapEmail(
        `<p>This is a test message from <strong>${escapeHtml(settings.siteName)}</strong>.</p>
         <p>If you are reading it, confirmation and password-reset email will reach
            your users.</p>`,
        settings.siteName,
      ),
    });
    res.json({ ok: true, to, delivered: result.sent, fallback: !!result.fallback });
  } catch (err) {
    res.status(400).json({ error: `The mail server rejected the message: ${err.message}` });
  }
});

export default router;
