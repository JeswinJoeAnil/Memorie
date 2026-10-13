import { assetPhotos } from '../constants/assets.js';

/**
 * Truthful strip: only real user captures, never stock filler.
 * Always returns at most `mode` photos.
 */
export function getStripPhotos(captured, mode) {
  if (!Array.isArray(captured) || !Number.isFinite(mode) || mode <= 0) return [];
  return captured.slice(0, mode);
}

/**
 * Marketing preview only (Hero / template thumbnails).
 * Fills missing slots with bundled sample photos so the UI never looks broken.
 * Never use this for export.
 */
export function getPreviewPhotos(captured, mode) {
  if (!Number.isFinite(mode) || mode <= 0) return [];
  const list = Array.isArray(captured) ? captured : [];
  return Array.from({ length: mode }, (_, index) => {
    if (list[index]) return list[index];
    return assetPhotos[index % assetPhotos.length];
  });
}

export function isStripComplete(captured, mode) {
  return Array.isArray(captured) && captured.length >= mode && mode > 0;
}

export function missingPhotoCount(captured, mode) {
  if (!Array.isArray(captured)) return mode;
  return Math.max(0, mode - captured.length);
}
