import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Build identity, read from the server's own package.json at start-up.
 *
 * Surfaced so a user can quote an exact version in a bug report rather than
 * guessing, and so the issue link can point at the right repository even on a
 * fork.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

function readPackage() {
  for (const candidate of ['../../package.json', '../../../package.json']) {
    try {
      return JSON.parse(fs.readFileSync(path.resolve(here, candidate), 'utf8'));
    } catch { /* try the next location */ }
  }
  return {};
}

const pkg = readPackage();

/** Turn npm's "git+https://host/owner/repo.git" into a browsable URL. */
function browsableRepo(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url || '';
  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '')
    || '';
}

export const VERSION = pkg.version || 'unknown';
export const REPOSITORY_URL = browsableRepo(pkg.repository);
export const ISSUES_URL = pkg.bugs?.url || (REPOSITORY_URL ? `${REPOSITORY_URL}/issues` : '');
export const STARTED_AT = new Date().toISOString();
