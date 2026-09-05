import crypto from 'node:crypto';
import { JsonStore } from './jsonstore.js';
import { CREDENTIALS_FILE } from './paths.js';
import { hashPassword } from './passwords.js';
import { DEFAULT_PREFS } from './appearance.js';

/**
 * Accounts.
 *
 * The email address is the login identity: it is what a person types to sign
 * in, and it must be unique. It is also mutable, so it is deliberately NOT the
 * key that content ownership hangs off -- every account carries an immutable
 * `id` for that. Changing an address then costs nothing and cannot orphan a
 * user's library.
 */

export const usersStore = new JsonStore(CREDENTIALS_FILE, { version: 2, users: [] });

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DISPLAY_NAME_MAX = 60;

export function normaliseEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function validateEmail(email) {
  const value = normaliseEmail(email);
  if (!value) return 'An email address is required.';
  if (value.length > 254) return 'That email address is too long.';
  if (!EMAIL_RE.test(value)) return 'That does not look like an email address.';
  return null;
}

/** Display names are cosmetic; fall back to the part before the @. */
export function defaultDisplayName(email) {
  return normaliseEmail(email).split('@')[0] || 'user';
}

export function findByEmail(data, email) {
  const wanted = normaliseEmail(email);
  if (!wanted) return null;
  return data.users.find((u) => normaliseEmail(u.email) === wanted) || null;
}

export function findById(data, id) {
  if (!id) return null;
  return data.users.find((u) => u.id === id) || null;
}

export function emailTaken(data, email, exceptId) {
  const wanted = normaliseEmail(email);
  if (!wanted) return false;
  return data.users.some((u) => normaliseEmail(u.email) === wanted && u.id !== exceptId);
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || defaultDisplayName(user.email),
    isAdmin: !!user.isAdmin,
    emailVerified: !!user.emailVerified,
    prefs: { ...DEFAULT_PREFS, ...(user.prefs || {}) },
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

export function newUserRecord({ email, displayName, passwordHash, isAdmin, emailVerified }) {
  const address = normaliseEmail(email);
  return {
    id: crypto.randomBytes(12).toString('hex'),
    email: address,
    displayName: String(displayName || '').trim().slice(0, DISPLAY_NAME_MAX)
      || defaultDisplayName(address),
    passwordHash,
    isAdmin: !!isAdmin,
    // Everyone but the very first administrator has to prove the address works
    // before the account can be used.
    emailVerified: !!emailVerified,
    tokenVersion: 1,
    prefs: { ...DEFAULT_PREFS },
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
}

export function countUsers() {
  return usersStore.read((data) => data.users.length);
}

/**
 * Optional non-interactive seeding for automated deployments.
 *
 * Setting ADMIN_EMAIL and ADMIN_PASSWORD together creates the first
 * administrator on an empty instance, already verified, so a container can
 * come up unattended. It never runs once any account exists.
 */
export async function seedAdminFromEnv() {
  const email = normaliseEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  if (validateEmail(email)) {
    console.error(`[init] ADMIN_EMAIL "${email}" is not a valid address; skipping seed.`);
    return null;
  }

  const passwordHash = await hashPassword(password);
  return usersStore.write((data) => {
    if (data.users.length > 0) return null;
    const record = newUserRecord({
      email,
      displayName: process.env.ADMIN_NAME,
      passwordHash,
      isAdmin: true,
      emailVerified: true,
    });
    data.users.push(record);
    return { email: record.email };
  });
}
