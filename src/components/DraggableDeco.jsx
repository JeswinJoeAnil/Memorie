import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { asset } from '../constants/assets.js';
import { DecoHandles } from './DecoHandles.jsx';

function DecoImage({ name }) {
  const src = asset(name);
  if (!src) return <span style={{ fontSize: 11 }}>…</span>;
  return <img src={src} alt="" onError={(e) => { e.target.style.display = 'none'; }} style={{ width: name.startsWith('premium_') ? 48 : 100, display: 'block', pointerEvents: 'none' }} draggable="false" />;
}

export function DraggableDeco({ deco, setDecorations, isActive, onPointerDown }) {
  const elementRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef(null);

  const handlePointerDown = e => {
    if (e.button !== 0 || e.target.closest('.deco-handle, .deco-corner')) return;
    const parent = e.currentTarget.closest('.decorations-layer').getBoundingClientRect();
    if (!parent.width || !parent.height) return;
    onPointerDown(e);
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: deco.x, y: deco.y, parent };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = e => {
    const start = drag.current;
    if (start?.id !== e.pointerId) return;
    const x = Math.max(0, Math.min(100, start.x + 100 * (e.clientX - start.startX) / start.parent.width));
    const y = Math.max(0, Math.min(100, start.y + 100 * (e.clientY - start.startY) / start.parent.height));
    setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, x, y } : d));
  };

  const handleDragEnd = e => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setIsDragging(false);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.target !== e.currentTarget) return;
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
        role="group"
        aria-label={ariaLabel}
        aria-roledescription="draggable decoration"
        onFocus={onPointerDown}
        onKeyDown={handleKeyDown}
        onPointerMove={handlePointerMove}
        onLostPointerCapture={handleDragEnd}
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
      role="group"
      aria-label={ariaLabel}
      aria-roledescription="draggable decoration"
      onFocus={onPointerDown}
        onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onLostPointerCapture={handleDragEnd}
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

