import { asset } from '../constants/assets.js';
import { applyPixelFilterAsync } from './pixelFilters.js';

/**
 * Doodles are stored normalized (0-1) so preview and export match at any size.
 * Legacy paths stored raw pixels in ~380-wide space — scale those uniformly.
 */
export function doodlePointToExport(p, baseW, baseH, fallbackWidth = 380) {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  if (Math.abs(p.x) <= 1.5 && Math.abs(p.y) <= 1.5) {
    return { x: p.x * baseW, y: p.y * baseH };
  }
  const s = baseW / (fallbackWidth || 380);
  return { x: p.x * s, y: p.y * s };
}

export function doodleWidthToExport(path, baseW) {
  const fallback = path?.previewWidth || 380;
  const size = Number(path?.size) || 6;
  return size * (baseW / fallback);
}

function drawDoodles(ctx, doodlePaths, baseW, baseH) {
  if (!doodlePaths) return;
  doodlePaths.forEach((path) => {
    if (!path.points || path.points.length < 2) return;
    const pts = path.points
      .map((p) => doodlePointToExport(p, baseW, baseH, path.previewWidth))
      .filter(Boolean);
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = path.color;
    ctx.lineWidth = doodleWidthToExport(path, baseW);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (path.shadow) {
      ctx.shadowBlur = path.shadow * (baseW / (path.previewWidth || 380));
      ctx.shadowColor = path.color;
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

/**
 * Grade one photo in isolation so background / text / stickers keep true colors.
 * Matches preview (CSS on <img>) + premium pixel grade on photo pixels only.
 */
async function makeGradedPhotoCanvas(img, w, h, filter, fit, zoom) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  const g = c.getContext('2d');
  if (!g) return c;
  g.filter = filter?.css || 'none';
  if (fit === 'contain') {
    const r = Math.min(w / img.width, h / img.height);
    const dw = img.width * r;
    const dh = img.height * r;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawCover(g, img, 0, 0, w, h, zoom);
  }
  g.filter = 'none';
  if (filter?.pixel) {
    await applyPixelFilterAsync(g, filter.pixel, c.width, c.height);
  }
  return c;
}

/**
 * Renders the photostrip to a canvas for export.
 * Includes all photos, filters, decorations, and doodles.
 */
export async function renderExport({
  frame,
  photos,
  filter,
  accent,
  decorations,
  doodlePaths,
  zoom,
  rotation,
  vignette,
  fitSettings,
  photoScales,
  timestamp,
  stripBackground,
  previewScale = 1,
  previewWidth = 380,
  stripElement = null,
}) {
  // ── Custom Template Export ──
  if (frame.type === 'custom') {
    return renderCustomTemplateExport({
      frame, photos, filter, accent, decorations, doodlePaths,
      zoom, rotation, vignette, fitSettings, photoScales, timestamp,
      stripElement,
    });
  }

  // ── Use the classic 900px-wide export layout for a premium strip look ──
  // The strip is rendered at 900px wide with generous margins/padding,
  // matching the original design. Sticker positions are measured from the
  // live preview DOM and remapped to this export coordinate space.
  const baseW = 900;
  // Match CSS columns: magazine, chrome, and camera frames use a 2-column grid
  const columns = (frame.id === 'magazine' || frame.id === 'chrome' || frame.id === 'camera') ? 2 : 1;
  const gap = 36;
  const margin = 80;
  const topPadding = 110;
  const bottomPadding = 150;

  const slotW = columns === 2 ? (baseW - margin * 2 - gap) / 2 : baseW - margin * 2;
  // Standard 4:3 ratio (0.75) for photos
  const slotH = slotW * 0.75;

  const rows = Math.ceil(photos.length / columns);
  // Calculate baseH dynamically based on rows to ensure all photos fit perfectly
  const baseH = topPadding + bottomPadding + (gap * (rows - 1)) + (slotH * rows);

  // Calculate bounds including photostrip (0,0 to baseW,baseH) and all decorations
  let minX = 0;
  let minY = 0;
  let maxX = baseW;
  let maxY = baseH;

  if (decorations) {
    decorations.forEach(deco => {
      const dx = (deco.x / 100) * baseW;
      const dy = (deco.y / 100) * baseH;
      // Approximate size for bounds (300px buffer for large stickers)
      const buffer = 300 * Math.max(deco.scaleX || 1, deco.scaleY || 1);
      minX = Math.min(minX, dx - buffer);
      minY = Math.min(minY, dy - buffer);
      maxX = Math.max(maxX, dx + buffer);
      maxY = Math.max(maxY, dy + buffer);
    });
  }

  // Add extra padding to ensure nothing is cut off
  const padding = 60;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  // CAP CANVAS SIZE to prevent memory crashes
  // Mobile devices have strict limits (Max 3500px for safety)
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const MAX_DIM = isMobile ? 3500 : 8000;

  let width = maxX - minX;
  let height = maxY - minY;
  let renderScale = 1;

  if (width > MAX_DIM || height > MAX_DIM) {
    renderScale = Math.min(MAX_DIM / width, MAX_DIM / height);
    width *= renderScale;
    height *= renderScale;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Could not get canvas context');

  ctx.save();
  ctx.scale(renderScale, renderScale);
  ctx.translate(-minX, -minY);

  // Draw the strip background
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  if (stripBackground?.type === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, 0, baseH);
    grad.addColorStop(0, stripBackground.from);
    grad.addColorStop(1, stripBackground.to);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = stripBackground?.value || (frame.id === 'chrome' || frame.id === 'camera' ? '#d6d4cc' : (frame.id === 'doodle' ? '#111' : '#f7eee6'));
  }
  ctx.fillRect(0, 0, baseW, baseH);
  ctx.restore();

  // Accent header
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(0, 0, baseW, 70);
  ctx.globalAlpha = 1;

  // Pre-load all required images in parallel to speed up rendering and avoid timeouts
  const photoPromises = photos.map(src => src ? loadImage(src) : Promise.resolve(null));
  const stickerPromises = (decorations || [])
    .filter(d => d.type === 'sticker' && d.isImage)
    .map(d => loadImage(asset(d.content)).catch(err => {
      console.warn('Failed to pre-load sticker:', d.content, err);
      return null;
    }));

  const [loadedPhotos, loadedStickers] = await Promise.all([
    Promise.all(photoPromises),
    Promise.all(stickerPromises)
  ]);

  // Draw Photos (each graded in isolation — background/text stay true)
  for (let index = 0; index < photos.length; index += 1) {
    const img = loadedPhotos[index];
    if (!img) continue;

    const col = columns === 2 ? index % 2 : 0;
    const row = columns === 2 ? Math.floor(index / 2) : index;
    const x = margin + col * (slotW + gap);
    const y = topPadding + row * (slotH + gap);
    const fit = fitSettings?.[index] || 'cover';
    const graded = await makeGradedPhotoCanvas(img, slotW, slotH, filter, fit, zoom);

    ctx.save();
    ctx.translate(x + slotW / 2, y + slotH / 2);
    ctx.rotate((rotation + (index % 2 ? 1.5 : -1.2)) * Math.PI / 180);

    const pScale = photoScales?.[index] || { x: 1, y: 1 };
    ctx.scale(pScale.x, pScale.y);

    ctx.fillStyle = '#151515';
    ctx.shadowColor = 'rgba(0,0,0,.3)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.fillRect(-slotW / 2 - 10, -slotH / 2 - 10, slotW + 20, slotH + 20);
    ctx.shadowColor = 'transparent';

    ctx.drawImage(graded, -slotW / 2, -slotH / 2, slotW, slotH);
    ctx.restore();
  }

  // Vignette overlay
  const gradient = ctx.createRadialGradient(baseW / 2, baseH / 2, 80, baseW / 2, baseH / 2, baseW / 1.15);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${vignette / 180})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, baseW, baseH);

  // Footer text — original 900px design
  ctx.font = '700 54px Georgia';
  ctx.fillStyle = frame.id === 'doodle' ? '#f5f0e7' : '#141414';
  ctx.fillText('memorie+', 58, baseH - 88);
  ctx.font = '24px monospace';
  ctx.fillStyle = frame.id === 'doodle' ? '#f5f0e7' : '#252525';
  ctx.fillText(`${timestamp.time}  ${timestamp.date}`, baseW - 390, baseH - 54);

  const canvasScale = baseW / 380;
  let stickerIdx = 0;

  // Measure the live preview strip so decals land exactly where the user sees them.
  // The preview wraps the strip in a CSS scale+rotate transform, so we temporarily
  // clear that transform and read the .decorations-layer geometry in true layout
  // coordinates (this also picks up any framer drag offset exactly as displayed).
  const measured = new Map();
  if (stripElement) {
    const layer = stripElement.querySelector('.decorations-layer');
    if (layer) {
      const prevTransform = stripElement.style.transform;
      stripElement.style.transform = 'none';
      const lr = layer.getBoundingClientRect();
      if (lr.width > 0 && lr.height > 0) {
        for (const deco of decorations) {
          const node = stripElement.querySelector(`[data-deco-id="${deco.id}"]`);
          if (!node) continue;
          const r = node.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          measured.set(deco.id, {
            cx: ((r.left + r.width / 2 - lr.left) / lr.width) * baseW,
            cy: ((r.top + r.height / 2 - lr.top) / lr.height) * baseH,
            w: (r.width / lr.width) * baseW,
            h: (r.height / lr.height) * baseH,
          });
        }
      }
      stripElement.style.transform = prevTransform;
    }
  }

  // Draw Decorations
  if (decorations) {
    for (const deco of decorations) {
      const baseFontSize = (deco.isSmall ? 10 : 13) * canvasScale;
      const sX = deco.scaleX ?? 1;
      const sY = deco.scaleY ?? 1;

      let cx = null;
      let cy = null;
      let bw = null; // measured border-box width in export units
      let bh = null; // measured border-box height in export units

      const m = measured.get(deco.id);
      if (m) {
        cx = m.cx;
        cy = m.cy;
        bw = m.w;
        bh = m.h;
      }

      if (cx == null) cx = (deco.x / 100) * baseW;
      if (cy == null) cy = (deco.y / 100) * baseH;

      if (deco.type === 'text') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((deco.rotation * Math.PI) / 180);
        const fs = deco.showBg === false && bh != null && bh > 0 ? bh : baseFontSize;
        ctx.font = `900 ${fs}px ${deco.font || 'Inter'}, sans-serif`;
        if (deco.showBg !== false) {
          ctx.fillStyle = deco.bgColor || '#ff5aaf';
          const textWidth = ctx.measureText(deco.content).width;
          const h = bh ?? (baseFontSize * 1.5);
          const w = bw ?? (textWidth + (baseFontSize * 1.2));
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
          ctx.fill();
        }
        ctx.fillStyle = deco.color || '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(deco.content, 0, 0);
        ctx.restore();
      } else if (deco.type === 'sticker') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((deco.rotation * Math.PI) / 180);

        if (deco.isImage) {
          const sImg = loadedStickers[stickerIdx++];
          if (sImg) {
            const w = bw ?? 100 * sX * canvasScale;
            const h = bh ?? (sImg.height / sImg.width) * (100 * sY * canvasScale);
            if (deco.showBg !== false) {
              ctx.fillStyle = deco.bgColor || '#ff5aaf';
              const bgPadding = 12 * Math.max(sX, sY) * canvasScale;
              ctx.beginPath();
              ctx.roundRect(-w / 2 - bgPadding, -h / 2 - bgPadding, w + bgPadding * 2, h + bgPadding * 2, bgPadding);
              ctx.fill();
            }
            // When measured, the DOM box includes the sticker's padding; strip it so
            // the artwork sits centered inside the box just like the preview.
            const iw = bw != null ? Math.max(1, w - 16 * sX) : w;
            const ih = bh != null ? Math.max(1, h - 16 * sY) : h;
            ctx.drawImage(sImg, -iw / 2, -ih / 2, iw, ih);
          }
        } else {
          const fs = deco.showBg === false && bh != null && bh > 0 ? bh : baseFontSize;
          ctx.font = `900 ${fs}px Fraunces, serif`;
          if (deco.showBg !== false) {
            ctx.fillStyle = deco.bgColor || '#ff5aaf';
            const textWidth = ctx.measureText(deco.content).width;
            const h = bh ?? (baseFontSize * 1.5);
            const w = bw ?? (textWidth + (baseFontSize * 1.2));
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
          } else {
            ctx.fillStyle = deco.isChrome ? '#111' : '#4e1534';
          }
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(deco.content, 0, 0);
        }
        ctx.restore();
      }
    }
  }

  // Draw Doodles (normalized — matches preview position + thickness)
  drawDoodles(ctx, doodlePaths, baseW, baseH);

  ctx.restore();

  // Note: pixel grading already applied per-photo in makeGradedPhotoCanvas,
  // so background / text / stickers keep true colors (matches preview).

  return canvas;
}

