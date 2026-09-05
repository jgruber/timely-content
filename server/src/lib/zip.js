import yazl from 'yazl';
import { filePath } from './paths.js';

/**
 * Package downloads as a zip.
 *
 * Nothing is deflated: photos, video and PDFs are already compressed, so
 * deflate would burn CPU across the whole payload for close to nothing.
 * Storing also makes the archive size knowable before any bytes are sent,
 * which is what lets the response carry a real Content-Length -- and so gives
 * the recipient a true progress bar rather than an open-ended spinner on a
 * phone connection.
 */

/**
 * Make member names unique and safe.
 *
 * Two photos very easily arrive as IMG_0001.jpg twice, and a zip holding
 * duplicate names extracts unpredictably, so later collisions get a numeric
 * suffix. Separators are flattened as well, so no entry can write outside the
 * folder it is extracted into.
 */
export function zipEntryNames(files) {
  const used = new Set();

  return files.map((file) => {
    const cleaned = String(file.name || 'file')
      .replace(/[\\/]+/g, '_')
      .replace(/^\.+/, '_')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f]/g, '')
      .slice(0, 200) || 'file';

    if (!used.has(cleaned)) {
      used.add(cleaned);
      return cleaned;
    }

    const dot = cleaned.lastIndexOf('.');
    const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
    const ext = dot > 0 ? cleaned.slice(dot) : '';
    let n = 2;
    while (used.has(`${stem} (${n})${ext}`)) n += 1;
    const candidate = `${stem} (${n})${ext}`;
    used.add(candidate);
    return candidate;
  });
}

/**
 * Build the archive and report its exact size before any bytes are sent.
 *
 * yazl computes the total up front when every entry is stored with a known
 * size, which is always true here. Asking it beats hand-computing the header
 * arithmetic: the layout stays yazl's business, so any extra field it chooses
 * to emit can never put the response a byte out of step with Content-Length.
 *
 * Resolves to { size, stream }; size is -1 if it could not be determined.
 */
export function buildZip(itemId, files, names) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    zip.outputStream.on('error', reject);

    files.forEach((file, i) => {
      zip.addFile(filePath(itemId, file.id), names[i], {
        compress: false,
        size: file.size,
      });
    });

    zip.end((size) => resolve({ size, stream: zip.outputStream }));
  });
}

/** Turn a package title into a sensible download filename. */
export function zipFilename(title) {
  const safe = String(title || 'files')
    .replace(/[^a-zA-Z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'files';
  return `${safe}.zip`;
}
