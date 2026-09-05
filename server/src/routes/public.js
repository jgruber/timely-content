import fs from 'node:fs/promises';
import rateLimit from 'express-rate-limit';
import { asyncRouter } from '../lib/router.js';
import { blobPath } from '../lib/paths.js';
import {
  claimAccess, peekTicket, consumeTicket, purge, contentStore, KIND_MARKDOWN,
} from '../lib/content.js';
import { sendZip, sendFile, sendThumb } from './content.js';

const router = asyncRouter();

// Share tokens carry ~192 bits of entropy; the limiter is here to make
// brute-force scanning pointless rather than to protect a weak secret.
const claimLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const GONE = { error: 'This link is no longer available.', reason: 'unavailable' };

const REASONS = {
  exhausted: { status: 410, error: 'This link has reached its access limit.', reason: 'exhausted' },
  expired: { status: 410, error: 'This link has expired.', reason: 'expired' },
  gone: { status: 404, ...GONE },
};

/**
 * Spend one QR access.
 *
 * One access covers the whole share, however many files are in it. Charging
 * per file would make a limit of "one view" meaningless the moment somebody
 * shared twenty photos. Markdown comes back inline; anything else returns a
 * manifest plus a short-lived ticket, and every file fetch rides that same
 * ticket without spending anything more.
 */
router.get('/:token', claimLimiter, async (req, res, next) => {
  try {
    const result = await claimAccess(req.params.token);
    if (result.status === 'notfound') return res.status(404).json(GONE);
    if (result.status !== 'ok') {
      const reason = REASONS[result.status] || REASONS.gone;
      return res.status(reason.status).json(reason);
    }

    const { item, ticket } = result;
    const payload = {
      title: item.title,
      kind: item.kind,
      mime: item.mime,
      size: item.size,
      remaining: item.maxAccesses === null ? null : Math.max(0, item.maxAccesses - item.accessCount),
      unlimited: item.maxAccesses === null,
      expiresAt: item.expiresAt || null,
      willVanish: !!item.pendingDelete,
    };

    if (item.kind === KIND_MARKDOWN) {
      payload.body = await fs.readFile(blobPath(item.id), 'utf8');
      // Delivered in full here, so the ticket has no further use.
      const entry = consumeTicket(ticket);
      if (entry?.deleteAfter) await purge(entry.id);
    } else {
      payload.ticket = ticket;
      payload.files = item.files.map((f) => ({
        id: f.id, name: f.name, mime: f.mime, size: f.size, hasThumb: !!f.hasThumb,
      }));
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/**
 * Resolve a ticket to its item.
 *
 * Peek rather than spend: a ticket stays usable for its short lifetime so a
 * recipient can fetch several files, retry an interrupted download, and take
 * the zip as well, all on the one access they already paid for.
 */
async function itemForTicket(ticket) {
  const entry = peekTicket(ticket);
  if (!entry) return null;
  const item = await contentStore.read((data) => {
    const found = data.items.find((i) => i.id === entry.id);
    return found ? structuredClone(found) : null;
  });
  return item ? { entry, item } : null;
}

const EXPIRED_TICKET = {
  error: 'This download link has expired. Scan the code again.',
};

/** The whole package as a zip. */
router.get('/dl/:ticket', async (req, res, next) => {
  const found = await itemForTicket(req.params.ticket);
  if (!found) return res.status(410).json(EXPIRED_TICKET);
  if (!found.item.files?.length) return res.status(404).json(GONE);
  await sendZip(res, found.item, next);
});

/** One file out of the package. */
router.get('/dl/:ticket/:fileId', async (req, res, next) => {
  const found = await itemForTicket(req.params.ticket);
  if (!found) return res.status(410).json(EXPIRED_TICKET);
  sendFile(res, found.item, req.params.fileId, next);
});

router.get('/dl/:ticket/:fileId/thumb', async (req, res, next) => {
  const found = await itemForTicket(req.params.ticket);
  if (!found) return res.status(410).json(EXPIRED_TICKET);
  sendThumb(res, found.item, req.params.fileId, next);
});

export default router;
