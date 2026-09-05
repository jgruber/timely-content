import path from 'node:path';
import fs from 'node:fs';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || '/data');
export const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const CONTENT_DIR = path.join(DATA_DIR, 'content');
export const BLOB_DIR = path.join(CONTENT_DIR, 'blobs');
export const INDEX_FILE = path.join(CONTENT_DIR, 'index.json');
export const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
export const EMAIL_TOKENS_FILE = path.join(DATA_DIR, 'email-tokens.json');
export const TMP_DIR = path.join(CONTENT_DIR, '.tmp');

export const PORT = Number(process.env.PORT || 9080);

export function ensureDirs() {
  for (const dir of [DATA_DIR, CONTENT_DIR, BLOB_DIR, TMP_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ID_RE = /^[0-9a-f]{24}$/;

/**
 * Storage path for a content item. Ids are validated hex, so this can never
 * escape BLOB_DIR.
 *
 * A markdown note is a single file at this path. A file package is a
 * directory at this path holding one blob per member file.
 */
export function blobPath(id) {
  if (!ID_RE.test(id)) throw new Error('invalid content id');
  return path.join(BLOB_DIR, id);
}

/** Path to one member file inside a package. */
export function filePath(itemId, fileId) {
  if (!ID_RE.test(itemId)) throw new Error('invalid content id');
  if (!ID_RE.test(fileId)) throw new Error('invalid file id');
  return path.join(BLOB_DIR, itemId, fileId);
}

/** Path to a member file's thumbnail, if one was supplied. */
export function thumbPath(itemId, fileId) {
  if (!ID_RE.test(itemId)) throw new Error('invalid content id');
  if (!ID_RE.test(fileId)) throw new Error('invalid file id');
  return path.join(BLOB_DIR, itemId, `${fileId}.thumb`);
}
