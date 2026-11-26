export function doodlePointToExport(p, baseW, baseH, fallbackWidth = 380) {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  if (Math.abs(p.x) <= 1.5 && Math.abs(p.y) <= 1.5) {
    return { x: p.x * baseW, y: p.y * baseH };
  }
  const s = baseW / (fallbackWidth || 380);
  return { x: p.x * s, y: p.y * s };
}

export function doodleWidthToExport(path, baseW) {
  const fallback = path?.previewWidth || 380;
  const size = Number(path?.size) || 6;
  return size * (baseW / fallback);
}
