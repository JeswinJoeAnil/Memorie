import React, { useRef, useState } from 'react';

function toPixelPoints(points, previewWidth, viewHeight) {
  if (!Array.isArray(points)) return [];
  return points.map((p) => {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    // Legacy pixel format (pre-normalized): already in previewWidth units
    if (Math.abs(p.x) > 1.5 || Math.abs(p.y) > 1.5) return p;
    return { x: p.x * previewWidth, y: p.y * viewHeight };
  }).filter(Boolean);
}

export function DoodleCanvas({ stripTab, doodlePaths, setDoodlePaths, doodleBrush, previewWidth = 380 }) {
  const [currentPath, setCurrentPath] = useState(null);
  const containerRef = useRef(null);

  const handlePointerDown = (e) => {
    if (stripTab !== 'doodle') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPath({ points: [{ x, y }], ...doodleBrush, previewWidth });
    try { e.target.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const handlePointerMove = (e) => {
    if (stripTab !== 'doodle' || !currentPath) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPath((prev) => {
      if (!prev) return prev;
      const last = prev.points[prev.points.length - 1];
      // Drop duplicate events to keep paths small
      if (last && Math.abs(last.x - x) < 0.001 && Math.abs(last.y - y) < 0.001) return prev;
      return { ...prev, points: [...prev.points, { x, y }] };
    });
  };

  const handlePointerUp = (e) => {
    if (!currentPath) return;
    if (currentPath.points.length >= 2) {
      setDoodlePaths((prev) => [...prev, currentPath]);
    }
    setCurrentPath(null);
    try { e.target.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const viewHeight = containerRef.current && containerRef.current.offsetWidth > 0
    ? (containerRef.current.offsetHeight * (previewWidth / containerRef.current.offsetWidth))
    : previewWidth * 2;

  const renderPaths = (Array.isArray(doodlePaths) ? doodlePaths : []).map((path, i) => ({
    key: i,
    path,
    px: toPixelPoints(path.points, previewWidth, viewHeight),
  }));

  const currentPx = currentPath ? toPixelPoints(currentPath.points, previewWidth, viewHeight) : [];

  return (
    <div
      ref={containerRef}
      className={`doodle-overlay ${stripTab === 'doodle' ? 'active' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: stripTab === 'doodle' ? 26 : 4,
        pointerEvents: stripTab === 'doodle' ? 'auto' : 'none',
        touchAction: 'none',
        cursor: stripTab === 'doodle' ? 'crosshair' : 'inherit',
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${previewWidth} ${viewHeight}`} style={{ overflow: 'visible' }}>
        {renderPaths.map(({ key, path, px }) => (
          px.length >= 1 && (
            <polyline key={key} points={px.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={path.color} strokeWidth={path.size} strokeLinecap="round" strokeLinejoin="round" filter={path.shadow ? `drop-shadow(0px 0px ${path.shadow}px ${path.color})` : 'none'} />
          )
        ))}
        {currentPath && currentPx.length >= 1 && (
          <polyline points={currentPx.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={currentPath.color} strokeWidth={currentPath.size} strokeLinecap="round" strokeLinejoin="round" filter={currentPath.shadow ? `drop-shadow(0px 0px ${currentPath.shadow}px ${currentPath.color})` : 'none'} />
        )}
      </svg>
    </div>
  );
}
