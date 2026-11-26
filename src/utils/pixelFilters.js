import { processPixels, drawOverlays } from './pixelGrade.js';

// ─── Web Worker Async Execution (Zero UI Blocking) ───
let filterWorker = null;
let workerFailed = false;
let msgId = 0;
const pendingCallbacks = new Map();

function getFilterWorker() {
  if (workerFailed) return null;
  if (filterWorker) return filterWorker;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;

  try {
    filterWorker = new Worker(new URL('./pixelFilters.worker.js', import.meta.url), { type: 'module' });
    filterWorker.onmessage = (e) => {
      const { id, data } = e.data;
      const cb = pendingCallbacks.get(id);
      if (cb) {
        pendingCallbacks.delete(id);
        cb(data);
      }
    };
    filterWorker.onerror = (err) => {
      console.warn('Pixel filter worker failed:', err?.message || err);
      filterWorker.terminate();
      for (const done of pendingCallbacks.values()) done(null);
      pendingCallbacks.clear();
      filterWorker = null;
      workerFailed = true;
    };
  } catch {
    workerFailed = true;
    filterWorker = null;
  }
  return filterWorker;
}

export async function applyPixelFilterAsync(ctx, pixel, width, height) {
  if (!pixel) return;
  const worker = getFilterWorker();

  let image = ctx.getImageData(0, 0, width, height);
  let buffer;
  if (worker) {
    const id = ++msgId;
    buffer = await new Promise(resolve => {
      pendingCallbacks.set(id, resolve);
      try {
        worker.postMessage({ id, data: image.data.buffer, pixel, width, height }, [image.data.buffer]);
      } catch {
        pendingCallbacks.delete(id);
        resolve(null);
      }
    });
  }
  if (buffer) image = new ImageData(new Uint8ClampedArray(buffer), width, height);
  else {
    if (!image.data.length) image = ctx.getImageData(0, 0, width, height);
    processPixels(image.data, pixel, width, height);
  }
  ctx.putImageData(image, 0, 0);
  drawOverlays(ctx, pixel, width, height);
}
