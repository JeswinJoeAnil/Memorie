export function isStripFull(capturedLength, mode) {
  return Number.isFinite(capturedLength) && Number.isFinite(mode) && mode > 0 && capturedLength >= mode;
}

export function needsBurstConfirm(capturedLength) {
  return Number.isFinite(capturedLength) && capturedLength > 0;
}

export function burstConfirmMessage(capturedLength, totalShots) {
  return `Start Burst? This will replace your ${capturedLength} photo${capturedLength === 1 ? '' : 's'} with ${totalShots} new shots.`;
}

export function fullStripMessage(mode) {
  return `Strip is full with ${mode} photos. Clear the roll or remove the last photo to take more.`;
}
