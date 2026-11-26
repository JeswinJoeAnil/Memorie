import { describe, expect, it } from 'vitest';
import { processPixels } from './pixelGrade.js';

describe('shared photo grade', () => {
  it('keeps grain, glitch and dust reproducible across independent renders', () => {
    const source = Uint8ClampedArray.from({ length: 37 * 29 * 4 }, (_, i) => i % 256);
    const options = { grain: 0.12, glitch: 0.25, dust: 0.5, curve: [[0, 10], [255, 240]] };
    const first = source.slice();
    const second = source.slice();
    processPixels(first, options, 37, 29);
    processPixels(second, options, 37, 29);
    expect(first).toEqual(second);
    expect(first).not.toEqual(source);
    expect(first.filter((_, i) => i % 4 === 3)).toEqual(source.filter((_, i) => i % 4 === 3));
  });

  it('bounds color-channel shifts to the current row on tiny images', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    processPixels(data, { chromaticAberration: 2, scanlines: { opacity: 0, rgbShift: 1.4 } }, 2, 2);
    expect(Array.from(data)).toEqual([40, 20, 30, 255, 40, 50, 30, 255, 100, 80, 90, 255, 100, 110, 90, 255]);
  });
});
