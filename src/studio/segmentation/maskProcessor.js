/**
 * Studio Mask Processor
 * High-performance bounding-box extraction, edge smoothing, and person cutout cropping.
 * Produces clean, transparent person cutouts in person space without raw webcam backgrounds or clipping.
 */

/**
 * Scans MediaPipe float confidence mask to locate the tight bounding box of the visible person.
 * Uses asymmetric temporal smoothing: instant expansion to capture fast arm/body movements,
 * smooth contraction to eliminate resting jitter.
 * Optimized: row-wise scan with integer math + stride-2 sampling for small masks.
 */
export function extractPersonBoundingBox(
  floatMaskData,
  maskWidth,
  maskHeight,
  prevBounds = null,
  threshold = 0.35,
  paddingRatio = 0.08,
  stride = 1
) {
  let minX = maskWidth;
  let minY = maskHeight;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  const step = stride > 1 ? stride : 1;
  // Row-wise scan avoids per-pixel modulo/division
  for (let y = 0; y < maskHeight; y += step) {
    const rowOff = y * maskWidth;
    for (let x = 0; x < maskWidth; x += step) {
      if (floatMaskData[rowOff + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  // Fallback if no person is detected
  if (count < 20 || minX > maxX || minY > maxY) {
    if (prevBounds && prevBounds.detected) {
      return prevBounds;
    }
    return {
      normX: 0.10,
      normY: 0.05,
      normWidth: 0.80,
      normHeight: 0.90,
      detected: false,
    };
  }

  // Add padding around person envelope to preserve hair, gestures, and shoulders
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const padX = Math.round(boxW * paddingRatio);
  const padY = Math.round(boxH * paddingRatio);

  const finalMinX = Math.max(0, minX - padX);
  const finalMinY = Math.max(0, minY - padY);
  const finalMaxX = Math.min(maskWidth, maxX + padX);
  const finalMaxY = Math.min(maskHeight, maxY + padY);

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
 * Crops and masks the video source to produce a clean, transparent person cutout in PERSON SPACE.
 * Correctly translates between intrinsic video coordinates and mask coordinates.
 * opts.smoothingQuality: 'low' | 'medium' | 'high' — preview uses low/medium, capture uses high.
 */
export function cropPersonCutout(
  videoElement,
  maskCanvas,
  bounds,
  outputCanvas,
  opts = {}
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

  // Mask source crop coordinates (in mask canvas pixel space)
  const mW = maskCanvas.width || 256;
  const mH = maskCanvas.height || 256;
  const mCropX = Math.max(0, Math.round(safeBounds.normX * mW));
  const mCropY = Math.max(0, Math.round(safeBounds.normY * mH));
  const mCropW = Math.min(mW - mCropX, Math.max(1, Math.round(safeBounds.normWidth * mW)));
  const mCropH = Math.min(mH - mCropY, Math.max(1, Math.round(safeBounds.normHeight * mH)));

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
