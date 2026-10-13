import { describe, expect, it } from 'vitest';
import { doodlePointToExport, doodleWidthToExport } from './exportCanvas.js';

describe('doodle export scaling (P1.1)', () => {
  it('maps normalized points to export size', () => {
    expect(doodlePointToExport({ x: 0.5, y: 0.5 }, 900, 2000)).toEqual({ x: 450, y: 1000 });
    expect(doodlePointToExport({ x: 0, y: 1 }, 900, 2000)).toEqual({ x: 0, y: 2000 });
  });

  it('scales brush width with canvas', () => {
    expect(doodleWidthToExport({ size: 6, previewWidth: 380 }, 900)).toBeCloseTo(14.2, 1);
  });

  it('handles legacy pixel points', () => {
    const p = doodlePointToExport({ x: 190, y: 190 }, 900, 2000, 380);
    expect(p.x).toBeCloseTo(450, 0);
  });
});
