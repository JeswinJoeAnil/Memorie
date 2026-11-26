/**
 * Dramatic pixel-level effects engine for premium photobooth filters.
 * High-performance edition:
 * - Pre-computed LUTs and pre-generated noise tables
 * - Combined single-pass color transformation (curve + splitTone/duotone + tint + grain)
 * - Hardware-accelerated Canvas2D compositing for light leaks, vignette, and letterbox
 */

// ─── Math helpers ───

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function lerp(a, b, t) { return a + (b - a) * t; }

function seededRandom() {
  let state = 0x2f6e2b1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ─── Pre-computed Noise Table for Instant Grain (eliminates 8M+ random() calls) ───
const NOISE_SIZE = 8192;
const NOISE_TABLE = new Float32Array(NOISE_SIZE);
const noiseRandom = seededRandom();
for (let i = 0; i < NOISE_SIZE; i++) {
  NOISE_TABLE[i] = (noiseRandom() - 0.5) * 2;
}

// ─── Tone curve ───

function interpolateCurve(value, points) {
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    if (value >= points[i][0] && value <= points[i + 1][0]) {
      const t = (value - points[i][0]) / (points[i + 1][0] - points[i][0]);
      return Math.round(points[i][1] + t * (points[i + 1][1] - points[i][1]));
    }
  }
  return value;
}

function buildCurveLUT(points) {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = interpolateCurve(i, points);
  return lut;
}

// ─── Scanlines ───

function applyScanlines(d, width, height, config) {
  if (!config) return;
  const { opacity = 0.3, rgbShift } = config;
  const rowSize = width * 4;
  for (let y = 0; y < height; y += 2) {
    const off = y * rowSize;
    for (let x = 0; x < rowSize; x += 4) {
      const j = off + x;
      d[j]     = clamp(lerp(d[j], 0, opacity));
      d[j + 1] = clamp(lerp(d[j + 1], 0, opacity));
      d[j + 2] = clamp(lerp(d[j + 2], 0, opacity));
    }
  }
  if (rgbShift) {
    const shiftAmt = Math.min(Math.round(rgbShift), 4);
    for (let y = 0; y < height; y++) {
      const off = y * rowSize;
      for (let x = 0; x < rowSize; x += 4) {
        const i = off + x;
        if (y % 2 === 0) {
          const rIdx = Math.min(i + shiftAmt * 4, off + rowSize - 4);
          d[i] = d[rIdx];
        }
      }
    }
  }
}

// ─── Chromatic aberration ───

function applyChromaticAberration(d, width, height, amount) {
  if (!amount) return;
  const px = Math.max(1, Math.round(amount));
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const right = width - 1 - x;
      d[row + x * 4] = d[row + Math.min(width - 1, x + px) * 4];
      d[row + right * 4 + 2] = d[row + Math.max(0, right - px) * 4 + 2];
    }
  }
}

// ─── Glitch blocks ───

function applyGlitch(d, width, height, intensity) {
  const random = seededRandom();
  if (!intensity) return;
  const numBlocks = Math.floor(15 + intensity * 40);
  const copy = new Uint8ClampedArray(d);

  for (let b = 0; b < numBlocks; b++) {
    const bh = 3 + Math.floor(random() * 20);
    const by = Math.floor(random() * (height - bh));
    const offsetX = (Math.floor(random() * 60) - 30) * intensity;
    const bw = Math.floor(width * (0.05 + random() * 0.3));
    const bx = Math.floor(random() * (width - bw));
    for (let y = by; y < Math.min(height, by + bh); y++) {
      for (let x = bx; x < Math.min(width, bx + bw); x++) {
        const srcX = Math.max(0, Math.min(width - 1, x + Math.round(offsetX)));
        const si = (y * width + srcX) * 4;
        const di = (y * width + x) * 4;
        d[di] = copy[si]; d[di + 1] = copy[si + 1]; d[di + 2] = copy[si + 2];
      }
    }
  }

  if (intensity > 0.2) {
    const numSwap = Math.floor(5 + intensity * 20);
    for (let b = 0; b < numSwap; b++) {
      const bh = 2 + Math.floor(random() * 12);
      const by = Math.floor(random() * (height - bh));
      const bx = Math.floor(random() * width);
      const bw = Math.floor(width * (0.03 + random() * 0.15));
      for (let y = by; y < Math.min(height, by + bh); y++) {
        for (let x = bx; x < Math.min(width, bx + bw); x++) {
          const i = (y * width + x) * 4;
          const tmp = d[i]; d[i] = d[i + 2]; d[i + 2] = tmp;
        }
      }
    }
  }
}

// ─── Dust & scratches ───

function applyDust(d, width, height, amount) {
  const random = seededRandom();
  if (!amount) return;
  const totalPx = width * height;
  const specks = Math.floor(totalPx * amount * 0.015);
  for (let i = 0; i < specks; i++) {
    const idx = Math.floor(random() * totalPx) * 4;
    const v = random() > 0.5 ? 255 : Math.floor(180 + random() * 60);
    d[idx] = v; d[idx + 1] = v; d[idx + 2] = v;
  }
  const scratches = Math.floor(amount * 4);
  for (let i = 0; i < scratches; i++) {
    let sx = Math.floor(random() * width);
    let sy = Math.floor(random() * height);
    const len = 15 + Math.floor(random() * 40);
    for (let j = 0; j < len; j++) {
      sx = Math.min(width - 1, Math.max(0, sx + Math.floor(random() * 3 - 1)));
      sy = Math.min(height - 1, Math.max(0, sy + (random() > 0.7 ? 1 : 0)));
      const idx = (sy * width + sx) * 4;
      const v = 220 + Math.floor(random() * 35);
      d[idx] = v; d[idx + 1] = v; d[idx + 2] = v;
    }
  }
}

