import { asyncRouter } from '../lib/router.js';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import rateLimit from 'express-rate-limit';
import { blobPath } from '../lib/paths.js';
import { claimAccess, peekTicket, consumeTicket, purge, contentStore, KIND_MARKDOWN } from '../lib/content.js';

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

const GONE = {
  error: 'This link is no longer available.',
  reason: 'unavailable',
};

/**
 * Spend one QR access.
 *
 * Markdown comes back inline for rendering. Anything else returns a
 * short-lived ticket the browser redeems at /dl/:ticket. The access is spent
 * here, once; the ticket itself stays usable until it expires so an
 * interrupted download can be retried without spending another.
 */
router.get('/:token', claimLimiter, async (req, res, next) => {
  try {
    const result = await claimAccess(req.params.token);
    if (result.status === 'notfound') return res.status(404).json(GONE);
    if (result.status === 'exhausted') {
      return res.status(410).json({ error: 'This link has reached its access limit.', reason: 'exhausted' });
    }

    const { item, ticket } = result;
    const payload = {
      title: item.title,
      kind: item.kind,
      filename: item.filename,
      mime: item.mime,
      size: item.size,
      remaining: item.maxAccesses === null ? null : Math.max(0, item.maxAccesses - item.accessCount),
      unlimited: item.maxAccesses === null,
      willVanish: !!item.pendingDelete,
    };

    if (item.kind === KIND_MARKDOWN) {
      payload.body = await fs.readFile(blobPath(item.id), 'utf8');
      // Markdown is delivered in this response, so the ticket has no further
      // use -- spend it now to trigger any pending deletion.
      const entry = consumeTicket(ticket);
      if (entry?.deleteAfter) await purge(entry.id);
    } else {
      payload.ticket = ticket;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/dl/:ticket', async (req, res, next) => {
  try {
    // Peek rather than spend: a ticket stays usable for its short lifetime so
    // an interrupted or browser-blocked download can be retried.
    const entry = peekTicket(req.params.ticket);
    if (!entry) return res.status(410).json({ error: 'This download link has expired. Scan the code again.' });

    const item = await contentStore.read((data) => {
      const found = data.items.find((i) => i.id === entry.id);
      return found ? structuredClone(found) : null;
    });
    if (!item) return res.status(404).json(GONE);

    res.setHeader('Content-Type', item.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition',
      `attachment; filename="${encodeURIComponent(item.filename || item.title || 'download')}"`);

    const stream = createReadStream(blobPath(item.id));
    stream.on('error', next);
    // A self-destructing item is reaped when its ticket expires rather than on
    // first delivery, so a failed download can still be retried in the window.
    // sweepTickets() handles that; nothing to do once the bytes are sent.
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
