/**
 * Prepare a candidate photo in the browser: centre-crop to a square, shrink to
 * at most 400 px and re-encode as JPEG. A phone photo of several MB becomes
 * roughly 40–80 KB, which keeps ballots fast to load on slow connections and
 * means nothing oversized (or odd, like a huge PNG or HEIC) ever reaches the API.
 */

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const OUTPUT_PX = 400;
const MAX_OUTPUT_CHARS = 380_000; // stays under the API's 400 KB limit once decoded

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('decode')); img.src = url; });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("We couldn't read that picture. Please choose a JPG, PNG or WebP photo.");
  }
}

/** Returns a `data:image/jpeg;base64,…` URL ready to upload. Throws a plain-language Error. */
export async function prepareCandidatePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a picture file (JPG, PNG or WebP).');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That picture is too large. Please choose one under 15 MB.');

  const { source, width, height, close } = await decode(file);
  try {
    if (!width || !height) throw new Error("We couldn't read that picture. Please choose a JPG, PNG or WebP photo.");
    const side = Math.min(width, height);
    const size = Math.min(OUTPUT_PX, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("This browser can't prepare pictures. Please try a different browser.");
    ctx.fillStyle = '#ffffff'; // transparent PNGs flatten to white instead of black
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
    for (const quality of [0.85, 0.7, 0.55]) {
      const out = canvas.toDataURL('image/jpeg', quality);
      if (out.length <= MAX_OUTPUT_CHARS) return out;
    }
    throw new Error('That picture is too detailed to shrink enough. Please try a different photo.');
  } finally {
    close();
  }
}
