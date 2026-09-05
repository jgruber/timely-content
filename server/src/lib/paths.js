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

/** Blob path for a content id. Ids are validated hex, so this cannot escape BLOB_DIR. */
export function blobPath(id) {
  if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('invalid content id');
  return path.join(BLOB_DIR, id);
}
