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
  const state = availability(item);
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    files: (item.files || []).map((f) => ({
      id: f.id, name: f.name, mime: f.mime, size: f.size, hasThumb: !!f.hasThumb,
    })),
    fileCount: (item.files || []).length,
    mime: item.mime,
    size: item.size,
    token: item.token,
    shareUrl: url,
    maxAccesses: item.maxAccesses,
    accessCount: item.accessCount,
    expiresAt: item.expiresAt || null,
    deleteWhenFinished: !!item.deleteWhenFinished,
    remaining: item.maxAccesses === null ? null : Math.max(0, item.maxAccesses - item.accessCount),
    // One word for why a link no longer works, so the UI never has to
    // re-derive the rule: 'live' | 'exhausted' | 'expired'.
    state: state.state,
    available: state.available,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastAccessAt: item.lastAccessAt || null,
  };
}

/**
 * Whether a share link still works, and why not if it does not.
 *
 * Access count and expiry are independent gates: a link with unlimited uses
 * still stops at its expiry time, and a link with uses left still stops once
 * it expires. Whichever bites first wins.
 */
export function availability(item, now = Date.now()) {
  if (item.pendingDelete) return { available: false, state: 'gone' };
  if (item.expiresAt && Date.parse(item.expiresAt) <= now) {
    return { available: false, state: 'expired' };
  }
  if (item.maxAccesses !== null && item.accessCount >= item.maxAccesses) {
    return { available: false, state: 'exhausted' };
  }
  return { available: true, state: 'live' };
}

export function newItem({
  owner, title, kind, files, mime, size, maxAccesses, expiresAt, deleteWhenFinished,
}) {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    owner,
    title,
    kind,
    files: files || [],
    mime: mime || null,
    size: size || 0,
    token: randomToken(),
    maxAccesses: maxAccesses ?? null,
    accessCount: 0,
    expiresAt: expiresAt || null,
    deleteWhenFinished: !!deleteWhenFinished,
    createdAt: now,
    updatedAt: now,
    lastAccessAt: null,
    pendingDelete: false,
  };
}

/** Parse a client-supplied expiry. null means it never expires. */
export function parseExpiresAt(value) {
  if (value === null || value === undefined || value === '' || value === 'never') {
    return { value: null };
  }
  const when = Date.parse(value);
  if (Number.isNaN(when)) return { error: 'Expiry must be a date and time.' };
  if (when <= Date.now()) return { error: 'Expiry must be in the future.' };
  // Ten years is not a policy, just a guard against a fat-fingered year.
  if (when > Date.now() + 10 * 365 * 24 * 3600 * 1000) {
    return { error: 'Expiry is too far in the future.' };
  }
  return { value: new Date(when).toISOString() };
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

export function ownedBy(data, id, ownerId) {
  return data.items.find((i) => i.id === id && i.owner === ownerId && !i.pendingDelete) || null;
}

/**
 * Find an item regardless of who owns it. Only for administrator routes --
 * every owner-facing path must keep going through ownedBy().
 */
export function anyItem(data, id) {
  return data.items.find((i) => i.id === id && !i.pendingDelete) || null;
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

    const state = availability(item);
    if (!state.available) return { status: state.state };

    item.accessCount += 1;
    item.lastAccessAt = new Date().toISOString();

    // Re-evaluate now the count has moved: this access may have been the last
    // one, or the clock may have crossed the expiry in between.
    const finished = !availability(item).available;
    if (finished && item.deleteWhenFinished) item.pendingDelete = true;

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
    // A markdown note is a file here; a package is a directory. rm handles both.
    await fs.rm(blobPath(id), { recursive: true, force: true });
  } catch (err) {
    console.error(`[purge] could not remove stored data for ${id}:`, err.message);
  }
}

/**
 * Remove shares that have passed their expiry and asked to be deleted.
 *
 * Access limits are enforced when someone opens a link, but an expiry has no
 * such trigger -- a link nobody visits still has to stop existing on time.
 */
export async function sweepExpiredContent() {
  const now = Date.now();
  const due = await contentStore.read((data) => data.items
    .filter((i) => i.deleteWhenFinished
      && !i.pendingDelete
      && i.expiresAt
      && Date.parse(i.expiresAt) <= now)
    .map((i) => ({ id: i.id, title: i.title })));

  for (const item of due) {
    await purge(item.id);
    console.log(`[expiry] removed "${item.title}" (${item.id}) at its expiry`);
  }
  return due.length;
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
      // Either a stray markdown blob or a stray package directory.
      await fs.rm(path.join(BLOB_DIR, name), { recursive: true, force: true });
      console.log(`[init] removed orphaned blob ${name}`);
    } catch (err) {
      console.error(`[init] could not remove orphaned blob ${name}:`, err.message);
    }
  }
}
