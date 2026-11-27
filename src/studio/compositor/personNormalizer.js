/**
 * Studio Person Normalizer
 * Normalizes visible person dimensions mathematically based on detected bounding boxes,
 * ensuring all participants appear proportionally sized, evenly spaced, and anchored to a common floor.
 */

/**
 * Calculates normalized layout metrics for a cropped person cutout.
 *
 * @param {HTMLCanvasElement} cutoutCanvas - The cropped person canvas in person space.
 * @param {Object} bounds - Bounding box metrics { normWidth, normHeight, detected }.
 * @param {Object} transform - Participant transform { x, baselineY, scale, zIndex }.
 * @param {number} sceneWidth - Logical scene width (e.g. 1280 or 1920).
 * @param {number} sceneHeight - Logical scene height (e.g. 720 or 1080).
 * @param {number} totalCount - Total number of active participants.
 */
export function normalizePersonCutout({
  cutoutCanvas,
  bounds,
  transform,
  sceneWidth = 1280,
  sceneHeight = 720,
  totalCount = 1,
}) {
  const count = Math.min(4, Math.max(1, totalCount || 1));
  const userScale = transform?.scale ?? 1.0;

  // Actual pixel dimensions of the cropped person cutout
  const cutoutW = cutoutCanvas?.width || 300;
  const cutoutH = cutoutCanvas?.height || 400;
  const personRatio = cutoutH > 0 ? cutoutW / cutoutH : 0.65;

  // Target visible person height in relation to studio scene height (with head safe area)
  let heightRatio = 0.80;
  if (count === 2) heightRatio = 0.76;
  else if (count === 3) heightRatio = 0.72;
  else if (count === 4) heightRatio = 0.68;

  const targetHeight = sceneHeight * heightRatio * userScale;
  const drawHeight = Math.round(targetHeight);
  const drawWidth = Math.round(targetHeight * personRatio);

  // Position person horizontally around centerX
  const posX = transform?.x ?? 0.5;
  const centerX = Math.round(posX * sceneWidth);
  const drawX = Math.round(centerX - drawWidth / 2);

  // Anchor bottom of person to the baseline (default 1.0 = flush with frame bottom)
  const baselineY = transform?.baselineY ?? 1.0;
  const floorY = Math.round(baselineY * sceneHeight);
  const drawY = Math.round(floorY - drawHeight);

  return {
    drawX,
    drawY,
    drawWidth,
    drawHeight,
    centerX,
    floorY,
    baselineY,
    zIndex: transform?.zIndex ?? 1,
  };
}
