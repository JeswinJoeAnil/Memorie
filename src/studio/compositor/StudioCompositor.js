/**
 * Studio Compositor v2 — cached background, sprite shadows, adaptive preview.
 * Single source of truth for both live preview and high-resolution capture.
 *
 * Layer Hierarchy:
 * 1. Shared Studio Background & Floor Environment (pre-rendered, 1 drawImage/frame)
 * 2. Floor Contact Shadows (pre-rendered sprite, 1 drawImage/person)
 * 3. Transparent Participant Cutouts (sorted by zIndex, per-participant mirror)
 * 4. Zero raw video fallbacks, zero UI artifacts in final capture
 *
 * Preview renders at adaptive resolution (854x480 / 960x540 / 1280x720)
 * depending on device tier; captureHD always renders full quality.
 */

import { drawStudioBackground } from './backgroundRenderer.js';
import { normalizePersonCutout } from './personNormalizer.js';
import { segmentationManager } from '../segmentation/segmentationManager.js';
import { getDefaultParticipantTransform } from './participantLayout.js';

export const COMPOSITE_WIDTH = 1280;
export const COMPOSITE_HEIGHT = 720;

// Pre-rendered soft shadow sprite (drawn once, stamped per person)
let _shadowSprite = null;
function getShadowSprite() {
  if (_shadowSprite) return _shadowSprite;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 32, 4, 128, 32, 124);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // Elliptical squash via scale
    ctx.save();
    ctx.translate(128, 32);
    ctx.scale(1, 0.25);
    ctx.translate(-128, -128);
    ctx.fillRect(0, 0, 256, 256);
    ctx.restore();
  }
  _shadowSprite = c;
  return c;
}

export class StudioCompositor {
  constructor(targetCanvas) {
    this.canvas = targetCanvas;
    this.sceneW = COMPOSITE_WIDTH;
    this.sceneH = COMPOSITE_HEIGHT;
    this.enableGlow = true;
    this.enableShadows = true;
    this.lastRenderMs = 0;

    if (this.canvas) {
      this.canvas.width = this.sceneW;
      this.canvas.height = this.sceneH;
    }

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.sceneW;
    this.offscreenCanvas.height = this.sceneH;
    // Cache contexts once — getContext() per frame forces state re-validation
    this._offCtx = this.offscreenCanvas.getContext('2d', { alpha: false, desynchronized: true });
    this._displayCtx = null;
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    if (this.canvas) {
      this.canvas.width = this.sceneW;
      this.canvas.height = this.sceneH;
    }
    this._displayCtx = null;
  }

  /** Adaptive preview size; capture path is unaffected. */
  setCompositeSize(w, h) {
    const nw = Math.round(w), nh = Math.round(h);
    if (nw === this.sceneW && nh === this.sceneH) return;
    this.sceneW = nw;
    this.sceneH = nh;
    this.offscreenCanvas.width = nw;
    this.offscreenCanvas.height = nh;
    this._offCtx = this.offscreenCanvas.getContext('2d', { alpha: false, desynchronized: true });
    if (this.canvas) {
      this.canvas.width = nw;
      this.canvas.height = nh;
    }
    this._displayCtx = null;
  }

  setQualityFlags({ enableGlow = true, enableShadows = true } = {}) {
    this.enableGlow = enableGlow;
    this.enableShadows = enableShadows;
  }

  /**
   * Draws a soft, elliptical contact shadow under the participant's feet.
   * Uses a pre-rendered sprite: no per-frame gradient allocation.
   */
  drawContactShadow(ctx, centerX, floorY, personWidth) {
    const shadowW = Math.max(56, personWidth * 0.7);
    const shadowH = shadowW * 0.22;
    try {
      ctx.drawImage(
        getShadowSprite(),
        Math.round(centerX - shadowW / 2),
        Math.round(floorY - shadowH / 2),
        Math.round(shadowW),
        Math.round(shadowH)
      );
    } catch {}
  }

  /**
   * Draws a placeholder silhouette while a participant's camera or model loads.
   */
  drawLoadingSilhouette(ctx, drawX, drawY, width, height) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';

