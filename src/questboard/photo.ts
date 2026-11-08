// Shrinks a camera photo to a small JPEG data URL before it is sent for checking.
// Smaller images upload faster on mobile data and cost less per AI check.
export const PHOTO_MAX_EDGE = 1024;
export const PHOTO_QUALITY = 0.8;
// The copy kept in the player's Bestiary collection.
export const CAPTURE_MAX_EDGE = 640;
export const CAPTURE_QUALITY = 0.75;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* fall back to an image element */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('That photo could not be opened. Try a JPEG or PNG photo.');
  }
}

export async function photoToDataUrl(file: File, maxEdge = PHOTO_MAX_EDGE, quality = PHOTO_QUALITY): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo to submit.');
  const image = await decode(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this photo.');
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    image.close();
  }
}
