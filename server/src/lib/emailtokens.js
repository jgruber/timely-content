import crypto from 'node:crypto';
import { JsonStore } from './jsonstore.js';
import { EMAIL_TOKENS_FILE } from './paths.js';

/**
 * Single-use tokens emailed to a user, for two purposes:
 *
 *   'reset'  -- choose a new password after forgetting it
 *   'verify' -- prove the address works before the account may sign in
 *
 * Only a SHA-256 hash is stored. The raw token exists in the recipient's inbox
 * and nowhere else, so a leaked copy of the data volume cannot be replayed to
 * take over an account.
 */

export const tokenStore = new JsonStore(EMAIL_TOKENS_FILE, { version: 1, tokens: [] });

export const RESET = 'reset';
export const VERIFY = 'verify';

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function prune(data, now = Date.now()) {
  data.tokens = data.tokens.filter((t) => t.expires > now && !t.usedAt);
}

/**
 * Issue a token. Returns the raw value -- the only moment it is recoverable.
 * Issuing supersedes any outstanding token of the same purpose for that user,
 * so an inbox full of old links cannot be mined later.
 */
export async function issueToken(userId, purpose, ttlMinutes) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();

  await tokenStore.write((data) => {
    prune(data, now);
    data.tokens = data.tokens.filter(
      (t) => !(t.userId === userId && t.purpose === purpose),
    );
    data.tokens.push({
      userId,
      purpose,
      tokenHash: hash(token),
      createdAt: new Date(now).toISOString(),
      expires: now + ttlMinutes * 60 * 1000,
      usedAt: null,
    });
  });

  return token;
}

function match(data, token, purpose) {
  const wanted = hash(token);
  const now = Date.now();
  return data.tokens.find(
    (t) => t.tokenHash === wanted && t.purpose === purpose && !t.usedAt && t.expires > now,
  ) || null;
}

/** Validate without spending, so a screen can show a dead link early. */
export function peekToken(token, purpose) {
  if (!token) return null;
  return tokenStore.read((data) => {
    const found = match(data, token, purpose);
    return found ? { userId: found.userId, expires: found.expires } : null;
  });
}

/** Spend a token. Returns the user id, or null when it is not usable. */
export function consumeToken(token, purpose) {
  if (!token) return null;
  return tokenStore.write((data) => {
    const found = match(data, token, purpose);
    if (!found) {
      prune(data);
      return null;
    }
    found.usedAt = new Date().toISOString();
    const { userId } = found;
    prune(data);
    return userId;
  });
}

/** Drop outstanding tokens for a user; one purpose, or all of them. */
export function revokeFor(userId, purpose = null) {
  return tokenStore.write((data) => {
    data.tokens = data.tokens.filter(
      (t) => !(t.userId === userId && (purpose === null || t.purpose === purpose)),
    );
    prune(data);
  });
}

export function sweepExpired() {
  return tokenStore.write((data) => prune(data));
}
