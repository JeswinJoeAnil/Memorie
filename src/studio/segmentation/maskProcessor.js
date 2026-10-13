/**
 * Studio Mask Processor
 * High-performance bounding-box extraction, edge smoothing, and person cutout cropping.
 * Produces clean, transparent person cutouts in person space without raw webcam backgrounds or clipping.
 */

/**
 * Scans MediaPipe float confidence mask to locate the tight bounding box of the visible person.
 * Uses asymmetric temporal smoothing: instant expansion to capture fast arm/body movements,
 * smooth contraction to eliminate resting jitter.
 * Optimized: row-wise scan with integer math. Always stride 1 — stride-2 sampling
 * saved almost nothing but clipped shoulders on phones, so it is disabled.
 * Phone-first: generous top headroom for hair, wide fail-open fallback so a
 * missed detection shows the person instead of cutting them.
 */
export function extractPersonBoundingBox(
  floatMaskData,
  maskWidth,
  maskHeight,
  prevBounds = null,
  threshold = 0.35,
  paddingRatio = 0.10,
  stride = 1,
  topPaddingExtra = 0.06
) {
  let minX = maskWidth;
  let minY = maskHeight;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  // Stride is intentionally ignored (always exact scan). Kept in signature
  // for backwards compatibility with older callers.
  void stride;
  // Row-wise scan avoids per-pixel modulo/division
  for (let y = 0; y < maskHeight; y++) {
    const rowOff = y * maskWidth;
    for (let x = 0; x < maskWidth; x++) {
      if (floatMaskData[rowOff + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  // Fail-open fallback: show nearly the whole frame rather than a tight
  // box that cuts shoulders. Critical for phones where the person is close.
  const FALLBACK = {
    normX: 0.05,
    normY: 0.0,
    normWidth: 0.9,
    normHeight: 1.0,
    detected: false,
  };
  if (count < 20 || minX > maxX || minY > maxY) {
    if (prevBounds && prevBounds.detected) {
      return prevBounds;
    }
    return { ...FALLBACK };
  }

  // Add padding around person envelope to preserve hair, gestures, and shoulders.
  // Extra headroom on top: hair puffs up and the AI is least confident there.
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const padX = Math.round(boxW * paddingRatio);
  const padTop = Math.round(boxH * (paddingRatio + topPaddingExtra));
  const padBottom = Math.round(boxH * paddingRatio);

  const finalMinX = Math.max(0, minX - padX);
  const finalMinY = Math.max(0, minY - padTop);
  const finalMaxX = Math.min(maskWidth, maxX + padX);
  const finalMaxY = Math.min(maskHeight, maxY + padBottom);

  const rawNormX = finalMinX / maskWidth;
  const rawNormY = finalMinY / maskHeight;
  const rawNormW = Math.max(0.15, (finalMaxX - finalMinX) / maskWidth);
  const rawNormH = Math.max(0.20, (finalMaxY - finalMinY) / maskHeight);

  if (prevBounds && prevBounds.detected) {
    // Fast expansion (50% or instant) for quick arm raises and leans
    // Smooth contraction (25%) for stability
    const rawRight = rawNormX + rawNormW;
    const prevRight = prevBounds.normX + prevBounds.normWidth;
    const rawBottom = rawNormY + rawNormH;
    const prevBottom = prevBounds.normY + prevBounds.normHeight;

    const smoothFactorX = rawNormX < prevBounds.normX ? 0.65 : 0.25;
    const smoothFactorY = rawNormY < prevBounds.normY ? 0.65 : 0.25;
    const smoothFactorW = rawRight > prevRight ? 0.65 : 0.25;
    const smoothFactorH = rawBottom > prevBottom ? 0.65 : 0.25;

    const normX = prevBounds.normX * (1 - smoothFactorX) + rawNormX * smoothFactorX;
    const normY = prevBounds.normY * (1 - smoothFactorY) + rawNormY * smoothFactorY;
    const normWidth = prevBounds.normWidth * (1 - smoothFactorW) + rawNormW * smoothFactorW;
    const normHeight = prevBounds.normHeight * (1 - smoothFactorH) + rawNormH * smoothFactorH;

    return {
      normX,
      normY,
      normWidth,
      normHeight,
      detected: true,
    };
  }

  return {
    normX: rawNormX,
    normY: rawNormY,
    normWidth: rawNormW,
    normHeight: rawNormH,
    detected: true,
  };
}

/**
 * Applies temporal smoothing and soft Hermite edge feathering to generate an alpha mask.
 * Video-matting style recurrence: blends history with current frame using caller-supplied
 * alpha so motion stays responsive but edges don't flicker. Reuses targetImageData to
 * avoid per-frame GC. Writes white RGB + alpha only (mask canvas).
 */
export function buildSmoothMaskImageData(
  floatMaskData,
  maskWidth,
  maskHeight,
  prevMaskData = null,
  targetImageData = null,
  opts = {}
) {
  const totalPixels = maskWidth * maskHeight;
  let imgData = targetImageData;
  if (!imgData || imgData.width !== maskWidth || imgData.height !== maskHeight) {
    imgData = new ImageData(maskWidth, maskHeight);
  }
  const pixels = imgData.data;

  const temporalAlpha = typeof opts.temporalAlpha === 'number' ? opts.temporalAlpha : 0.7;
  const historyWeight = 1 - temporalAlpha;
  // Caller may pass thresholds per device tier
  const lowThresh = typeof opts.lowThresh === 'number' ? opts.lowThresh : 0.35;
  const highThresh = typeof opts.highThresh === 'number' ? opts.highThresh : 0.75;
  const invRange = 1 / Math.max(1e-4, highThresh - lowThresh);

  // Smoothing weights: history * (1-alpha) + current * alpha
  const useTemporal = prevMaskData && prevMaskData.length === totalPixels && historyWeight > 0;

  for (let i = 0; i < totalPixels; i++) {
    let conf = floatMaskData[i];

    if (useTemporal) {
      conf = prevMaskData[i] * historyWeight + conf * temporalAlpha;
      prevMaskData[i] = conf;
    } else if (prevMaskData && prevMaskData.length === totalPixels) {
      prevMaskData[i] = conf;
    }

    let alpha = 0;
    if (conf <= lowThresh) {
      alpha = 0;
    } else if (conf >= highThresh) {
      alpha = 255;
    } else {
      // Hermite smoothstep 3t^2 - 2t^3 for clean anti-aliasing
      const t = (conf - lowThresh) * invRange;
      alpha = (t * t * (3 - 2 * t) * 255) | 0;
    }

    const p = i * 4;
    // RGB stays white; only alpha matters. Skip rewriting RGB when reused
    // to save ~3/4 of the stores on steady frames.
    pixels[p + 3] = alpha;
    if (pixels[p] !== 255) {
      pixels[p] = 255;
      pixels[p + 1] = 255;
      pixels[p + 2] = 255;
    }
  }

  return imgData;
}

/**
 * Maps a normalized box from the square cover-fit AI input back to full-video
 * normalized coordinates.
 *
 * The AI sees a square crop of the video (cover-fit: the long edge is cropped,
 * typically top/bottom on portrait phones). The raw box is in that square's
 * space. Applying it directly to the full video shifts and squeezes it — on
 * phones this is what cut shoulders with a straight "barrier" edge.
 *
 * @param {Object} segBounds { normX, normY, normWidth, normHeight, detected }
 * @param {number} vW full video width
 * @param {number} vH full video height
 * @param {number} segSize square AI input size (e.g. 144/160/192)
 */
export function mapCoverFitBoundsToVideo(segBounds, vW, vH, segSize) {
  if (!segBounds || !vW || !vH || !segSize) return segBounds;
  const scale = Math.max(segSize / vW, segSize / vH);
  const dw = vW * scale;
  const dh = vH * scale;
  const dx = (segSize - dw) / 2;
  const dy = (segSize - dh) / 2;

  const sx0 = segBounds.normX * segSize;
  const sy0 = segBounds.normY * segSize;
  const sx1 = (segBounds.normX + segBounds.normWidth) * segSize;
  const sy1 = (segBounds.normY + segBounds.normHeight) * segSize;

  const vx0 = (sx0 - dx) / dw;
  const vy0 = (sy0 - dy) / dh;
  const vx1 = (sx1 - dx) / dw;
  const vy1 = (sy1 - dy) / dh;

  return {
    normX: vx0,
    normY: vy0,
    normWidth: Math.max(0.05, vx1 - vx0),
    normHeight: Math.max(0.05, vy1 - vy0),
    detected: !!segBounds.detected,
  };
}

/**
 * Phone-first expansion of a video-space box. Adds headroom + side margin,
 * enforces a minimum size for close-ups, and clamps to the frame.
 * Including extra (masked-transparent) background is safe — the alpha mask
 * hides it — while cutting a shoulder is permanent. So we err wide.
 */
export function expandVideoBoundsForPhone(videoBounds, opts = {}) {
  if (!videoBounds) return videoBounds;
  const topPad = typeof opts.topPad === 'number' ? opts.topPad : 0.07;
  const sidePad = typeof opts.sidePad === 'number' ? opts.sidePad : 0.05;
  const bottomPad = typeof opts.bottomPad === 'number' ? opts.bottomPad : 0.03;
  const minWidth = typeof opts.minWidth === 'number' ? opts.minWidth : 0.55;
  const minHeight = typeof opts.minHeight === 'number' ? opts.minHeight : 0.6;

  let { normX, normY, normWidth, normHeight, detected } = videoBounds;

  // Grow, keeping center stable
  const cx = normX + normWidth / 2;
  const cy = normY + normHeight / 2;
  let w = Math.max(normWidth + sidePad * 2, minWidth);
  let h = Math.max(normHeight + topPad + bottomPad, minHeight);
  // Never exceed the frame
  w = Math.min(1, w);
  h = Math.min(1, h);
  // Bias growth upward so hair fits: shift center up by half the top pad
  const upShift = topPad / 2 - bottomPad / 2;
  let nx = cx - w / 2;
  let ny = cy - h / 2 - upShift * 0.5;

  // Clamp into frame, preserving size where possible
  if (nx < 0) nx = 0;
  if (ny < 0) ny = 0;
  if (nx + w > 1) nx = Math.max(0, 1 - w);
  if (ny + h > 1) ny = Math.max(0, 1 - h);

  return { normX: nx, normY: ny, normWidth: w, normHeight: h, detected: !!detected };
}

/**
 * Clamps a normalized box into the [0,1] frame without growing it.
 * Use after mapping so an expanded seg-space box stays edge-aligned
 * with its mask counterpart.
 */
export function clampBoundsToFrame(bounds) {
  if (!bounds) return bounds;
  let { normX, normY, normWidth, normHeight, detected } = bounds;
  let w = Math.min(1, Math.max(0.05, normWidth));
  let h = Math.min(1, Math.max(0.05, normHeight));
  let nx = normX;
  let ny = normY;
  if (nx < 0) nx = 0;
  if (ny < 0) ny = 0;
  if (nx + w > 1) nx = Math.max(0, 1 - w);
  if (ny + h > 1) ny = Math.max(0, 1 - h);
  return { normX: nx, normY: ny, normWidth: w, normHeight: h, detected: !!detected };
}

/**
 * Crops and masks the video source to produce a clean, transparent person cutout in PERSON SPACE.
 * videoBounds are in full-video normalized space; maskBounds (optional) are in
 * mask-canvas normalized space. When the mask comes from a square cover-fit AI
 * input, the two spaces differ and BOTH must be supplied — using one box for
 * both is what clipped shoulders on portrait phones.
 * opts.smoothingQuality: 'low' | 'medium' | 'high' — preview uses low/medium, capture uses high.
 */
export function cropPersonCutout(
  videoElement,
  maskCanvas,
  bounds,
  outputCanvas,
  opts = {},
  maskBounds = null
) {
  const vW = videoElement.videoWidth || 640;
  const vH = videoElement.videoHeight || 480;

  const safeBounds = bounds || {
    normX: 0.10,
    normY: 0.05,
    normWidth: 0.80,
    normHeight: 0.90,
  };

  // Video source crop coordinates (in video pixel space)
  const vCropX = Math.max(0, Math.round(safeBounds.normX * vW));
  const vCropY = Math.max(0, Math.round(safeBounds.normY * vH));
  const vCropW = Math.min(vW - vCropX, Math.max(10, Math.round(safeBounds.normWidth * vW)));
  const vCropH = Math.min(vH - vCropY, Math.max(10, Math.round(safeBounds.normHeight * vH)));

  // Mask source crop coordinates (in mask canvas pixel space).
  // Uses the seg-space box when supplied; otherwise falls back to the video box
  // (correct only when the mask already covers the full video frame).
  const mb = maskBounds || safeBounds;
  const mW = maskCanvas.width || 256;
  const mH = maskCanvas.height || 256;
  const mCropX = Math.max(0, Math.round(mb.normX * mW));
  const mCropY = Math.max(0, Math.round(mb.normY * mH));
  const mCropW = Math.min(mW - mCropX, Math.max(1, Math.round(mb.normWidth * mW)));
  const mCropH = Math.min(mH - mCropY, Math.max(1, Math.round(mb.normHeight * mH)));

  if (outputCanvas.width !== vCropW || outputCanvas.height !== vCropH) {
    outputCanvas.width = vCropW;
    outputCanvas.height = vCropH;
  }

  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, vCropW, vCropH);

  // 1. Draw cropped region of the raw camera frame
  ctx.drawImage(videoElement, vCropX, vCropY, vCropW, vCropH, 0, 0, vCropW, vCropH);

  // 2. Apply destination-in alpha mask using the matching cropped region of the mask
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = opts.smoothingQuality || 'high';

  ctx.drawImage(maskCanvas, mCropX, mCropY, mCropW, mCropH, 0, 0, vCropW, vCropH);

  ctx.globalCompositeOperation = 'source-over';
  return outputCanvas;
}