    // Head
    ctx.beginPath();
    ctx.ellipse(
      drawX + width / 2,
      drawY + height * 0.22,
      width * 0.22,
      width * 0.22,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Torso / Body
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(
        drawX + width * 0.22,
        drawY + height * 0.32,
        width * 0.56,
        height * 0.55,
        12
      );
    } else {
      ctx.rect(drawX + width * 0.22, drawY + height * 0.32, width * 0.56, height * 0.55);
    }
    ctx.fill();
    ctx.restore();
  }

  isVideoPlayable(video) {
    if (!video) return false;
    if (video.paused) {
      try {
        const p = video.play();
        if (p?.catch) p.catch(() => {});
      } catch {}
    }
    return video.readyState >= 2 && video.videoWidth > 0;
  }

  /**
   * Prepares normalized visual layers for all participants.
   */
  buildLayers(sceneParticipants, totalCount, isHQ = false, sceneW = this.sceneW, sceneH = this.sceneH) {
    const count = Math.min(4, Math.max(1, totalCount || 1));
    const layers = [];

    sceneParticipants.slice(0, 4).forEach((part, joinIndex) => {
      const transform =
        part.transform ?? getDefaultParticipantTransform(joinIndex, count);

      const hasVideo = this.isVideoPlayable(part.video);

      let cutout = null;
      let bounds = { normX: 0.15, normY: 0.05, normWidth: 0.7, normHeight: 0.9, detected: false };
      let segStatus = 'loading';

      if (hasVideo) {
        const res = isHQ
          ? segmentationManager.processHighQuality(part.peerId, part.video)
          : segmentationManager.processParticipant(part.peerId, part.video, count);

        cutout = res.cutout;
        bounds = res.bounds || bounds;
        segStatus = res.status;
      }

      const metrics = normalizePersonCutout({
        cutoutCanvas: cutout,
        bounds,
        transform,
        sceneWidth: sceneW,
        sceneHeight: sceneH,
        totalCount: count,
      });

      layers.push({
        peerId: part.peerId,
        name: part.name,
        mirror: !!part.mirror,
        cutout,
        hasVideo,
        video: part.video,
        segStatus,
        metrics,
        zIndex: metrics.zIndex,
      });
    });

    return layers.sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Executes a single animation frame of the virtual photo studio.
   * opts: { enableGlow, enableShadows } — defaults to instance flags.
   */
  renderFrame({ background, sceneParticipants, enableGlow, enableShadows }) {
    if (!this.canvas) return;
    const t0 = performance.now();
    const ctx = this._offCtx;
    if (!ctx) return;
    const W = this.sceneW, H = this.sceneH;
    const useGlow = enableGlow ?? this.enableGlow;
    const useShadows = enableShadows ?? this.enableShadows;

    // 1. Layer 0: Shared Background & Floor Environment (cached → 1 drawImage)
    drawStudioBackground(ctx, background, W, H, { enableGlow: useGlow });

    const activeCount = sceneParticipants.length;
    const layers = this.buildLayers(sceneParticipants, activeCount, false, W, H);

    // 2. Layer 1: Ground Contact Shadows (sprite stamps)
    if (useShadows) {
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        this.drawContactShadow(ctx, layer.metrics.centerX, layer.metrics.floorY, layer.metrics.drawWidth);
      }
    }

    // 3. Layer 2: Transparent Participant Cutouts (sorted by zIndex)
    // imageSmoothing low for preview speed; capture uses high internally.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const { drawX, drawY, drawWidth, drawHeight, centerX } = layer.metrics;
      if (drawWidth <= 0 || drawHeight <= 0) continue;

      if (layer.mirror) {
        ctx.save();
        ctx.translate(centerX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-centerX, 0);
        if (layer.cutout && layer.segStatus === 'ready') {
          ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
        } else if (layer.cutout && layer.hasVideo) {
          ctx.globalAlpha = 0.65;
          ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
          ctx.globalAlpha = 1.0;
        } else {
          this.drawLoadingSilhouette(ctx, drawX, drawY, drawWidth, drawHeight);
        }
        ctx.restore();
      } else if (layer.cutout && layer.segStatus === 'ready') {
        ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
      } else if (layer.cutout && layer.hasVideo) {
        ctx.globalAlpha = 0.65;
        ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
        ctx.globalAlpha = 1.0;
      } else {
        this.drawLoadingSilhouette(ctx, drawX, drawY, drawWidth, drawHeight);
      }
    }

    // 4. Present offscreen buffer to active canvas
    if (!this._displayCtx || this._displayCtx.canvas !== this.canvas) {
      this._displayCtx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
    }
    if (this._displayCtx) {
      this._displayCtx.drawImage(this.offscreenCanvas, 0, 0);
    }
    this.lastRenderMs = performance.now() - t0;
  }

  /**
   * Captures a high-resolution snapshot for the final photo strip.
   * NEVER renders raw video frames, UI elements, or debug overlays.
   * Always full glow + shadows + high smoothing regardless of preview tier.
   */
  async captureHD({ background, sceneParticipants, targetWidth = 1920, targetHeight = 1080 }) {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = targetWidth;
    snapCanvas.height = targetHeight;
    const ctx = snapCanvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw shared studio background on HD canvas
    drawStudioBackground(ctx, background, targetWidth, targetHeight, { enableGlow: true });

    const activeCount = sceneParticipants.length;
    const layers = this.buildLayers(
      sceneParticipants,
      activeCount,
      true,
      targetWidth,
      targetHeight
    );

    // Draw HD contact shadows
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      this.drawContactShadow(ctx, layer.metrics.centerX, layer.metrics.floorY, layer.metrics.drawWidth);
    }

    // Draw HD participant cutouts (transparent person only)
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const { drawX, drawY, drawWidth, drawHeight, centerX } = layer.metrics;
      if (!layer.cutout || drawWidth <= 0 || drawHeight <= 0) continue;
      ctx.save();
      if (layer.mirror) {
        ctx.translate(centerX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-centerX, 0);
      }
      ctx.drawImage(layer.cutout, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();
    }

    return snapCanvas.toDataURL('image/png');
  }
}
