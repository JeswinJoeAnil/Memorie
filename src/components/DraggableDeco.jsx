import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { asset, resolveAssetAsync } from '../constants/assets.js';
import { DecoHandles } from './DecoHandles.jsx';

function DecoImage({ name }) {
  const [src, setSrc] = useState(() => asset(name));
  useEffect(() => {
    let live = true;
    if (asset(name)) return () => { live = false; };
    resolveAssetAsync(name).then((url) => { if (live && url) setSrc(url); });
    return () => { live = false; };
  }, [name]);
  if (!src) return <span style={{ fontSize: 11 }}>…</span>;
  return <img src={src} alt="" onError={(e) => { e.target.style.display = 'none'; }} style={{ width: 100, display: 'block', pointerEvents: 'none' }} draggable="false" />;
}

export function DraggableDeco({ deco, setDecorations, isActive, onPointerDown }) {
  const elementRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragControls = useDragControls();

  const handleDrag = useCallback((event, info) => {
    const parent = elementRef.current?.closest('.decorations-layer');
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const dxPct = (info.delta.x / parentRect.width) * 100;
    const dyPct = (info.delta.y / parentRect.height) * 100;
    setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, x: Math.min(100, Math.max(0, d.x + dxPct)), y: Math.min(100, Math.max(0, d.y + dyPct)) } : d));
  }, [deco.id, setDecorations]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('.deco-handle')) return;
    onPointerDown(e);
    dragControls.start(e);
  }, [dragControls, onPointerDown]);

  const handleKeyDown = useCallback((e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, x: Math.max(0, d.x - step) } : d));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, x: Math.min(100, d.x + step) } : d));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, y: Math.max(0, d.y - step) } : d));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, y: Math.min(100, d.y + step) } : d));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setDecorations(prev => prev.filter(d => d.id !== deco.id));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, scaleX: (d.scaleX || 1) * 1.1, scaleY: (d.scaleY || 1) * 1.1 } : d));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, scaleX: Math.max(0.2, (d.scaleX || 1) * 0.9), scaleY: Math.max(0.2, (d.scaleY || 1) * 0.9) } : d));
    } else if (e.key === '[') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, rotation: (d.rotation || 0) - 15 } : d));
    } else if (e.key === ']') {
      e.preventDefault();
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, rotation: (d.rotation || 0) + 15 } : d));
    }
  }, [deco.id, setDecorations]);

  const style = {
    position: 'absolute',
    top: `${deco.y}%`,
    left: `${deco.x}%`,
    x: '-50%',
    y: '-50%',
    scaleX: deco.scaleX ?? 1,
    scaleY: deco.scaleY ?? 1,
    rotate: deco.rotation,
    zIndex: isActive ? 24 : 12,
    cursor: isDragging ? 'grabbing' : 'grab',
    pointerEvents: 'auto',
    touchAction: 'none',
    transition: 'box-shadow 0.2s ease',
    boxShadow: isActive ? '0 0 0 2px var(--accent), 0 4px 12px rgba(0,0,0,0.15)' : 'none',
    borderRadius: '8px',
  };

  const className = `drag-sticker ${isActive ? 'active-deco' : ''} ${deco.isSmall ? 'small' : ''} ${deco.isChrome ? 'chrome' : ''}`;
  const ariaLabel = deco.type === 'text' ? `Text decoration: ${deco.content}. Use arrow keys to move, Delete to remove.` : `Sticker: ${deco.content}. Use arrow keys to move, Delete to remove.`;

  if (deco.type === 'text') {
    const bgStyle = deco.showBg !== false ? { background: deco.bgColor || '#ff5aaf', padding: '8px 16px', borderRadius: '99px' } : { background: 'transparent', padding: 0 };
    return (
      <motion.div
        className={className}
        ref={elementRef}
        data-deco-id={deco.id}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        aria-roledescription="draggable decoration"
        onKeyDown={handleKeyDown}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ ...style, color: deco.color, fontFamily: deco.font, boxShadow: 'none', textShadow: '0 2px 8px rgba(0,0,0,0.1)', ...bgStyle }}
        onPointerDown={handlePointerDown}
        whileTap={{ scale: 1.05 }}
        transition={{ type: 'tween', duration: 0 }}
      >
        {deco.content}
        {isActive && <DecoHandles deco={deco} setDecorations={setDecorations} elementRef={elementRef} />}
      </motion.div>
    );
  }
  const bgStyle = deco.showBg !== false ? { background: deco.bgColor || '#ff5aaf', padding: deco.isImage ? '8px' : '8px 16px', borderRadius: deco.isImage ? '12px' : '99px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { background: 'transparent', padding: 0 };
  return (
    <motion.div
      className={className}
      ref={elementRef}
      data-deco-id={deco.id}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      aria-roledescription="draggable decoration"
      onKeyDown={handleKeyDown}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      style={{ ...style, ...bgStyle, color: deco.showBg !== false ? '#fff' : 'inherit' }}
      onPointerDown={handlePointerDown}
      whileTap={{ scale: (deco.scale ?? 1) * 1.05 }}
      transition={{ type: 'tween', duration: 0 }}
    >
      {deco.isImage ? <DecoImage name={deco.content} /> : deco.content}
      {isActive && <DecoHandles deco={deco} setDecorations={setDecorations} elementRef={elementRef} />}
    </motion.div>
  );
}

