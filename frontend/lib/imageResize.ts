/**
 * Downscale images in the browser before upload.
 *
 * The API accepts up to 50 MB across a product's four images, but sending
 * anywhere near that is a bad idea: images are stored as data URLs in Postgres
 * text columns, base64 inflates them by a third, and every shopper on mobile
 * data pays to download them. A phone photo is typically 3–8 MB and carries far
 * more resolution than a product card ever renders.
 *
 * Resizing here means a real listing lands around 200–400 KB, so the 50 MB
 * ceiling is a safety net rather than a target.
 */

export const MAX_IMAGES = 4;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const MAX_EDGE = 1600;   // plenty for a full-screen product view
const QUALITY  = 0.82;

/** Decoded byte size of a data URL. */
export function dataUrlBytes(src: string): number {
  const comma = src.indexOf(',');
  if (comma < 0) return src.length;
  const b64 = src.slice(comma + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Could not read the file'));
    fr.readAsDataURL(file);
  });
}

/**
 * Scale to fit within MAX_EDGE and re-encode as JPEG.
 *
 * Falls back to the original data URL if anything about the canvas path fails
 * (an exotic format, a browser that will not decode it) — a slightly larger
 * image is much better than a failed upload.
 */
export async function shrinkImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload  = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = original;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    // Already small enough and not needlessly re-encoded.
    if (scale === 1 && dataUrlBytes(original) < 500 * 1024) return original;

    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.width  * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const shrunk = canvas.toDataURL('image/jpeg', QUALITY);
    // Re-encoding a small PNG can grow it; keep whichever is smaller.
    return dataUrlBytes(shrunk) < dataUrlBytes(original) ? shrunk : original;
  } catch {
    return original;
  }
}

/** Process a picked FileList, enforcing the count and combined-size limits. */
export async function prepareImages(
  files: File[], existing: string[],
): Promise<{ images: string[]; error?: string }> {
  const room = MAX_IMAGES - existing.length;
  if (room <= 0) return { images: existing, error: `You can add at most ${MAX_IMAGES} images` };

  const accepted = [...existing];
  let error: string | undefined;

  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith('image/')) { error = 'Only image files can be added'; continue; }
    const shrunk = await shrinkImage(file);
    const total = [...accepted, shrunk].reduce((n, s) => n + dataUrlBytes(s), 0);
    if (total > MAX_TOTAL_BYTES) {
      error = `That would exceed the ${formatBytes(MAX_TOTAL_BYTES)} limit for all images`;
      break;
    }
    accepted.push(shrunk);
  }

  if (files.length > room && !error) error = `Only the first ${room} image(s) were added`;
  return { images: accepted, error };
}
