import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export const PASSWORD_MIN = 10;

export function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > 512) return 'Password is too long.';
  return null;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, PARAMS.keylen, PARAMS);
  return [
    'scrypt', PARAMS.N, PARAMS.r, PARAMS.p,
    salt.toString('base64'), Buffer.from(key).toString('base64'),
  ].join('$');
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(expected, Buffer.from(actual));
  } catch {
    return false;
  }
}
