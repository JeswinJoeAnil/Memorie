/**
 * Studio Capture Coordinator
 * Coordinates synchronized multi-shot photo sequences across remote clients.
 * Captures high-resolution, flattened group photos tailored for the photo strip layout.
 */

export function computeCaptureTimestamps(
  totalShots = 4,
  timerSec = 3,
  startTimeMs = Date.now()
) {
  const firstCaptureAt = startTimeMs + (timerSec > 0 ? timerSec * 1000 : 0);
  const shotIntervalMs = 1600;

  return Array.from({ length: totalShots }, (_, i) => {
    return firstCaptureAt + i * (timerSec > 0 ? timerSec * 1000 + shotIntervalMs : shotIntervalMs);
  });
}

function sleepUntil(targetMs) {
  const delay = Math.max(0, targetMs - Date.now());
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function executeCaptureSequence({
  totalShots = 4,
  timerSec = 3,
  captureTimestamps = [],
  compositorEngine,
  split,
  background,
  getSceneParticipants,
  onCountdown = () => {},
  onFlash = () => {},
  onShotIndex = () => {},
  isCancelled = () => false,
}) {
  const capturedPhotos = [];

  for (let shot = 1; shot <= totalShots; shot++) {
    if (isCancelled()) break;

    onShotIndex(shot);

    const captureAt =
      captureTimestamps[shot - 1] ??
      Date.now() + (timerSec > 0 ? timerSec * 1000 : 0);

    // 1. Synchronized countdown sequence
    if (timerSec > 0) {
      const countdownStart = captureAt - timerSec * 1000;
      await sleepUntil(countdownStart);

      for (let sec = timerSec; sec > 0; sec--) {
        if (isCancelled()) break;
        onCountdown(sec);
        await sleepUntil(captureAt - (sec - 1) * 1000);
      }
      onCountdown(null);
    } else {
      await sleepUntil(captureAt);
    }

    if (isCancelled()) break;

    // 2. Trigger flash effect
    onFlash();

    // 3. Render high-resolution composition snapshot matching photostrip frame
    if (compositorEngine) {
      const participants = getSceneParticipants();
      const photoDataUrl = await compositorEngine.captureHD({
        background,
        split,
        sceneParticipants: participants,
        targetWidth: 1600,
        targetHeight: 900,
      });

      if (photoDataUrl) {
        capturedPhotos.push(photoDataUrl);
      }
    }

    // 4. Breathing room before next shot in multi-shot session
    if (shot < totalShots && !isCancelled()) {
      await sleepUntil(captureAt + 1200);
    }
  }

  onCountdown(null);
  onShotIndex(null);

  return capturedPhotos;
}
