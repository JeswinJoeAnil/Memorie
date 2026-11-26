import React, { useEffect, useMemo, useRef, useState } from 'react';

import { doodlePointToExport, doodleWidthToExport } from '../utils/doodleGeometry.js';

function toPixelPoints(points, width, height, originalWidth = width) {
  return (points || []).map(point => doodlePointToExport(point, width, height, originalWidth)).filter(Boolean);
}

export function DoodleCanvas({ stripTab, doodlePaths, setDoodlePaths, doodleBrush, previewWidth = 380 }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const strokeRef = useRef(null);
  const active = useRef(null);
  const [viewHeight, setViewHeight] = useState(previewWidth * 2);
  useEffect(() => {
    const node = containerRef.current;
    const measure = () => {
      if (node.offsetWidth) setViewHeight(node.offsetHeight * previewWidth / node.offsetWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [previewWidth]);

  const appendPoint = e => {
    const stroke = active.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const previous = stroke.path.points.at(-1);
    if (previous && Math.abs(previous.x - x) < 0.001 && Math.abs(previous.y - y) < 0.001) return;
    stroke.path.points.push({ x, y });
    const point = svgRef.current.createSVGPoint();
    point.x = x * previewWidth;
    point.y = y * viewHeight;
    strokeRef.current.points.appendItem(point);
  };

  const handlePointerDown = e => {
    if (stripTab !== 'doodle' || active.current || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = { pointerId: e.pointerId, path: { ...doodleBrush, previewWidth, points: [] } };
    strokeRef.current.points.clear();
    appendPoint(e);
  };

  const handlePointerUp = e => {
    const stroke = active.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    appendPoint(e);
    if (stroke.path.points.length >= 2) setDoodlePaths(prev => [...prev, stroke.path]);
    active.current = null;
    strokeRef.current.points.clear();
  };

  const renderPaths = useMemo(() => (doodlePaths || []).map((path, key) => ({
    key, path, px: toPixelPoints(path.points, previewWidth, viewHeight, path.previewWidth),
  })), [doodlePaths, previewWidth, viewHeight]);

  return (
    <div
      ref={containerRef}
      className={`doodle-overlay ${stripTab === 'doodle' ? 'active' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={appendPoint}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: stripTab === 'doodle' ? 26 : 20,
        pointerEvents: stripTab === 'doodle' ? 'auto' : 'none',
        touchAction: 'none',
        cursor: stripTab === 'doodle' ? 'crosshair' : 'inherit',
      }}
    >
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${previewWidth} ${viewHeight}`} style={{ overflow: 'visible' }}>
        {renderPaths.map(({ key, path, px }) => (
          px.length >= 1 && (
            <polyline key={key} points={px.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={path.color} strokeWidth={doodleWidthToExport(path, previewWidth)} strokeLinecap="round" strokeLinejoin="round" filter={path.shadow ? `drop-shadow(0px 0px ${path.shadow}px ${path.color})` : 'none'} />
          )
        ))}
        <polyline ref={strokeRef} fill="none" stroke={doodleBrush.color} strokeWidth={doodleBrush.size}
          strokeLinecap="round" strokeLinejoin="round"
          filter={doodleBrush.shadow ? `drop-shadow(0px 0px ${doodleBrush.shadow}px ${doodleBrush.color})` : undefined} />
      </svg>
    </div>
  );
}
