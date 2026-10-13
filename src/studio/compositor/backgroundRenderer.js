/**
 * Studio Background Renderer v2 — cached static layer.
 * The studio backdrop (gradient + glow + floor + custom image) is static for
 * many frames, so we pre-render it once to an offscreen canvas keyed by
 * background id + size + glow toggle. Per-frame cost becomes one drawImage.
 * Visual output is identical to the uncached version.
 */

const _imageCache = new Map();
const MAX_BG_CACHE = 4;
// Prerendered full-scene backgrounds: key -> canvas
const _sceneCache = new Map();
const MAX_SCENE_CACHE = 6;

function cacheKey(url) {
  if (!url) return url;
  if (url.startsWith('data:')) return `data:${url.slice(0, 48)}:${url.length}`;
  return url;
}

function sceneKey(background, width, height, enableGlow) {
  const id = background?.id || background?.customImageUrl?.slice(0, 32) || 'default';
  const grad = Array.isArray(background?.gradient) ? background.gradient.join('|') : '';
  const glow = enableGlow && Array.isArray(background?.ambientGlow)
    ? background.ambientGlow.map((g) => `${g.x},${g.y},${g.color},${g.radius}`).join('|')
    : 'noglw';
  const floor = background?.floorColor || '';
  const custom = background?.customImageUrl ? cacheKey(background.customImageUrl) : '';
  return `${id}::${width}x${height}::${grad}::${glow}::${floor}::${custom}`;
}

function paintScene(ctx, background, width, height, enableGlow, imageReadyCb) {
  // 1. Custom Image Background
  if (background?.customImageUrl) {
    const fallbackGrad = ['#2d1b4e', '#1a0a2e', '#0d0520'];
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    fallbackGrad.forEach((color, i) => {
      grad.addColorStop(i / (fallbackGrad.length - 1), color);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const key = cacheKey(background.customImageUrl);
    const cached = _imageCache.get(key);
    if (cached?.complete && cached.naturalWidth > 0) {
      // Cover-fit custom image (no stretch)
      const iw = cached.naturalWidth, ih = cached.naturalHeight;
      const scale = Math.max(width / iw, height / ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(cached, (width - dw) / 2, (height - dh) / 2, dw, dh);
    } else if (!cached) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { try { imageReadyCb?.(); } catch {} };
      img.onerror = () => _imageCache.delete(key);
      img.src = background.customImageUrl;
      _imageCache.set(key, img);
      if (_imageCache.size > MAX_BG_CACHE) {
        const oldest = _imageCache.keys().next().value;
        _imageCache.delete(oldest);
      }
    } else if (cached && !cached.complete) {
      // Still loading: hook onload once to invalidate scene cache
      if (!cached._hooked) {
        cached._hooked = true;
        cached.addEventListener('load', () => { try { imageReadyCb?.(); } catch {} }, { once: true });
      }
    }
    return;
  }

  // 2. Preset Gradient Background
  const defaultGrad = ['#2d1b4e', '#1a0a2e', '#0d0520'];
  const gradientColors =
    background && Array.isArray(background.gradient) && background.gradient.length > 0
      ? background.gradient
      : defaultGrad;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  gradientColors.forEach((color, i) => {
    grad.addColorStop(i / (gradientColors.length - 1), color);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 3. Ambient Lighting (skipped entirely on performance tier)
  if (enableGlow !== false && background?.ambientGlow) {
    background.ambientGlow.forEach((glow) => {
      const gx = glow.x * width;
      const gy = glow.y * height;
      const radius = (glow.radius / 800) * width;
      if (radius <= 0) return;
      const gRad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      gRad.addColorStop(0, glow.color);
      gRad.addColorStop(1, 'transparent');
      ctx.fillStyle = gRad;
      ctx.fillRect(0, 0, width, height);
    });
  }

  // 4. Studio Floor Plane
  const floorColor = background?.floorColor || 'rgba(192, 132, 252, 0.06)';
  const floorGrad = ctx.createLinearGradient(0, height * 0.62, 0, height);
  floorGrad.addColorStop(0, 'transparent');
  floorGrad.addColorStop(1, floorColor);
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draws the photographic studio backdrop. Uses a cached prerender when possible.
 * opts: { enableGlow?: boolean, onInvalidate?: () => void }
 * Backwards compatible: drawStudioBackground(ctx, bg, w, h)
 */
export function drawStudioBackground(ctx, background, width, height, opts = {}) {
  if (!ctx) return;
  const enableGlow = opts.enableGlow !== false;

  // Custom images still loading can't be cached long-term; paint direct but cheap.
  // Once loaded, onInvalidate clears the scene cache so next frame prerenders.
  const key = sceneKey(background, width, height, enableGlow);
  let cached = _sceneCache.get(key);
  if (cached && cached.width === width && cached.height === height) {
    ctx.drawImage(cached, 0, 0);
    // If custom image just finished loading after cache creation, refresh once
    return;
  }

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d');
  if (!octx) {
    // Fallback: paint direct
    paintScene(ctx, background, width, height, enableGlow, opts.onInvalidate);
    return;
  }
  paintScene(octx, background, width, height, enableGlow, () => {
    _sceneCache.delete(key);
    try { opts.onInvalidate?.(); } catch {}
  });
  _sceneCache.set(key, off);
  if (_sceneCache.size > MAX_SCENE_CACHE) {
    const oldest = _sceneCache.keys().next().value;
    _sceneCache.delete(oldest);
  }
  ctx.drawImage(off, 0, 0);
}

/** Clear cached scenes (e.g. on tier change or memory pressure). */
export function invalidateBackgroundCache() {
  _sceneCache.clear();
}
