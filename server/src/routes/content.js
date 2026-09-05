import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import QRCode from 'qrcode';
import { asyncRouter } from '../lib/router.js';
import { requireAuth } from '../lib/session.js';
import { getSettings, shareUrl } from '../lib/settings.js';
import { blobPath, filePath, thumbPath, TMP_DIR } from '../lib/paths.js';
import {
  contentStore, publicItem, newItem, parseMaxAccesses, parseExpiresAt, ownedBy, purge,
  KIND_MARKDOWN, KIND_FILE,
} from '../lib/content.js';
import { randomId, randomToken } from '../lib/tokens.js';
import { zipEntryNames, buildZip, zipFilename } from '../lib/zip.js';

const router = asyncRouter();
router.use(requireAuth);

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_THUMB_BYTES = 256 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => cb(null, `up-${randomToken(12)}`),
});

/**
 * Receive a multi-file upload.
 *
 * Both caps are administrator settings, so the multer instance is built per
 * request. The declared Content-Length is checked first: it costs nothing and
 * stops an oversized upload before any of it reaches the disk, rather than
 * writing gigabytes only to reject them. It is client-supplied and so not
 * trusted on its own -- the per-file and file-count limits still bound what a
 * lying client can do, and the real total is checked once the files land.
 */
async function receiveUpload(req, res, next) {
  const { maxUploadMb, maxPackageMb, maxFilesPerPackage } = await getSettings();
  const packageBytes = maxPackageMb * 1024 * 1024;

  const declared = Number(req.headers['content-length'] || 0);
  // A little slack for multipart boundaries and the thumbnails riding along.
  if (declared && declared > packageBytes * 1.2 + 1024 * 1024) {
    return res.status(413).json({
      error: `That is more than the ${maxPackageMb} MB limit for a single upload.`,
    });
  }

  const handler = multer({
    storage,
    limits: {
      fileSize: Math.min(maxUploadMb, maxPackageMb) * 1024 * 1024,
      files: maxFilesPerPackage * 2, // files plus their thumbnails
    },
  }).fields([
    { name: 'files', maxCount: maxFilesPerPackage },
    { name: 'thumbs', maxCount: maxFilesPerPackage },
  ]);

  handler(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `A file exceeds the ${maxUploadMb} MB per-file limit.` });
    }
    if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(413).json({ error: `You can upload at most ${maxFilesPerPackage} files at once.` });
    }
    next(err);
  });
}

function cleanTitle(value, fallback) {
  const title = String(value ?? '').trim().slice(0, 200);
  return title || fallback;
}

