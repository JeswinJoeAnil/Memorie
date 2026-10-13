/**
 * Studio Segmentation Manager v2 — video-temporal, adaptive, low-overhead.
 *
 * What changed vs v1:
 * - Downscaled AI input (144-192px) fed to the segmenter instead of full HD video.
 * - Tiered segmentation rate (6/8/12 fps) + bounds interpolation between AI runs.
 * - Recurrent temporal smoothing (video-matting style): history blends with current
 *   frame so edges don't flicker, movement stays responsive.
 * - Zero per-frame allocation: cached 2d contexts, reused ImageData + Float32 buffers.
 * - Pluggable backend: 'mediapipe' today, optional 'rvm-onnx' if VITE_RVM_MODEL_URL set.
 *
 * Public API is backwards compatible:
 *   init(), processParticipant(peerId, video, count), processHighQuality(),
 *   getStatus(), removeParticipant(), destroy(), getIntervalForCount()
 */

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import {
  buildSmoothMaskImageData,
  clampBoundsToFrame,
  cropPersonCutout,
  expandVideoBoundsForPhone,
  extractPersonBoundingBox,
  mapCoverFitBoundsToVideo,
} from './maskProcessor.js';
import {
  detectDeviceTier,
  getTierConfig,
  intervalForCountAndTier,
} from '../performance/deviceTier.js';

const DEFAULT_BOUNDS = Object.freeze({
  normX: 0.05, normY: 0.0, normWidth: 0.9, normHeight: 1.0, detected: false,
});

class SegmentationManager {
  constructor() {
    this.segmenter = null;
    this.backend = 'mediapipe';
    this.isReady = false;
    this.initPromise = null;
    this.initFailed = false;
    this._retryCount = 0;
    this.participantState = new Map();
    this.tier = detectDeviceTier();
    this.config = getTierConfig(this.tier);
    this._segDurEMA = 0;
    this._rvmSession = null;
    this._rvmFailed = false;
  }

  /** Allow StudioRoom auto-degrade to drop a tier at runtime. */
  setTier(tier) {
    if (!tier || tier === this.tier) return;
    this.tier = tier;
    this.config = getTierConfig(tier);
    // Resize per-participant input canvases lazily on next frame
    this.participantState.forEach((entry) => {
      entry.needsInputResize = true;
    });
  }

  getTier() {
    return this.tier;
  }

  getStats() {
    return {
      backend: this.backend,
      tier: this.tier,
      avgSegMs: Math.round(this._segDurEMA * 10) / 10,
      participants: this.participantState.size,
      ready: this.isReady,
    };
  }

  getIntervalForCount(count) {
    return intervalForCountAndTier(count, this.config);
  }

  async init() {
    if (this.isReady && (this.segmenter || this._rvmSession)) return true;
    if (this.initPromise) return this.initPromise;
    if (this._retryCount >= 3) return false;

    // Optional next-gen backend: Robust Video Matting via ONNX Runtime Web.
    // Enabled only when VITE_RVM_MODEL_URL is configured; otherwise MediaPipe.
    const rvmUrl = import.meta.env?.VITE_RVM_MODEL_URL;
    if (rvmUrl && !this._rvmFailed) {
      this.initPromise = this._initRvm(rvmUrl);
      return this.initPromise;
    }

    this.initPromise = this._initMediapipe();
    return this.initPromise;
  }

