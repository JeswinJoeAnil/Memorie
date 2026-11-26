/**
 * Animated GIF export — renders the full photostrip (photos, template overlay,
 * decorations, doodles) as an animated GIF by compositing each frame through
 * the DOM snapshot pipeline and encoding with gifenc.
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { domToCanvas } from 'modern-screenshot';
import { gradePhoto } from './gradePhoto.js';

/**
 * Load an image URL as an HTMLImageElement.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Render a single strip frame to a canvas, swapping animated slot images.
 */
async function renderFrame(stripElement, frameIndex, animations, photos, filter, width, height, scale) {
  // Pre-grade animated frames if a filter is active
  const gradedSources = {};
  const hasFilter = filter.css || filter.pixel;
  for (const [slotIdx, anim] of Object.entries(animations)) {
    const fi = frameIndex % anim.frames.length;
    const src = anim.frames[fi];
    if (hasFilter) {
      try {
        const canvas = await gradePhoto(src, filter, 1600);
        gradedSources[slotIdx] = canvas.toDataURL('image/jpeg', 0.92);
      } catch {
        gradedSources[slotIdx] = src;
      }
    } else {
      gradedSources[slotIdx] = src;
    }
  }

  // Also pre-grade static photos
  const staticGraded = [];
  for (let i = 0; i < photos.length; i++) {
    if (animations[i]) continue;
    if (hasFilter) {
      try {
        const canvas = await gradePhoto(photos[i], filter, 1600);
        staticGraded[i] = canvas.toDataURL('image/jpeg', 0.92);
      } catch {
        staticGraded[i] = photos[i];
      }
    } else {
      staticGraded[i] = photos[i];
    }
  }

  return domToCanvas(stripElement, {
    width,
    height,
    backgroundColor: null,
    scale,
    style: { transform: 'none', margin: '0', boxShadow: 'none' },
    filter: node => !node.matches?.('.deco-handle, .deco-corner'),
    onCloneEachNode(node) {
      if (node instanceof HTMLImageElement && node.hasAttribute('data-photo-index')) {
        const idx = Number(node.dataset.photoIndex);
        if (animations[idx]) {
          node.src = gradedSources[idx];
        } else if (staticGraded[idx]) {
          node.src = staticGraded[idx];
        }
      }
      if (node.classList?.contains('active-deco')) {
        node.style.outline = 'none';
        node.style.boxShadow = 'none';
      }
    },
  });
}

/**
 * Export the photostrip as an animated GIF.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.stripElement - The strip preview DOM node
 * @param {string[]} opts.photos - Array of photo data URLs (hero frames for animated slots)
 * @param {Object} opts.animations - Map of slot index → { frames: string[], boomerang: boolean }
 * @param {Object} opts.filter - Active filter config
 * @param {function} [opts.onProgress] - Progress callback (0–1)
 * @returns {Promise<Blob>} Animated GIF blob
 */
export async function exportStripAsGif({ stripElement, photos, animations, filter, onProgress }) {
  if (!stripElement) throw new Error('Strip preview is unavailable.');
  await document.fonts.ready;

  const width = stripElement.offsetWidth;
  const height = stripElement.offsetHeight;
  const scale = Math.min(600 / width, 2000 / height);
  const scaledW = Math.round(width * scale);
  const scaledH = Math.round(height * scale);

  // Figure out total animation frames
  const animEntries = Object.entries(animations);
  const maxFrames = Math.max(...animEntries.map(([, a]) => a.frames.length), 1);
  const fps = 12;
  const delay = Math.round(1000 / fps);

  const gif = GIFEncoder();

  // Pre-grade static photos only once (first frame), cache them
  const hasFilter = Boolean(filter.css || filter.pixel);

  for (let f = 0; f < maxFrames; f++) {
    if (onProgress) onProgress(f / maxFrames);

    const canvas = await renderFrame(
      stripElement, f, animations, photos, filter,
      width, height, scale,
    );

    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, scaledW, scaledH);

    // Quantize to 256-color palette and encode
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, scaledW, scaledH, { palette, delay });

    // Let the browser breathe between frames
    await new Promise(r => requestAnimationFrame(r));
  }

  gif.finish();
  if (onProgress) onProgress(1);
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
