/**
 * Client-side avatar compression (HTML5 Canvas).
 * Center-crops to a square, scales down to at most MAX_SIDE x MAX_SIDE px, flattens transparency
 * onto white, then lowers the JPEG quality step by step until the result is under TARGET_BYTES.
 * The returned data URL is what gets stored in profiles.photo_url.
 */

export const MAX_SIDE = 256;
export const TARGET_BYTES = 200 * 1024;

export interface CompressOptions {
  maxSide?: number;
  targetBytes?: number;
}

/** Approximate decoded size of a base64 data URL, in bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadImage(file: File): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be read. Please try a different file.'));
    };
    img.src = url;
  });
}

export async function compressImageToDataUrl(file: File, options: CompressOptions = {}): Promise<string> {
  const maxSide = options.maxSide ?? MAX_SIDE;
  const targetBytes = options.targetBytes ?? TARGET_BYTES;

  const { img, release } = await loadImage(file);
  try {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('This image appears to be empty.');
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const out = Math.min(maxSide, side); // never upscale small images

    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process this image.');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);

    let quality = 0.85;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrlBytes(dataUrl) > targetBytes && quality > 0.3) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    if (dataUrlBytes(dataUrl) > targetBytes) {
      throw new Error('This image is too detailed to compress below 200 KB. Please choose another one.');
    }
    return dataUrl;
  } finally {
    release();
  }
}
