/**
 * Thumbnails, made in the browser.
 *
 * The picture has already been decoded to show the user their selection, so
 * downscaling it costs almost nothing here — and it keeps a native image
 * library off the server entirely. "Can the browser decode it" is also the
 * right test for whether a preview is possible at all: an iPhone HEIC that
 * Safari will not render is exactly the file a server-side thumbnailer would
 * produce a preview nobody else can see.
 */

const THUMB_MAX = 320;
const THUMB_QUALITY = 0.72;
const TOO_BIG_TO_DECODE = 40 * 1024 * 1024;

/** Types every current browser can decode. HEIC is deliberately absent. */
const THUMBNAILABLE = /^image\/(jpeg|png|gif|webp|bmp|avif)$/i;

export function canThumbnail(file) {
  return THUMBNAILABLE.test(file.type || '') && file.size <= TOO_BIG_TO_DECODE;
}

/**
 * Produce a small JPEG for a picture, or null when it cannot be decoded.
 * Never throws: a missing preview is a cosmetic loss, not a failed upload.
 */
export async function makeThumbnail(file) {
  if (!canThumbnail(file)) return null;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', THUMB_QUALITY);
    });
    if (!blob) return null;

    return { blob, width, height };
  } catch {
    return null;
  }
}

/** A local preview URL for the picker. Caller must revoke it. */
export function previewUrl(file) {
  return canThumbnail(file) ? URL.createObjectURL(file) : null;
}