function isMarkdownName(name) {
  const ext = path.extname(name || '').toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

async function withShareUrl(req, item) {
  const settings = await getSettings();
  return publicItem(item, shareUrl(settings, item.token, req));
}

/** Read the access limit, expiry and delete flag shared by every write path. */
function readSharingOptions(body, { required = false } = {}) {
  const out = {};

  if (required || body.maxAccesses !== undefined) {
    const limit = parseMaxAccesses(body.maxAccesses);
    if (limit.error) return { error: limit.error };
    out.maxAccesses = limit.value;
  }

  if (required || body.expiresAt !== undefined) {
    const expiry = parseExpiresAt(body.expiresAt);
    if (expiry.error) return { error: expiry.error };
    out.expiresAt = expiry.value;
  }

  if (required || body.deleteWhenFinished !== undefined) {
    out.deleteWhenFinished = body.deleteWhenFinished === true
      || body.deleteWhenFinished === 'true';
  }

  return { values: out };
}

/** A thumbnail is only accepted if it really is a small JPEG or PNG. */
function looksLikeImage(buffer) {
  if (buffer.length < 4) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return jpeg || png;
}

router.get('/', async (req, res) => {
  const items = await contentStore.read((data) =>
    data.items.filter((i) => i.owner === req.user.id && !i.pendingDelete).map((i) => structuredClone(i)));
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const settings = await getSettings();
  res.json({
    items: items.map((i) => publicItem(i, shareUrl(settings, i.token, req))),
    publicUrlConfigured: !!settings.publicUrl,
  });
});

router.post('/', async (req, res) => {
  const { title, body } = req.body || {};
  const text = String(body ?? '');
  if (!text.trim()) return res.status(400).json({ error: 'Content cannot be empty.' });
  if (Buffer.byteLength(text, 'utf8') > MAX_MARKDOWN_BYTES) {
    return res.status(413).json({ error: 'Markdown document is too large (2 MB limit).' });
  }

  const options = readSharingOptions(req.body || {}, { required: true });
  if (options.error) return res.status(400).json({ error: options.error });

  const item = newItem({
    owner: req.user.id,
    title: cleanTitle(title, 'Untitled note'),
    kind: KIND_MARKDOWN,
    mime: 'text/markdown',
    size: Buffer.byteLength(text, 'utf8'),
    ...options.values,
  });

  await fs.writeFile(blobPath(item.id), text, { mode: 0o600 });
  await contentStore.write((data) => { data.items.push(item); });
  res.status(201).json({ item: await withShareUrl(req, item) });
});

/**
 * Upload one or more files as a single share.
 *
 * Everything arrives or nothing does: a package that is missing three of
 * twenty photos is worse than a clear failure, so the files are only moved
 * into place once all of them have been accepted.
 */
router.post('/upload', receiveUpload, async (req, res) => {
  const uploaded = req.files?.files || [];
  const thumbs = req.files?.thumbs || [];

  const cleanup = async () => {
    for (const f of [...uploaded, ...thumbs]) {
      await fs.unlink(f.path).catch(() => {});
    }
  };

  if (uploaded.length === 0) {
    await cleanup();
    return res.status(400).json({ error: 'No files were uploaded.' });
  }

  const settings = await getSettings();
  const total = uploaded.reduce((sum, f) => sum + f.size, 0);
  if (total > settings.maxPackageMb * 1024 * 1024) {
    await cleanup();
    return res.status(413).json({
      error: `Those files come to more than the ${settings.maxPackageMb} MB limit for one upload.`,
    });
  }

  const options = readSharingOptions(req.body || {}, { required: true });
  if (options.error) {
    await cleanup();
    return res.status(400).json({ error: options.error });
  }

  // The client says which uploads its thumbnails belong to, in the order the
  // thumbnails were sent. Anything unclaimed is simply ignored.
  let thumbFor = [];
  try {
    thumbFor = JSON.parse(req.body.thumbFor || '[]');
    if (!Array.isArray(thumbFor)) thumbFor = [];
  } catch {
    thumbFor = [];
  }

  const single = uploaded.length === 1;
  const markdownNote = single && isMarkdownName(uploaded[0].originalname);

  const files = uploaded.map((f) => ({
    id: randomId(),
    name: String(f.originalname || 'download').slice(0, 255),
    mime: f.mimetype || 'application/octet-stream',
    size: f.size,
    hasThumb: false,
  }));

  const item = newItem({
    owner: req.user.id,
    title: cleanTitle(req.body.title, single ? uploaded[0].originalname : `${files.length} files`),
    kind: markdownNote ? KIND_MARKDOWN : KIND_FILE,
    files: markdownNote ? [] : files,
    mime: single ? files[0].mime : 'application/zip',
    size: total,
    ...options.values,
  });

  try {
    if (markdownNote) {
      // A lone .md keeps the markdown shape so it stays readable and editable.
      await fs.rename(uploaded[0].path, blobPath(item.id));
      await fs.chmod(blobPath(item.id), 0o600);
    } else {
      await fs.mkdir(blobPath(item.id), { recursive: true, mode: 0o700 });
      for (let i = 0; i < uploaded.length; i += 1) {
        await fs.rename(uploaded[i].path, filePath(item.id, files[i].id));
        await fs.chmod(filePath(item.id, files[i].id), 0o600);
      }

      for (let i = 0; i < thumbs.length; i += 1) {
        const target = files[thumbFor[i]];
        if (!target || thumbs[i].size > MAX_THUMB_BYTES) continue;
        const head = Buffer.alloc(4);
        const handle = await fs.open(thumbs[i].path, 'r');
        await handle.read(head, 0, 4, 0);
        await handle.close();
        if (!looksLikeImage(head)) continue;

        await fs.rename(thumbs[i].path, thumbPath(item.id, target.id));
        await fs.chmod(thumbPath(item.id, target.id), 0o600);
        target.hasThumb = true;
      }
    }
  } catch (err) {
    await purge(item.id);
    await cleanup();
    throw err;
  }

  await cleanup();
  await contentStore.write((data) => { data.items.push(item); });
  res.status(201).json({ item: await withShareUrl(req, item) });
});

router.get('/:id', async (req, res) => {
  const item = await contentStore.read((data) => {
    const found = ownedBy(data, req.params.id, req.user.id);
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
  const { title, body } = req.body || {};

  const options = readSharingOptions(req.body || {});
  if (options.error) return res.status(400).json({ error: options.error });

  const existing = await contentStore.read((data) => {
    const found = ownedBy(data, req.params.id, req.user.id);
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
    const item = ownedBy(data, req.params.id, req.user.id);
    if (!item) return null;
    if (title !== undefined) item.title = cleanTitle(title, item.title);
    if (body !== undefined) item.size = Buffer.byteLength(String(body), 'utf8');
    Object.assign(item, options.values);
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  });
  if (!updated) return res.status(404).json({ error: 'Content not found.' });

  res.json({ item: await withShareUrl(req, updated) });
});

/**
 * Issue a fresh share token, invalidating the old QR code and resetting the
 * counter. This is also how a share that has run out or expired is brought
 * back: give it a new limit and a new expiry and it works again, with the old
 * code permanently dead.
 */
router.post('/:id/rotate', async (req, res) => {
  const options = readSharingOptions(req.body || {});
  if (options.error) return res.status(400).json({ error: options.error });

  const updated = await contentStore.write((data) => {
    const item = ownedBy(data, req.params.id, req.user.id);
    if (!item) return null;
    item.token = randomToken();
    item.accessCount = 0;
    item.lastAccessAt = null;
    Object.assign(item, options.values);
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  });
  if (!updated) return res.status(404).json({ error: 'Content not found.' });

  res.json({ item: await withShareUrl(req, updated) });
});

router.delete('/:id', async (req, res) => {
  const item = await contentStore.read((data) => {
    const found = ownedBy(data, req.params.id, req.user.id);
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
      const found = ownedBy(data, req.params.id, req.user.id);
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

// ---- Owner access to stored bytes. None of this spends a QR access. --------

async function ownedItem(req) {
  return contentStore.read((data) => {
    const found = ownedBy(data, req.params.id, req.user.id);
    return found ? structuredClone(found) : null;
  });
}

/** Everything in the package, as a zip. */
router.get('/:id/zip', async (req, res, next) => {
  const item = await ownedItem(req);
  if (!item) return res.status(404).json({ error: 'Content not found.' });
  if (!item.files?.length) return res.status(400).json({ error: 'Nothing to download.' });
  await sendZip(res, item, next);
});

/** One file out of a package. */
router.get('/:id/files/:fileId', async (req, res, next) => {
  const item = await ownedItem(req);
  if (!item) return res.status(404).json({ error: 'Content not found.' });
  sendFile(res, item, req.params.fileId, next);
});

router.get('/:id/files/:fileId/thumb', async (req, res, next) => {
  const item = await ownedItem(req);
  if (!item) return res.status(404).json({ error: 'Content not found.' });
  sendThumb(res, item, req.params.fileId, next);
});

/** Single-file shares keep their original download path. */
router.get('/:id/download', async (req, res, next) => {
  const item = await ownedItem(req);
  if (!item) return res.status(404).json({ error: 'Content not found.' });

  if (item.kind === KIND_MARKDOWN) {
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition',
      `attachment; filename="${encodeURIComponent(`${item.title || 'note'}.md`)}"`);
    return createReadStream(blobPath(item.id)).on('error', next).pipe(res);
  }
  if (item.files.length === 1) return sendFile(res, item, item.files[0].id, next);
  return sendZip(res, item, next);
});

// ---- Shared senders, used by the owner, admin and public routes ------------

export async function sendZip(res, item, next) {
  try {
    const names = zipEntryNames(item.files);
    const { size, stream } = await buildZip(item.id, item.files, names);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition',
      `attachment; filename="${encodeURIComponent(zipFilename(item.title))}"`);
    // Known ahead of time because nothing is compressed, so the recipient gets
    // a real progress bar rather than an open-ended download.
    if (size >= 0) res.setHeader('Content-Length', String(size));

    stream.on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
}

export function sendFile(res, item, fileId, next) {
  const file = (item.files || []).find((f) => f.id === fileId);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition',
    `attachment; filename="${encodeURIComponent(file.name || 'download')}"`);
  return createReadStream(filePath(item.id, file.id)).on('error', next).pipe(res);
}

export function sendThumb(res, item, fileId, next) {
  const file = (item.files || []).find((f) => f.id === fileId);
  if (!file?.hasThumb) return res.status(404).json({ error: 'No preview available.' });

  // Served as an image regardless of what was uploaded: the stored bytes were
  // checked to be a JPEG or PNG, and a fixed type stops a mislabelled file
  // being interpreted as anything else.
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return createReadStream(thumbPath(item.id, file.id)).on('error', next).pipe(res);
}

export default router;
