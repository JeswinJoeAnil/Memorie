import { processPixels } from './pixelGrade.js';

self.onmessage = function (e) {
  const { id, data, pixel, width, height } = e.data;
  const d = new Uint8ClampedArray(data);
  processPixels(d, pixel, width, height);
  self.postMessage({ id, data: d.buffer }, [d.buffer]);
};