export function loadImage(src) {
  if (!src) return Promise.reject(new Error('Image source is missing'));
  return new Promise((resolve, reject) => {
    const image = new Image();
    const isDataUrl = typeof src === 'string' && src.startsWith('data:');
    const isBlobUrl = typeof src === 'string' && src.startsWith('blob:');
    const isSameOrigin = typeof src === 'string' && src.startsWith(window.location.origin);

    // Only set crossOrigin if it's likely a cross-origin request
    if (!isDataUrl && !isBlobUrl && !isSameOrigin) {
      image.crossOrigin = 'anonymous';
    }

    image.onload = () => resolve(image);
    image.onerror = (e) => {
      console.error(`Failed to load image: ${src.substring(0, 80)}...`, e);
      reject(new Error(`Failed to load image asset`));
    };
    image.src = src;
  });
}

export function drawCover(ctx, image, x, y, width, height, zoom = 1) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = image.width, sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  const z = Math.max(0.7, zoom);
  const zw = width * z, zh = height * z;
  ctx.drawImage(image, sx, sy, sw, sh, x - (zw - width) / 2, y - (zh - height) / 2, zw, zh);
}

/**
 * Renders a custom PNG overlay template to a canvas for export.
 * Photos are drawn at the defined slot positions, then the template PNG is overlaid.
 */
