/**
 * Header helpers for serving stored files.
 */

/**
 * Recover a filename from a multipart upload.
 *
 * Browsers send multipart field names as UTF-8, but busboy — the parser under
 * multer — decodes them as latin-1 by default, and multer offers no way to
 * change that. Without this, "Budget Ünnep.xlsx" is stored as
 * "Budget Ãnnep.xlsx" and the recipient downloads a mangled name.
 *
 * The round-trip check makes the repair safe: bytes that are not valid UTF-8
 * are left exactly as they arrived, so a name that really was latin-1, or one
 * from a future parser that already decoded correctly, is never damaged.
 */
export function decodeUploadName(name) {
  const raw = String(name ?? '');
  const bytes = Buffer.from(raw, 'latin1');
  const utf8 = bytes.toString('utf8');
  return Buffer.from(utf8, 'utf8').equals(bytes) ? utf8 : raw;
}

/** Characters encodeURIComponent leaves alone but RFC 5987 does not allow. */
function encodeRfc5987(value) {
  return encodeURIComponent(value)
    .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * A Content-Disposition that survives spaces, quotes and non-ASCII names.
 *
 * Percent-encoding inside the quoted `filename` is wrong -- browsers save the
 * escapes literally, so the user ends up with "Q3%20Report.pdf" on disk. The
 * correct shape is a plain ASCII fallback plus an RFC 5987 `filename*`, which
 * every current browser prefers when both are present.
 */
export function attachmentDisposition(filename) {
  const name = String(filename || 'download').replace(/[\r\n]/g, '');

  const ascii = name
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
    || 'download';

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

/** Headers common to every stored-file response. */
export function setDownloadHeaders(res, { filename, mime, size }) {
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  // The body is attacker-influenced, so never let a browser sniff a type for it.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', attachmentDisposition(filename));
  if (size !== undefined && size !== null) res.setHeader('Content-Length', String(size));
}
