import crypto from 'node:crypto';
import fs from 'node:fs';
import { SECRET_FILE } from './paths.js';
import { usersStore, findById, publicUser } from './users.js';
import { getSettings } from './settings.js';

export const COOKIE_NAME = 'tc_session';

/**
 * The signing secret is persisted in the data volume so a container restart
 * does not log everybody out. It is created 0600 on first boot.
 */
function loadSecret() {
  try {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(SECRET_FILE, secret + '\n', { mode: 0o600 });
  return secret;
}

let secret;
function getSecret() {
  if (!secret) secret = loadSecret();
  return secret;
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

export function issueToken(user, sessionHours) {
  const payload = {
    // The immutable account id, not the address -- changing an email must not
    // sign anyone out, and must not let an old cookie follow a reused address.
    u: user.id,
    v: user.tokenVersion || 1,
    exp: Date.now() + sessionHours * 3600 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.', 2);
  const expected = sign(body);
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.u !== 'string' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(res, user) {
  const { sessionHours } = await getSettings();
  const token = issueToken(user, sessionHours);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE !== 'false',
    path: '/',
    maxAge: sessionHours * 3600 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict', httpOnly: true });
}

/** Populates req.user when a valid, current session cookie is present. */
export async function attachUser(req, res, next) {
  try {
    const payload = verifyToken(req.cookies?.[COOKIE_NAME]);
    if (payload) {
      const user = await usersStore.read((data) => {
        const found = findById(data, payload.u);
        // A password change bumps tokenVersion, invalidating older sessions.
        if (!found || (found.tokenVersion || 1) !== payload.v) return null;
        // An account whose address is no longer verified loses its session.
        if (!found.emailVerified) return null;
        return structuredClone(found);
      });
      if (user) req.user = user;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

export { publicUser };
