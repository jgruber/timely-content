import { JsonStore } from './jsonstore.js';
import { CREDENTIALS_FILE } from './paths.js';
import { hashPassword } from './passwords.js';
import { DEFAULT_PREFS } from './appearance.js';

export const usersStore = new JsonStore(CREDENTIALS_FILE, { version: 1, users: [] });

export const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/;

export function findUser(data, username) {
  if (typeof username !== 'string') return null;
  const wanted = username.toLowerCase();
  return data.users.find((u) => u.username.toLowerCase() === wanted) || null;
}

export function publicUser(user) {
  return {
    username: user.username,
    isAdmin: !!user.isAdmin,
    prefs: { ...DEFAULT_PREFS, ...(user.prefs || {}) },
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

export function newUserRecord({ username, passwordHash, isAdmin }) {
  return {
    username,
    passwordHash,
    isAdmin: !!isAdmin,
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
 * Normally the first administrator is created through the web setup screen.
 * Setting BOTH ADMIN_USERNAME and ADMIN_PASSWORD seeds that account instead,
 * so an instance can come up unattended. It only ever runs when no users
 * exist, and never invents a password of its own.
 */
export async function seedAdminFromEnv() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;

  const passwordHash = await hashPassword(password);
  return usersStore.write((data) => {
    if (data.users.length > 0) return null;
    if (!USERNAME_RE.test(username)) {
      console.error(`[init] ADMIN_USERNAME "${username}" is not a valid username; skipping seed.`);
      return null;
    }
    const record = newUserRecord({ username, passwordHash, isAdmin: true });
    data.users.push(record);
    return { username: record.username };
  });
}
