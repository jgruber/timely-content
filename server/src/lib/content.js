import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonStore } from './jsonstore.js';
import { INDEX_FILE, BLOB_DIR, blobPath } from './paths.js';
import { randomId, randomToken } from './tokens.js';

export const contentStore = new JsonStore(INDEX_FILE, { version: 1, items: [] });

export const KIND_MARKDOWN = 'markdown';
export const KIND_FILE = 'file';

/** Delivery tickets bridge "one access consumed" -> "bytes streamed". */
const tickets = new Map();
const TICKET_TTL_MS = 5 * 60 * 1000;

export function publicItem(item, url) {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    filename: item.filename,
    mime: item.mime,
    size: item.size,
    token: item.token,
    shareUrl: url,
    maxAccesses: item.maxAccesses,
    accessCount: item.accessCount,
    deleteOnExhaust: !!item.deleteOnExhaust,
    remaining: item.maxAccesses === null ? null : Math.max(0, item.maxAccesses - item.accessCount),
    exhausted: item.maxAccesses !== null && item.accessCount >= item.maxAccesses,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastAccessAt: item.lastAccessAt || null,
  };
}

export function newItem({ owner, title, kind, filename, mime, size, maxAccesses, deleteOnExhaust }) {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    owner,
    title,
    kind,
    filename: filename || null,
    mime: mime || null,
    size: size || 0,
    token: randomToken(),
    maxAccesses: maxAccesses ?? null,
    accessCount: 0,
    deleteOnExhaust: !!deleteOnExhaust,
    createdAt: now,
    updatedAt: now,
    lastAccessAt: null,
    pendingDelete: false,
  };
}

/** Parse a client-supplied access limit. null means unlimited. */
export function parseMaxAccesses(value) {
  if (value === null || value === undefined || value === '' || value === 'unlimited') return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
    return { error: 'Access limit must be a whole number between 1 and 1000000, or unlimited.' };
  }
  return { value: n };
}

export function ownedBy(data, id, username) {
  return data.items.find((i) => i.id === id && i.owner === username && !i.pendingDelete) || null;
}

/**
 * Consume one QR access for a share token.
 *
 * Returns { status, item, ticket } where status is 'ok', 'notfound' or
 * 'exhausted'. When the final permitted access is spent on an item flagged
 * deleteOnExhaust, the item is marked pendingDelete: it disappears from the
 * owner's list immediately and its bytes are removed once the recipient's
 * download ticket is redeemed or expires.
 */
export function claimAccess(token) {
  return contentStore.write(async (data) => {
    const item = data.items.find((i) => i.token === token && !i.pendingDelete);
    if (!item) return { status: 'notfound' };

    if (item.maxAccesses !== null && item.accessCount >= item.maxAccesses) {
      return { status: 'exhausted' };
    }

    item.accessCount += 1;
    item.lastAccessAt = new Date().toISOString();

    const nowExhausted = item.maxAccesses !== null && item.accessCount >= item.maxAccesses;
    if (nowExhausted && item.deleteOnExhaust) {
      item.pendingDelete = true;
    }

    const ticket = randomToken();
    tickets.set(ticket, {
      id: item.id,
      expires: Date.now() + TICKET_TTL_MS,
      deleteAfter: item.pendingDelete,
    });

    return { status: 'ok', item: structuredClone(item), ticket };
  });
}

/**
 * Look up a delivery ticket without spending it.
 *
 * The access was already charged at claim time, so the ticket stays valid for
 * its whole (short) lifetime. That lets the recipient retry a download that
 * was interrupted, or use the manual button when the browser blocked the
 * automatic one, without being told the link has expired.
 */
export function peekTicket(ticket) {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    tickets.delete(ticket);
    if (entry.deleteAfter) void purge(entry.id);
    return null;
  }
  return entry;
}

/** Spend a ticket outright, for content already delivered in full. */
export function consumeTicket(ticket) {
  const entry = peekTicket(ticket);
  if (entry) tickets.delete(ticket);
  return entry;
}

/**
 * Remove an item's index entry and blob. Safe to call more than once.
 *
 * This never rejects. Several callers are fire-and-forget (the ticket sweeper
 * runs on a bare timer), and an unhandled rejection would take the process
 * down -- exactly when the disk is already full or the volume has been
 * remounted read-only. A failure is logged and the item is left for the next
 * start-up sweep instead.
 */
export async function purge(id) {
  try {
    await contentStore.write((data) => {
      const idx = data.items.findIndex((i) => i.id === id);
      if (idx !== -1) data.items.splice(idx, 1);
    });
  } catch (err) {
    console.error(`[purge] could not update index for ${id}:`, err.message);
    return;
  }

  try {
    await fs.unlink(blobPath(id));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[purge] could not remove blob for ${id}:`, err.message);
    }
  }
}

/** Drop expired tickets and reap any pendingDelete items they were holding. */
export function sweepTickets() {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expires >= now) continue;
    tickets.delete(ticket);
    if (entry.deleteAfter) void purge(entry.id);
  }
}

/**
 * Start-up housekeeping.
 *
 * Tickets live in memory only, so anything marked pendingDelete before a
 * restart has no delivery window left and is reaped. Blobs are written before
 * their index entry, so a crash in between can strand a file with nothing
 * pointing at it -- those are removed too.
 */
export async function reapOrphans() {
  const stale = await contentStore.read((data) =>
    data.items.filter((i) => i.pendingDelete).map((i) => i.id));
  for (const id of stale) await purge(id);

  const known = new Set(await contentStore.read((data) => data.items.map((i) => i.id)));
  let files = [];
  try {
    files = await fs.readdir(BLOB_DIR);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  for (const name of files) {
    if (known.has(name)) continue;
    try {
      await fs.unlink(path.join(BLOB_DIR, name));
      console.log(`[init] removed orphaned blob ${name}`);
    } catch (err) {
      console.error(`[init] could not remove orphaned blob ${name}:`, err.message);
    }
  }
}
