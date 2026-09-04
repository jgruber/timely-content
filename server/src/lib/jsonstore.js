import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Serialised, atomically-written JSON file.
 *
 * Every mutation runs inside a promise chain so concurrent requests can never
 * interleave a read-modify-write. Writes go to a temp file in the same
 * directory and are renamed into place, so an external backup process never
 * observes a half-written file.
 */
export class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.cache = null;
    this.queue = Promise.resolve();
  }

  async #load() {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.cache = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.cache = structuredClone(this.defaults);
      await this.#persist(this.cache);
    }
    return this.cache;
  }

  async #persist(data) {
    const dir = path.dirname(this.file);
    const tmp = path.join(dir, `.${path.basename(this.file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }

  /** Run fn with exclusive access to the parsed data; returns fn's result. */
  read(fn) {
    return this.#run(async (data) => fn(data));
  }

  /** Run fn with exclusive access; persists the data afterwards. */
  write(fn) {
    return this.#run(async (data) => {
      const result = await fn(data);
      await this.#persist(data);
      return result;
    });
  }

  #run(fn) {
    const next = this.queue.then(async () => {
      const data = await this.#load();
      return fn(data);
    });
    // Keep the chain alive even when a caller's operation rejects.
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
}