// ─── Fast GPU-style Canvas Overlay Compositors (Zero per-pixel sqrt) ───

function drawLightLeakOverlay(ctx, width, height, config) {
  const random = seededRandom();
  if (!config) return;
  const { count = 2, opacity = 0.25, color = [255, 200, 100] } = config;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let l = 0; l < count; l++) {
    const cx = (0.2 + random() * 0.6) * width;
    const cy = (0.1 + random() * 0.4) * height;
    const radius = Math.max(width, height) * (0.35 + random() * 0.35);
    const [lr, lg, lb] = color;
    const alpha = opacity * (0.6 + random() * 0.4);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, ${alpha})`);
    grad.addColorStop(0.5, `rgba(${lr}, ${lg}, ${lb}, ${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

function drawVignetteOverlay(ctx, width, height, strength) {
  if (!strength) return;
  ctx.save();
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.hypot(cx, cy);

  const grad = ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR * 0.95);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, `rgba(0, 0, 0, ${Math.min(0.9, strength * 1.2)})`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawLetterboxOverlay(ctx, width, height, fraction) {
  if (!fraction) return;
  const barH = Math.max(1, Math.floor(height * fraction));
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, barH);
  ctx.fillRect(0, height - barH, width, barH);
  ctx.restore();
}

// ─── Main Optimized Entry Point ───

export function processPixels(d, pixel, width, height) {
  const len = d.length;

  // Pre-calculate LUTs
  const curveLUT = pixel.curve ? buildCurveLUT(pixel.curve) : null;
  const hasDuotone = !!pixel.duotone;
  const duotoneShadow = hasDuotone ? pixel.duotone.shadow : null;
  const duotoneHigh = hasDuotone ? pixel.duotone.highlight : null;

  const hasSplitTone = !hasDuotone && !!pixel.splitTone;
  const st = hasSplitTone ? pixel.splitTone : null;
  const stBal = hasSplitTone ? (st.balance ?? 0.5) : 0.5;
  const stAmt = hasSplitTone ? (st.amount ?? 0.3) : 0.3;
  const stShadows = hasSplitTone ? st.shadows : null;
  const stHighlights = hasSplitTone ? st.highlights : null;

  const hasTint = !!pixel.tint;
  const tintColor = hasTint ? pixel.tint.color : null;
  const tintStrength = hasTint ? (pixel.tint.strength ?? 0.1) : 0;

  const grainAmount = pixel.grain ? pixel.grain * 255 : 0;
  let noiseIdx = 0;

  // ── Combined Single-Pass Color Transformation ──
  // Merges curve, duotone, splitTone, tint, and grain into 1 linear loop
  for (let i = 0; i < len; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // 1. Tone curve
    if (curveLUT) {
      r = curveLUT[r];
      g = curveLUT[g];
      b = curveLUT[b];
    }

    // 2. Duotone or SplitTone
    if (hasDuotone) {
      const luma = (r * 77 + g * 150 + b * 29) >> 8;
      const t = luma / 255;
      r = lerp(duotoneShadow[0], duotoneHigh[0], t);
      g = lerp(duotoneShadow[1], duotoneHigh[1], t);
      b = lerp(duotoneShadow[2], duotoneHigh[2], t);
    } else if (hasSplitTone) {
      const luma = (r * 77 + g * 150 + b * 29) >> 8;
      const t = luma / 255;
      const sw = Math.max(0, 1 - t / stBal) * stAmt;
      const hw = Math.max(0, (t - stBal) / (1 - stBal)) * stAmt;
      r += (stShadows[0] - r) * sw + (stHighlights[0] - r) * hw;
      g += (stShadows[1] - g) * sw + (stHighlights[1] - g) * hw;
      b += (stShadows[2] - b) * sw + (stHighlights[2] - b) * hw;
    }

    // 3. Tint
    if (hasTint) {
      r = lerp(r, tintColor[0], tintStrength);
      g = lerp(g, tintColor[1], tintStrength);
      b = lerp(b, tintColor[2], tintStrength);
    }

    // 4. Fast Grain (table-lookup)
    if (grainAmount) {
      const n = NOISE_TABLE[noiseIdx++ & (NOISE_SIZE - 1)] * grainAmount;
      r += n;
      g += n;
      b += n;
    }

    d[i]     = r < 0 ? 0 : (r > 255 ? 255 : (r | 0));
    d[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : (g | 0));
    d[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : (b | 0));
  }

  // 5. Chromatic aberration (if enabled)
  if (pixel.chromaticAberration) {
    applyChromaticAberration(d, width, height, pixel.chromaticAberration);
  }

  // 6. Glitch blocks (if enabled)
  if (pixel.glitch) {
    applyGlitch(d, width, height, pixel.glitch);
  }

  // 7. Scanlines (if enabled)
  if (pixel.scanlines) {
    applyScanlines(d, width, height, pixel.scanlines);
  }

  // 8. Dust & scratches (if enabled)
  if (pixel.dust) {
    applyDust(d, width, height, pixel.dust);
  }

}

export function drawOverlays(ctx, pixel, width, height) {
  if (pixel.lightLeak) {
    drawLightLeakOverlay(ctx, width, height, pixel.lightLeak);
  }

  if (pixel.vignette) {
    drawVignetteOverlay(ctx, width, height, pixel.vignette);
  }

  if (pixel.letterbox) {
    drawLetterboxOverlay(ctx, width, height, pixel.letterbox);
  }
}

