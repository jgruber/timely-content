import crypto from 'node:crypto';

/** URL-safe random identifier. 24 bytes -> 32 chars, ~192 bits of entropy. */
export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Content ids are 12 random bytes as hex, matching the blobPath() guard. */
export function randomId() {
  return crypto.randomBytes(12).toString('hex');
}

export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
