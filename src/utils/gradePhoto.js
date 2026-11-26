import { applyPixelFilterAsync } from './pixelFilters.js';

export async function gradePhoto(source, filter, longEdge, signal) {
  const image = new Image();
  image.src = source;
  await image.decode();
  signal?.throwIfAborted();
  const scale = Math.min(1, longEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(filter.pixel) });
  if (!ctx) throw new Error('Photo grading is unavailable.');
  ctx.filter = filter.css || 'none';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  await applyPixelFilterAsync(ctx, filter.pixel, canvas.width, canvas.height);
  signal?.throwIfAborted();
  return canvas;
}
