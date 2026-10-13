/**
 * Device tier detection + adaptive studio config.
 * Runs once per session; cheap heuristics, no async work.
 * Tiers: 'high' | 'balanced' | 'performance'
 */

function isMobileUA() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function coreCount() {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  }
  return 4;
}

function deviceMemoryGB() {
  // Chrome-only; undefined elsewhere
  if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
    return navigator.deviceMemory;
  }
  return 4;
}

export function detectDeviceTier() {
  // Explicit override for testing: ?studio-tier=performance
  try {
    const q = new URLSearchParams(window.location.search).get('studio-tier');
    if (q === 'high' || q === 'balanced' || q === 'performance') return q;
  } catch {}
  const cores = coreCount();
  const mem = deviceMemoryGB();
  const mobile = isMobileUA();
  if (mobile && (cores <= 4 || mem <= 3)) return 'performance';
  if (mobile || cores <= 4 || mem <= 4) return 'balanced';
  if (cores >= 8 && mem >= 8 && !mobile) return 'high';
  return 'balanced';
}

/**
 * Adaptive config per tier. Preview stays smooth; capture always uses HQ path.
 */
export function getTierConfig(tier) {
  switch (tier) {
    case 'high':
      return {
        tier,
        // Preview composite resolution (capture is independent, always HD)
        compositeWidth: 1280,
        compositeHeight: 720,
        // AI input fed to the segmenter (small = fast, quality preserved via full-res cutout)
        segInputSize: 192,
        // Max AI runs per second per participant
        segFps: 12,
        // Temporal smoothing: higher = steadier, lower = more responsive
        temporalAlpha: 0.65, // weight of current frame
        maskThresholdLow: 0.35,
        maskThresholdHigh: 0.72,
        enableShadows: true,
        enableGlow: true,
        smoothingQuality: 'medium',
      };
    case 'performance':
      return {
        tier,
        compositeWidth: 854,
        compositeHeight: 480,
        segInputSize: 144,
        segFps: 6,
        temporalAlpha: 0.55,
        maskThresholdLow: 0.38,
        maskThresholdHigh: 0.72,
        enableShadows: false,
        enableGlow: false,
        smoothingQuality: 'low',
      };
    case 'balanced':
    default:
      return {
        tier: 'balanced',
        compositeWidth: 960,
        compositeHeight: 540,
        segInputSize: 160,
        segFps: 8,
        temporalAlpha: 0.6,
        maskThresholdLow: 0.35,
        maskThresholdHigh: 0.72,
        enableShadows: true,
        enableGlow: true,
        smoothingQuality: 'low',
      };
  }
}

export function intervalForCountAndTier(count, tierConfig) {
  const base = 1000 / Math.max(1, tierConfig.segFps);
  // Slight backoff as participants join (AI cost is per-person)
  if (count <= 1) return base;
  if (count === 2) return base * 1.15;
  if (count === 3) return base * 1.3;
  return base * 1.5;
}
