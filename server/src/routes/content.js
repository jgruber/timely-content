import { asyncRouter } from '../lib/router.js';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import QRCode from 'qrcode';
import { requireAuth } from '../lib/session.js';
import { getSettings, shareUrl } from '../lib/settings.js';
import { blobPath, TMP_DIR } from '../lib/paths.js';
import {
  contentStore, publicItem, newItem, parseMaxAccesses, ownedBy, purge,
  KIND_MARKDOWN, KIND_FILE,
} from '../lib/content.js';
import { randomToken } from '../lib/tokens.js';

const router = asyncRouter();
router.use(requireAuth);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => cb(null, `up-${randomToken(12)}`),
});

/**
 * The size cap is an administrator setting, so the multer instance is built
 * per request. This makes multer abort the stream once the limit is passed,
 * rather than letting a huge upload land on disk and rejecting it afterwards.
 */
async function receiveUpload(req, res, next) {
  const { maxUploadMb } = await getSettings();
  const handler = multer({
    storage,
    limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1 },
  }).single('file');

  handler(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File exceeds the ${maxUploadMb} MB upload limit.` });
    }
    next(err);
  });
}

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;

function cleanTitle(value, fallback) {
  const title = String(value ?? '').trim().slice(0, 200);
  return title || fallback;
}

function isMarkdownUpload(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ext === '.md' || ext === '.markdown' || file.mimetype === 'text/markdown';
}

async function withShareUrl(req, item) {
  const settings = await getSettings();
  return publicItem(item, shareUrl(settings, item.token, req));
}

router.get('/', async (req, res) => {
  const items = await contentStore.read((data) =>
    data.items.filter((i) => i.owner === req.user.username && !i.pendingDelete).map((i) => structuredClone(i)));
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const settings = await getSettings();
  res.json({
    items: items.map((i) => publicItem(i, shareUrl(settings, i.token, req))),
    publicUrlConfigured: !!settings.publicUrl,
  });
});

router.post('/', async (req, res) => {
  const { title, body, maxAccesses, deleteOnExhaust } = req.body || {};
  const text = String(body ?? '');
  if (!text.trim()) return res.status(400).json({ error: 'Content cannot be empty.' });
  if (Buffer.byteLength(text, 'utf8') > MAX_MARKDOWN_BYTES) {
    return res.status(413).json({ error: 'Markdown document is too large (2 MB limit).' });
  }
  const limit = parseMaxAccesses(maxAccesses);
  if (limit.error) return res.status(400).json({ error: limit.error });

  const item = newItem({
    owner: req.user.username,
    title: cleanTitle(title, 'Untitled note'),
    kind: KIND_MARKDOWN,
    filename: null,
    mime: 'text/markdown',
    size: Buffer.byteLength(text, 'utf8'),
    maxAccesses: limit.value,
    deleteOnExhaust,
  });

  await fs.writeFile(blobPath(item.id), text, { mode: 0o600 });
  await contentStore.write((data) => { data.items.push(item); });
  res.status(201).json({ item: await withShareUrl(req, item) });
});

router.post('/upload', receiveUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });

  const cleanup = async () => {
    try { await fs.unlink(req.file.path); } catch { /* already gone */ }
  };

  const limit = parseMaxAccesses(req.body.maxAccesses);
  if (limit.error) {
    await cleanup();
    return res.status(400).json({ error: limit.error });
  }

  const markdown = isMarkdownUpload(req.file);
  const item = newItem({
    owner: req.user.username,
    title: cleanTitle(req.body.title, req.file.originalname || 'Untitled upload'),
    kind: markdown ? KIND_MARKDOWN : KIND_FILE,
    filename: req.file.originalname || 'download',
    mime: markdown ? 'text/markdown' : (req.file.mimetype || 'application/octet-stream'),
    size: req.file.size,
    maxAccesses: limit.value,
    deleteOnExhaust: req.body.deleteOnExhaust === 'true' || req.body.deleteOnExhaust === true,
  });

  await fs.rename(req.file.path, blobPath(item.id));
  await fs.chmod(blobPath(item.id), 0o600);
  await contentStore.write((data) => { data.items.push(item); });
  res.status(201).json({ item: await withShareUrl(req, item) });
});

router.get('/:id', async (req, res) => {
  const item = await contentStore.read((data) => {
    const found = ownedBy(data, req.params.id, req.user.username);
    return found ? structuredClone(found) : null;
  });
  if (!item) return res.status(404).json({ error: 'Content not found.' });

  const payload = { item: await withShareUrl(req, item) };
  if (item.kind === KIND_MARKDOWN) {
    payload.body = await fs.readFile(blobPath(item.id), 'utf8');
  }
  res.json(payload);
});

router.put('/:id', async (req, res) => {
  const { title, body, maxAccesses, deleteOnExhaust } = req.body || {};

  let limit = { value: undefined };
  if (maxAccesses !== undefined) {
    limit = parseMaxAccesses(maxAccesses);
    if (limit.error) return res.status(400).json({ error: limit.error });
  }

  const existing = await contentStore.read((data) => {
    const found = ownedBy(data, req.params.id, req.user.username);
    return found ? structuredClone(found) : null;
  });
  if (!existing) return res.status(404).json({ error: 'Content not found.' });

  if (body !== undefined) {
    if (existing.kind !== KIND_MARKDOWN) {
      return res.status(400).json({ error: 'Only markdown content can be edited in place.' });
    }
    const text = String(body);
    if (!text.trim()) return res.status(400).json({ error: 'Content cannot be empty.' });
    if (Buffer.byteLength(text, 'utf8') > MAX_MARKDOWN_BYTES) {
      return res.status(413).json({ error: 'Markdown document is too large (2 MB limit).' });
    }
    await fs.writeFile(blobPath(existing.id), text, { mode: 0o600 });
  }

  const updated = await contentStore.write((data) => {
    const item = ownedBy(data, req.params.id, req.user.username);
    if (!item) return null;
    if (title !== undefined) item.title = cleanTitle(title, item.title);
    if (body !== undefined) item.size = Buffer.byteLength(String(body), 'utf8');
    if (limit.value !== undefined) item.maxAccesses = limit.value;
    if (deleteOnExhaust !== undefined) item.deleteOnExhaust = !!deleteOnExhaust;
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  });
  if (!updated) return res.status(404).json({ error: 'Content not found.' });

  res.json({ item: await withShareUrl(req, updated) });
});

/** Issue a fresh share token, invalidating the old QR code, and reset the counter. */
router.post('/:id/rotate', async (req, res) => {
  const { maxAccesses, deleteOnExhaust } = req.body || {};

  let limit = { value: undefined };
  if (maxAccesses !== undefined) {
    limit = parseMaxAccesses(maxAccesses);
    if (limit.error) return res.status(400).json({ error: limit.error });
  }

  const updated = await contentStore.write((data) => {
    const item = ownedBy(data, req.params.id, req.user.username);
    if (!item) return null;
    item.token = randomToken();
    item.accessCount = 0;
    item.lastAccessAt = null;
    if (limit.value !== undefined) item.maxAccesses = limit.value;
    if (deleteOnExhaust !== undefined) item.deleteOnExhaust = !!deleteOnExhaust;
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  });
  if (!updated) return res.status(404).json({ error: 'Content not found.' });

  res.json({ item: await withShareUrl(req, updated) });
});

router.delete('/:id', async (req, res) => {
  const item = await contentStore.read((data) => {
    const found = ownedBy(data, req.params.id, req.user.username);
    return found ? structuredClone(found) : null;
  });
  if (!item) return res.status(404).json({ error: 'Content not found.' });
  await purge(item.id);
  res.json({ ok: true });
});

/** QR code as a downloadable PNG, for pasting into an email. */
router.get('/:id/qr.png', async (req, res, next) => {
  try {
    const item = await contentStore.read((data) => {
      const found = ownedBy(data, req.params.id, req.user.username);
      return found ? structuredClone(found) : null;
    });
    if (!item) return res.status(404).json({ error: 'Content not found.' });

    const settings = await getSettings();
    const size = Math.min(1200, Math.max(128, Number(req.query.size) || 512));
    const png = await QRCode.toBuffer(shareUrl(settings, item.token, req), {
      type: 'png', width: size, margin: 2,
      color: { dark: '#000000ff', light: '#ffffffff' },
    });

    const safe = (item.title || 'content').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'content';
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${safe}.png"`);
    res.send(png);
  } catch (err) {
    next(err);
  }
});

/** Owner preview/download. Does not consume a QR access. */
router.get('/:id/download', async (req, res, next) => {
  try {
    const item = await contentStore.read((data) => {
      const found = ownedBy(data, req.params.id, req.user.username);
      return found ? structuredClone(found) : null;
    });
    if (!item) return res.status(404).json({ error: 'Content not found.' });

    res.setHeader('Content-Type', item.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition',
      `attachment; filename="${encodeURIComponent(item.filename || item.title || 'download')}"`);
    createReadStream(blobPath(item.id)).on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
