import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUTS,
  constrainParticipantPosition,
  getDefaultParticipantTransform,
} from './participantLayout.js';
import { normalizePersonCutout } from './personNormalizer.js';
import {
  expandVideoBoundsForPhone,
  extractPersonBoundingBox,
} from '../segmentation/maskProcessor.js';

describe('studio bottom-flush portrait framing', () => {
  it('anchors default layouts for 1-4 participants flush at bottom baselineY = 1.0', () => {
    for (const count of [1, 2, 3, 4]) {
      expect(DEFAULT_LAYOUTS[count]).toHaveLength(count);
      for (const slot of DEFAULT_LAYOUTS[count]) {
        expect(slot.baselineY).toBe(1.0);
      }
      expect(getDefaultParticipantTransform(0, count).baselineY).toBe(1.0);
    }
  });

  it('allows dragging down to flush bottom and slightly beyond without stopping at 0.95', () => {
    expect(constrainParticipantPosition(0.5, 1.0).baselineY).toBe(1.0);
    expect(constrainParticipantPosition(0.5, 1.05).baselineY).toBe(1.05);
    expect(constrainParticipantPosition(0.5, 1.5).baselineY).toBe(1.08);
    expect(constrainParticipantPosition(0.5, 0.2).baselineY).toBe(0.5);
  });

  it('places normalized cutout bottom flush with sceneHeight by default', () => {
    const metrics = normalizePersonCutout({
      cutoutCanvas: { width: 400, height: 400 },
      bounds: { normWidth: 0.6, normHeight: 0.7, detected: true },
      transform: getDefaultParticipantTransform(0, 1),
      sceneWidth: 1600,
      sceneHeight: 900,
      totalCount: 1,
    });
    expect(metrics.floorY).toBe(900);
    expect(metrics.drawY + metrics.drawHeight).toBe(900);
    expect(metrics.baselineY).toBe(1.0);
  });

  it('locks bottom crop flush when person touches the lower webcam edge without injecting empty bottom space', () => {
    const w = 100;
    const h = 100;
    const mask = new Float32Array(w * h);
    // Person occupies y=30..97 (touching lower edge within 4%)
    for (let y = 30; y <= 97; y++) {
      for (let x = 25; x <= 75; x++) {
        mask[y * w + x] = 0.9;
      }
    }
    const raw = extractPersonBoundingBox(mask, w, h, null, 0.35, 0.08, 1, 0.03);
    expect(raw.normY + raw.normHeight).toBeCloseTo(1.0, 5);

    const expanded = expandVideoBoundsForPhone(raw, {
      topPad: 0.03,
      sidePad: 0.04,
      bottomPad: 0.0,
      minWidth: 0.4,
      minHeight: 0.4,
    });
    expect(expanded.normY + expanded.normHeight).toBeCloseTo(1.0, 5);
  });

  it('expands top headroom without extending bottom edge into empty space below torso', () => {
    const bounds = { normX: 0.3, normY: 0.35, normWidth: 0.4, normHeight: 0.5, detected: true };
    const expanded = expandVideoBoundsForPhone(bounds, {
      topPad: 0.04,
      sidePad: 0.04,
      bottomPad: 0.0,
      minWidth: 0.4,
      minHeight: 0.7,
    });
    // Original bottom edge was 0.35 + 0.50 = 0.85; minHeight should grow upward only
    expect(expanded.normY + expanded.normHeight).toBeCloseTo(0.85, 5);
    expect(expanded.normHeight).toBeCloseTo(0.7, 5);
  });
});
