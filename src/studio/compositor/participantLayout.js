/**
 * Studio Participant Layout Engine
 * Deterministic portrait positions anchored flush to the bottom frame edge
 * (so webcam/phone chest-up shots sit cleanly without floating mid-backdrop).
 * Normalized coordinates: x (0 to 1, left-to-right), baselineY (0 to 1+, top-to-bottom).
 */

export const MAX_STUDIO_PARTICIPANTS = 4;

export const DEFAULT_LAYOUTS = {
  1: [{ x: 0.50, baselineY: 1.0, scale: 1.0, zIndex: 1 }],
  2: [
    { x: 0.32, baselineY: 1.0, scale: 0.95, zIndex: 1 },
    { x: 0.68, baselineY: 1.0, scale: 0.95, zIndex: 2 },
  ],
  3: [
    { x: 0.22, baselineY: 1.0, scale: 0.90, zIndex: 1 },
    { x: 0.50, baselineY: 1.0, scale: 0.90, zIndex: 2 },
    { x: 0.78, baselineY: 1.0, scale: 0.90, zIndex: 3 },
  ],
  4: [
    { x: 0.15, baselineY: 1.0, scale: 0.85, zIndex: 1 },
    { x: 0.38, baselineY: 1.0, scale: 0.85, zIndex: 2 },
    { x: 0.62, baselineY: 1.0, scale: 0.85, zIndex: 3 },
    { x: 0.85, baselineY: 1.0, scale: 0.85, zIndex: 4 },
  ],
};

/**
 * Returns default layout transform for a participant based on join order index.
 */
export function getDefaultParticipantTransform(joinIndex, totalCount) {
  const count = Math.min(MAX_STUDIO_PARTICIPANTS, Math.max(1, totalCount || 1));
  const layouts = DEFAULT_LAYOUTS[count] || DEFAULT_LAYOUTS[1];
  const safeIndex = Math.min(joinIndex, layouts.length - 1);
  const layout = layouts[safeIndex] || layouts[0];

  return {
    x: layout.x,
    baselineY: layout.baselineY,
    scale: layout.scale ?? 1.0,
    rotation: 0,
    isManual: false,
    zIndex: layout.zIndex ?? joinIndex + 1,
  };
}

/**
 * Bounds dragging coordinates to the safe studio staging area.
 */
export function constrainParticipantPosition(x, baselineY) {
  return {
    x: Math.min(0.92, Math.max(0.08, x)),
    baselineY: Math.min(1.08, Math.max(0.50, baselineY)),
  };
}
