import crypto from 'node:crypto';
import { usersStore, normaliseEmail, EMAIL_RE, defaultDisplayName } from './users.js';
import { contentStore } from './content.js';

/**
 * One-time upgrade from the username-based schema to the email-based one.
 *
 * Old records were keyed by `username`, which was both the login identity and
 * the owner of every piece of content. Accounts now sign in with an email
 * address and own content through an immutable `id`.
 *
 * The migration is careful in two ways:
 *
 *   - Existing accounts are marked verified. Requiring verification
 *     retroactively would lock people out of a working instance.
 *   - Where the old username already looks like an email address it becomes
 *     the login address, which is exactly the shape an operator gets by
 *     renaming their account to their email before upgrading. Anything else
 *     is left without an address for an administrator to fill in, and is
 *     reported in the log rather than guessed at.
 */
export async function migrateToEmailIdentity() {
  const changes = { users: 0, content: 0, needEmail: [] };

  const idByUsername = await usersStore.write((data) => {
    const map = new Map();
    if (!Array.isArray(data.users)) return map;

    for (const user of data.users) {
      const legacyName = user.username;
      if (user.id && user.email !== undefined && !legacyName) continue;

      if (!user.id) {
        user.id = crypto.randomBytes(12).toString('hex');
        changes.users += 1;
      }

      if (legacyName) {
        map.set(String(legacyName).toLowerCase(), user.id);

        if (!user.email) {
          user.email = EMAIL_RE.test(legacyName) ? normaliseEmail(legacyName) : '';
        }
        if (!user.displayName) {
          user.displayName = EMAIL_RE.test(legacyName)
            ? defaultDisplayName(user.email)
            : legacyName;
        }
        delete user.username;
      }

      if (user.emailVerified === undefined) user.emailVerified = true;
      if (!user.displayName) user.displayName = defaultDisplayName(user.email);
      if (!user.email) changes.needEmail.push(user.displayName || user.id);
    }

    data.version = 2;
    return map;
  });

  if (idByUsername.size > 0) {
    await contentStore.write((data) => {
      for (const item of data.items) {
        const mapped = idByUsername.get(String(item.owner).toLowerCase());
        if (mapped && item.owner !== mapped) {
          item.owner = mapped;
          changes.content += 1;
        }
      }
    });
  }

  if (changes.users || changes.content) {
    console.log(`[migrate] moved ${changes.users} account(s) and `
      + `${changes.content} content item(s) to the email-based schema`);
  }
  for (const who of changes.needEmail) {
    console.warn(`[migrate] account "${who}" has no email address and cannot sign in. `
      + 'An administrator must set one from the Users screen.');
  }

  return changes;
}

/**
 * Guard against the one upgrade path that can brick an instance.
 *
 * If no account has an email address, nobody can sign in -- and first-run
 * setup will not re-open, because accounts do exist. Rather than leave someone
 * staring at a sign-in form that can never succeed, say exactly what happened
 * and exactly how to fix it.
 */
export async function warnIfNoUsableAccount() {
  const { total, usable } = await usersStore.read((data) => ({
    total: data.users.length,
    usable: data.users.filter((u) => u.email && u.emailVerified).length,
  }));

  if (total === 0 || usable > 0) return false;

  const line = '='.repeat(72);
  console.error(line);
  console.error(' No account can sign in: none of them has an email address.');
  console.error(line);
  console.error('');
  console.error('  Sign-in is by email address. These accounts were migrated from the');
  console.error('  old username-based schema, where the username was not an address.');
  console.error('');
  console.error('  To fix, edit credentials.json in the data volume and give the');
  console.error('  administrator an "email" field, for example:');
  console.error('');
  console.error('    {');
  console.error('      "id": "...",');
  console.error('      "email": "you@example.com",     <-- add this');
  console.error('      "emailVerified": true,          <-- and this');
  console.error('      "displayName": "...",');
  console.error('      ...');
  console.error('    }');
  console.error('');
  console.error('  Then restart the container and sign in with that address and your');
  console.error('  existing password. Content ownership is keyed on "id", so it is');
  console.error('  unaffected.');
  console.error(line);
  return true;
}