  async _initRvm(modelUrl) {
    try {
      // Kept out of the main bundle: specifier built at runtime so Rollup
      // cannot statically resolve it. Only fetched when VITE_RVM_MODEL_URL set.
      const ortSpecifier = ['onnxruntime', 'web'].join('-');
      const ort = await import(/* @vite-ignore */ ortSpecifier);
      const session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['webnn', 'webgpu', 'wasm'],
      });
      this._rvmSession = session;
      this.backend = 'rvm-onnx';
      this.isReady = true;
      this.initFailed = false;
      return true;
    } catch (err) {
      console.warn('RVM backend unavailable, falling back to MediaPipe:', err);
      this._rvmFailed = true;
      this.initPromise = null;
      return this._initMediapipe();
    }
  }

  async _initMediapipe() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
      );
      const modelAssetPath =
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
      try {
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      } catch {
        console.warn('MediaPipe GPU delegate unavailable; falling back to CPU');
        // CPU fallback automatically drops to performance tier input size
        if (this.tier === 'high') this.setTier('balanced');
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: 'CPU' },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      }
      this.backend = 'mediapipe';
      this.isReady = true;
      this.initFailed = false;
      this._retryCount = 0;
      return true;
    } catch (err) {
      console.error('Failed to initialize MediaPipe ImageSegmenter:', err);
      this.initFailed = true;
      this.initPromise = null;
      const msg = String(err?.message || err || '');
      const isPermanent =
        msg.includes('CompileError') ||
        msg.includes('Content Security Policy') ||
        msg.includes('WebAssembly') ||
        (typeof CompileError !== 'undefined' && err instanceof CompileError);
      if (isPermanent) {
        console.error('MediaPipe WASM blocked by CSP or unsupported — retries disabled.');
        this._retryCount = 3;
        return false;
      }
      if (this._retryCount < 3) {
        this._retryCount++;
        await new Promise((r) => setTimeout(r, this._retryCount * 4000));
        return this._initMediapipe();
      }
      return false;
    }
  }

  _getParticipantEntry(peerId) {
    let entry = this.participantState.get(peerId);
    if (!entry) {
      const cutoutCanvas = document.createElement('canvas');
      cutoutCanvas.width = 320;
      cutoutCanvas.height = 400;
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = 192;
      maskCanvas.height = 192;
      const segInput = document.createElement('canvas');
      segInput.width = this.config.segInputSize;
      segInput.height = this.config.segInputSize;
      entry = {
        cutoutCanvas,
        cutoutCtx: cutoutCanvas.getContext('2d'),
        maskCanvas,
        maskCtx: maskCanvas.getContext('2d'),
        segInput,
        segCtx: segInput.getContext('2d', { alpha: false, desynchronized: true }),
        maskImageData: null,
        prevBounds: null,
        smoothedBounds: { ...DEFAULT_BOUNDS },
        // Seg-space (square AI input) smoothed box for stable tracking +
        // mask sampling. smoothedBounds is the mapped video-space box.
        segBounds: null,
        prevMaskData: null,
        lastTimestampMs: 0,
        lastSegmentTime: 0,
        hasMask: false,
        status: 'loading',
        needsInputResize: false,
        consecErrors: 0,
      };
      // Reuse contexts; disable smoothing on mask canvas for crisp alpha
      try { entry.maskCtx.imageSmoothingEnabled = false; } catch {}
      this.participantState.set(peerId, entry);
    } else if (entry.needsInputResize) {
      const s = this.config.segInputSize;
      if (entry.segInput.width !== s || entry.segInput.height !== s) {
        entry.segInput.width = s;
        entry.segInput.height = s;
        entry.segCtx = entry.segInput.getContext('2d', { alpha: false, desynchronized: true });
      }
      entry.needsInputResize = false;
    }
    return entry;
  }

  getStatus(peerId) {
    const entry = this.participantState.get(peerId);
    if (!entry) return 'idle';
    if (this.initFailed) return 'error';
    if (!this.isReady) return 'loading';
    if (entry.hasMask) return 'ready';
    return entry.status || 'loading';
  }

  /**
   * Draw video into the small square AI input with cover-fit (no distortion).
   * Returns false when video has no pixels yet.
   */
  _drawSegInput(entry, videoElement) {
    const vW = videoElement.videoWidth || 0;
    const vH = videoElement.videoHeight || 0;
    if (!vW || !vH) return false;
    const ctx = entry.segCtx;
    if (!ctx) return false;
    const s = this.config.segInputSize;
    // Cover-fit: crop the long edge
    const scale = Math.max(s / vW, s / vH);
    const dw = vW * scale;
    const dh = vH * scale;
    const dx = (s - dw) / 2;
    const dy = (s - dh) / 2;
    // drawImage with float coords is fine; input is tiny so cost is negligible
    ctx.drawImage(videoElement, dx, dy, dw, dh);
    return true;
  }

  /**
   * Processes a live video frame for a participant.
   * AI runs at tier rate; cutout re-renders every frame from the cached mask
   * so motion stays at display fps even when AI runs at 6-12 fps.
   */
  processParticipant(peerId, videoElement, totalActiveCount = 1) {
    if (!videoElement || (videoElement.readyState < 1 && videoElement.videoWidth === 0)) {
      const fallbackEntry = this.participantState.get(peerId);
      return {
        cutout: fallbackEntry?.cutoutCanvas || null,
        bounds: fallbackEntry?.smoothedBounds || null,
        status: 'loading',
      };
    }

    const entry = this._getParticipantEntry(peerId);
    const now = performance.now();
    const intervalMs = this.getIntervalForCount(totalActiveCount);
    const shouldSegment = !entry.hasMask || now - entry.lastSegmentTime >= intervalMs;

    if (shouldSegment && this.isReady) {
      if (this.backend === 'rvm-onnx' && this._rvmSession) {
        this._segmentRvm(entry, videoElement, now);
      } else if (this.segmenter) {
        this._segmentMediapipe(entry, videoElement, now);
      }
    }

    // Cheap per-frame step: re-cut from cached mask + interpolated bounds.
    // Uses low smoothing in preview; captureHD uses high via processHighQuality.
    // Video crop uses the mapped video-space box; mask crop uses the seg-space
    // box — they are different spaces on portrait phones.
    let cutout = entry.cutoutCanvas;
    try {
      if (entry.hasMask || entry.smoothedBounds) {
        cutout =
          cropPersonCutout(
            videoElement,
            entry.maskCanvas,
            entry.smoothedBounds,
            entry.cutoutCanvas,
            { smoothingQuality: this.config.smoothingQuality },
            entry.segBounds || null
          ) || entry.cutoutCanvas;
      }
    } catch {
      // Keep last good cutout on transient canvas errors
    }

    return {
      cutout,
      bounds: entry.smoothedBounds,
      status: entry.hasMask ? 'ready' : entry.status,
    };
  }

  _segmentMediapipe(entry, videoElement, now) {
    const t0 = performance.now();
    try {
      if (!this._drawSegInput(entry, videoElement)) return;
      let timestampMs = Math.round(now);
      if (timestampMs <= entry.lastTimestampMs) timestampMs = entry.lastTimestampMs + 1;
      entry.lastTimestampMs = timestampMs;

      const result = this.segmenter.segmentForVideo(entry.segInput, timestampMs);
      if (result?.confidenceMasks?.length > 0) {
        const mask = result.confidenceMasks[0];
        const maskW = mask.width || entry.maskCanvas.width;
        const maskH = mask.height || entry.maskCanvas.height;
        const floatData = mask.getAsFloat32Array();

        if (entry.maskCanvas.width !== maskW || entry.maskCanvas.height !== maskH) {
          entry.maskCanvas.width = maskW;
          entry.maskCanvas.height = maskH;
          entry.maskCtx = entry.maskCanvas.getContext('2d');
          try { entry.maskCtx.imageSmoothingEnabled = false; } catch {}
          entry.maskImageData = null;
          entry.prevMaskData = null;
        }
        if (!entry.prevMaskData || entry.prevMaskData.length !== floatData.length) {
          entry.prevMaskData = new Float32Array(floatData.length);
          // Seed history with first frame to avoid fade-in
          entry.prevMaskData.set(floatData);
        }

        // Reuse ImageData buffer across frames (no GC churn)
        entry.maskImageData = buildSmoothMaskImageData(
          floatData,
          maskW,
          maskH,
          entry.prevMaskData,
          entry.maskImageData,
          {
            temporalAlpha: this.config.temporalAlpha,
            lowThresh: this.config.maskThresholdLow,
            highThresh: this.config.maskThresholdHigh,
          }
        );
        entry.maskCtx.putImageData(entry.maskImageData, 0, 0);

        // Bbox scan is always exact (stride 1). Phone-first padding lives in
        // the extractor (extra top headroom) + the video-space expansion below.
        // Use temporally smoothed mask for stable bounds.
        const segSmoothed = extractPersonBoundingBox(
          entry.prevMaskData,
          maskW,
          maskH,
          entry.prevBounds,
          this.config.maskThresholdLow,
          0.1
        );
        entry.prevBounds = segSmoothed;

        // Edge-aligned boxes: expand ONCE in seg space, then map to video.
        // Expanding only the video box (previous revision) made the video crop
        // larger than the mask crop, so the stretched mask leaked white wall
        // as a halo. Expanding before mapping keeps both crops on the same content.
        const segExpanded = expandVideoBoundsForPhone(segSmoothed, {
          topPad: 0.05,
          sidePad: 0.04,
          bottomPad: 0.02,
          minWidth: 0.4,
          minHeight: 0.4,
        });
        entry.segBounds = segExpanded;

        // Map square-AI box back to full-video coordinates (cover-fit inverse),
        // then clamp without further growth to preserve mask alignment.
        // Without this mapping, portrait phones got a squeezed box that cut
        // shoulders with a straight edge.
        const vW = videoElement.videoWidth || 0;
        const vH = videoElement.videoHeight || 0;
        const mapped = mapCoverFitBoundsToVideo(segExpanded, vW, vH, this.config.segInputSize);
        entry.smoothedBounds = clampBoundsToFrame(mapped);

        entry.hasMask = true;
        entry.lastSegmentTime = now;
        entry.status = 'ready';
        entry.consecErrors = 0;
      }
      // Always close native masks
      if (result?.confidenceMasks) {
        for (let i = 0; i < result.confidenceMasks.length; i++) {
          try { result.confidenceMasks[i]?.close(); } catch {}
        }
      }
    } catch (err) {
      entry.consecErrors++;
      if (entry.consecErrors < 4) console.warn(`Segmentation warning:`, err?.message || err);
      // Back off briefly after repeated errors to protect fps
      entry.lastSegmentTime = now + (entry.consecErrors > 3 ? 500 : 0);
    } finally {
      const dur = performance.now() - t0;
      this._segDurEMA = this._segDurEMA ? this._segDurEMA * 0.9 + dur * 0.1 : dur;
    }
  }

  /**
   * Optional RVM-ONNX path (temporal video matting). Only active when
   * VITE_RVM_MODEL_URL is set. Keeps recurrence state per participant.
   * Falls back to MediaPipe on any error.
   */
  async _segmentRvm(entry, videoElement, now) {
    // Synchronous preview continues on last mask; run async inference off-band.
    if (entry._rvmRunning) return;
    entry._rvmRunning = true;
    try {
      const ortSpecifier = ['onnxruntime', 'web'].join('-');
      const ort = await import(/* @vite-ignore */ ortSpecifier);
      if (!this._drawSegInput(entry, videoElement)) return;
      const s = this.config.segInputSize;
      const img = entry.segCtx.getImageData(0, 0, s, s);
      const input = new Float32Array(1 * 3 * s * s);
      // Normalize RGB 0..1, CHW layout expected by RVM
      const d = img.data;
      const plane = s * s;
      for (let i = 0; i < plane; i++) {
        input[i] = d[i * 4] / 255;
        input[plane + i] = d[i * 4 + 1] / 255;
        input[2 * plane + i] = d[i * 4 + 2] / 255;
      }
      const feeds = {
        src: new ort.Tensor('float32', input, [1, 3, s, s]),
      };
      // Recurrence tensors (zero-init first frame)
      for (const k of ['r1', 'r2', 'r3', 'r4']) {
        if (!entry[`_rvm_${k}`]) {
          const sizes = { r1: [1, 16, s / 4, s / 4], r2: [1, 32, s / 8, s / 8], r3: [1, 64, s / 16, s / 16], r4: [1, 128, s / 32, s / 32] };
          const sz = sizes[k];
          const n = sz.reduce((a, b) => a * b, 1);
          entry[`_rvm_${k}`] = new ort.Tensor('float32', new Float32Array(n), sz);
        }
        feeds[k] = entry[`_rvm_${k}`];
      }
      const out = await this._rvmSession.run(feeds);
      // out.pha = [1,1,H,W] alpha matte; reuse as mask
      const pha = out.pha;
      const w = pha.dims[3], h = pha.dims[2];
      const alpha = pha.data;
      if (entry.maskCanvas.width !== w || entry.maskCanvas.height !== h) {
        entry.maskCanvas.width = w;
        entry.maskCanvas.height = h;
        entry.maskCtx = entry.maskCanvas.getContext('2d');
        entry.maskImageData = null;
      }
      if (!entry.maskImageData || entry.maskImageData.width !== w) {
        entry.maskImageData = entry.maskCtx.createImageData(w, h);
      }
      const px = entry.maskImageData.data;
      for (let i = 0; i < alpha.length; i++) {
        const a = Math.max(0, Math.min(1, alpha[i]));
        px[i * 4] = 255; px[i * 4 + 1] = 255; px[i * 4 + 2] = 255;
        px[i * 4 + 3] = (a * 255) | 0;
      }
      entry.maskCtx.putImageData(entry.maskImageData, 0, 0);
      for (const k of ['r1', 'r2', 'r3', 'r4']) {
        if (out[k]) entry[`_rvm_${k}`] = out[k];
      }
      // RVM mask covers the square cover-fit input: keep boxes wide-open so
      // the cutout never clips shoulders while bounds tracking catches up.
      if (!entry.segBounds) {
        entry.segBounds = { normX: 0.05, normY: 0.0, normWidth: 0.9, normHeight: 1.0, detected: true };
      }
      if (!entry.smoothedBounds?.detected) {
        entry.smoothedBounds = { ...DEFAULT_BOUNDS, detected: true };
      }
      entry.hasMask = true;
      entry.lastSegmentTime = now;
      entry.status = 'ready';
    } catch (err) {
      console.warn('RVM inference failed, staying on last mask:', err?.message || err);
    } finally {
      entry._rvmRunning = false;
    }
  }

  /**
   * Synchronous capture pass: forces one fresh high-quality AI run,
   * then cuts at full smoothing quality for the final photo.
   */
  processHighQuality(peerId, videoElement) {
    const entry = this._getParticipantEntry(peerId);
    // Force fresh segment regardless of throttle
    entry.lastSegmentTime = 0;
    const res = this.processParticipant(peerId, videoElement, 1);
    // Re-cut once at best quality for capture
    try {
      const cut = cropPersonCutout(
        videoElement, entry.maskCanvas, entry.smoothedBounds, entry.cutoutCanvas,
        { smoothingQuality: 'high' },
        entry.segBounds || null
      );
      if (cut) res.cutout = cut;
    } catch {}
    return res;
  }

  removeParticipant(peerId) {
    const entry = this.participantState.get(peerId);
    if (entry) {
      try { entry.cutoutCanvas.width = 0; entry.cutoutCanvas.height = 0; } catch {}
      try { entry.maskCanvas.width = 0; entry.maskCanvas.height = 0; } catch {}
      try { entry.segInput.width = 0; entry.segInput.height = 0; } catch {}
    }
    this.participantState.delete(peerId);
  }

  destroy() {
    this.participantState.forEach((entry) => {
      try { entry.cutoutCanvas.width = 0; entry.cutoutCanvas.height = 0; } catch {}
      try { entry.maskCanvas.width = 0; entry.maskCanvas.height = 0; } catch {}
      try { entry.segInput.width = 0; entry.segInput.height = 0; } catch {}
    });
    this.participantState.clear();
    if (this.segmenter?.close) {
      try { this.segmenter.close(); } catch {}
      this.segmenter = null;
    }
    this._rvmSession = null;
    this.isReady = false;
    this.initPromise = null;
    this.initFailed = false;
    this._segDurEMA = 0;
  }
}

export const segmentationManager = new SegmentationManager();