async function renderCustomTemplateExport({
  frame,
  photos,
  filter,
  accent,
  decorations,
  doodlePaths,
  zoom,
  rotation,
  vignette,
  fitSettings,
  photoScales,
  timestamp,
  stripElement,
}) {
  // Load the template overlay image — frame.image is eagerly-imported URL, fallback to asset() for string paths
  const rawSrc = frame.image || frame.imagePath;
  const templateImgSrc = rawSrc?.startsWith?.('data:') || rawSrc?.startsWith?.('blob:') || rawSrc?.startsWith?.('/') || rawSrc?.startsWith?.('http') ? rawSrc : asset(rawSrc);
  const templateImg = await loadImage(templateImgSrc);

  // Use template's native dimensions for the canvas
  const baseW = templateImg.width;
  const baseH = templateImg.height;

  // CAP CANVAS SIZE to prevent memory crashes
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const MAX_DIM = isMobile ? 3500 : 8000;

  let width = baseW;
  let height = baseH;
  let renderScale = 1;

  if (width > MAX_DIM || height > MAX_DIM) {
    renderScale = Math.min(MAX_DIM / width, MAX_DIM / height);
    width = Math.ceil(width * renderScale);
    height = Math.ceil(height * renderScale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Could not get canvas context');

  ctx.save();
  ctx.scale(renderScale, renderScale);

  // Pre-load all photos
  const loadedPhotos = await Promise.all(
    photos.map(src => src ? loadImage(src).catch(() => null) : Promise.resolve(null))
  );

  // Draw photos at slot positions
  const slots = frame.photoSlots || [];
  for (let i = 0; i < slots.length; i++) {
    const img = loadedPhotos[i];
    if (!img) continue;

    const slot = slots[i];
    const sx = slot.x * baseW;
    const sy = slot.y * baseH;
    const sw = slot.w * baseW;
    const sh = slot.h * baseH;

    const tilt = slot.rot !== undefined ? slot.rot : (frame.tilt || 0);
    ctx.save();
    // Move to slot center and apply template tilt before clipping — matches Preview's slot rotate
    ctx.translate(sx + sw / 2, sy + sh / 2);
    ctx.rotate((tilt * Math.PI) / 180);
    ctx.beginPath();
    if (frame.id === 'custom-capturing-moments') {
      // Oval clip for the Capturing Moments template (centered at 0,0)
      ctx.ellipse(0, 0, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    } else {
      // Rounded rect clip (scaled to canvas resolution)
      const r = (slot.borderRadius ? parseInt(slot.borderRadius, 10) : 14) * (baseW / 380);
      if (ctx.roundRect) {
        ctx.roundRect(-sw / 2, -sh / 2, sw, sh, r);
      } else {
        ctx.rect(-sw / 2, -sh / 2, sw, sh);
      }
    }
    ctx.clip();

    // Draw photo inside the tilted clipped slot with user rotation/zoom/scale
    // Graded in isolation so template overlay colors stay true.
    const fit = fitSettings?.[i] || 'cover';
    const graded = await makeGradedPhotoCanvas(img, sw, sh, filter, fit, zoom);
    ctx.save();
    ctx.rotate((rotation * Math.PI) / 180);
    const pScale = photoScales?.[i] || { x: 1, y: 1 };
    ctx.scale(pScale.x, pScale.y);

    ctx.drawImage(graded, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
    ctx.restore();
  }

  // Draw the template overlay on top
  ctx.drawImage(templateImg, 0, 0, baseW, baseH);

  // Draw Decorations (stickers/text) on top of everything
  if (decorations && decorations.length > 0) {
    const canvasScale = baseW / 380;
    const stickerPromises = decorations
      .filter(d => d.type === 'sticker' && d.isImage)
      .map(d => loadImage(asset(d.content)).catch(() => null));
    const loadedStickers = await Promise.all(stickerPromises);

    // Measure from live preview if available
    const measured = new Map();
    if (stripElement) {
      const layer = stripElement.querySelector('.decorations-layer');
      if (layer) {
        const prevTransform = stripElement.style.transform;
        stripElement.style.transform = 'none';
        const lr = layer.getBoundingClientRect();
        if (lr.width > 0 && lr.height > 0) {
          for (const deco of decorations) {
            const node = stripElement.querySelector(`[data-deco-id="${deco.id}"]`);
            if (!node) continue;
            const r = node.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            measured.set(deco.id, {
              cx: ((r.left + r.width / 2 - lr.left) / lr.width) * baseW,
              cy: ((r.top + r.height / 2 - lr.top) / lr.height) * baseH,
              w: (r.width / lr.width) * baseW,
              h: (r.height / lr.height) * baseH,
            });
          }
        }
        stripElement.style.transform = prevTransform;
      }
    }

    let stickerIdx = 0;
    for (const deco of decorations) {
      const baseFontSize = (deco.isSmall ? 10 : 13) * canvasScale;
      const sX = deco.scaleX ?? 1;
      const sY = deco.scaleY ?? 1;

      const m = measured.get(deco.id);
      let cx = m ? m.cx : (deco.x / 100) * baseW;
      let cy = m ? m.cy : (deco.y / 100) * baseH;
      let bw = m ? m.w : null;
      let bh = m ? m.h : null;

      if (deco.type === 'text') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((deco.rotation * Math.PI) / 180);
        const fs = deco.showBg === false && bh != null && bh > 0 ? bh : baseFontSize;
        ctx.font = `900 ${fs}px ${deco.font || 'Inter'}, sans-serif`;
        if (deco.showBg !== false) {
          ctx.fillStyle = deco.bgColor || '#ff5aaf';
          const textWidth = ctx.measureText(deco.content).width;
          const h = bh ?? (baseFontSize * 1.5);
          const w = bw ?? (textWidth + (baseFontSize * 1.2));
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
          ctx.fill();
        }
        ctx.fillStyle = deco.color || '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(deco.content, 0, 0);
        ctx.restore();
      } else if (deco.type === 'sticker') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((deco.rotation * Math.PI) / 180);
        if (deco.isImage) {
          const sImg = loadedStickers[stickerIdx++];
          if (sImg) {
            const w = bw ?? 100 * sX * canvasScale;
            const h = bh ?? (sImg.height / sImg.width) * (100 * sY * canvasScale);
            if (deco.showBg !== false) {
              ctx.fillStyle = deco.bgColor || '#ff5aaf';
              const bgPadding = 12 * Math.max(sX, sY) * canvasScale;
              ctx.beginPath();
              ctx.roundRect(-w / 2 - bgPadding, -h / 2 - bgPadding, w + bgPadding * 2, h + bgPadding * 2, bgPadding);
              ctx.fill();
            }
            const iw = bw != null ? Math.max(1, w - 16 * sX) : w;
            const ih = bh != null ? Math.max(1, h - 16 * sY) : h;
            ctx.drawImage(sImg, -iw / 2, -ih / 2, iw, ih);
          }
        } else {
          const fs = deco.showBg === false && bh != null && bh > 0 ? bh : baseFontSize;
          ctx.font = `900 ${fs}px Fraunces, serif`;
          if (deco.showBg !== false) {
            ctx.fillStyle = deco.bgColor || '#ff5aaf';
            const textWidth = ctx.measureText(deco.content).width;
            const h = bh ?? (baseFontSize * 1.5);
            const w = bw ?? (textWidth + (baseFontSize * 1.2));
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
          } else {
            ctx.fillStyle = deco.isChrome ? '#111' : '#4e1534';
          }
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(deco.content, 0, 0);
        }
        ctx.restore();
      }
    }
  }

  // Draw Doodles (normalized — matches preview position + thickness)
  drawDoodles(ctx, doodlePaths, baseW, baseH);

  ctx.restore();

  return canvas;
}
