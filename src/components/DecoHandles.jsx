import React from 'react';
import { ArrowLeftRight, ArrowUpDown, RotateCw, Sparkles, Trash2 } from 'lucide-react';

export function DecoHandles({ deco, setDecorations, elementRef, hideDelete = false }) {
  const handleResize = (e) => {
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const rect = elementRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const startScaleX = deco.scaleX || 1;
    const startScaleY = deco.scaleY || 1;

    const ac = new AbortController();
    const onMove = (moveEvent) => {
      const currentDist = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
      const ratio = currentDist / Math.max(1, startDist);
      setDecorations(prev => prev.map(d => d.id === deco.id ? { 
        ...d, 
        scaleX: Math.max(0.1, startScaleX * ratio),
        scaleY: Math.max(0.1, startScaleY * ratio)
      } : d));
    };
    const onUp = (upEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      ac.abort();
    };
    target.addEventListener('pointermove', onMove, { signal: ac.signal });
    target.addEventListener('pointerup', onUp, { signal: ac.signal });
    target.addEventListener('pointercancel', onUp, { signal: ac.signal });
  };

  const handleStretchX = (e) => {
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const rect = elementRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rad = (deco.rotation || 0) * (Math.PI / 180);
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);

    const startDx = e.clientX - centerX;
    const startDy = e.clientY - centerY;
    const startLocalX = Math.max(1, Math.abs(startDx * cos - startDy * sin));
    const startScaleX = deco.scaleX || 1;

    const ac = new AbortController();
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - centerX;
      const dy = moveEvent.clientY - centerY;
      const currentLocalX = Math.abs(dx * cos - dy * sin);
      const ratio = currentLocalX / startLocalX;
      setDecorations(prev => prev.map(d => d.id === deco.id ? {
        ...d,
        scaleX: Math.max(0.1, Math.min(10, startScaleX * ratio))
      } : d));
    };
    const onUp = (upEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      ac.abort();
    };
    target.addEventListener('pointermove', onMove, { signal: ac.signal });
    target.addEventListener('pointerup', onUp, { signal: ac.signal });
    target.addEventListener('pointercancel', onUp, { signal: ac.signal });
  };

  const handleStretchY = (e) => {
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const rect = elementRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rad = (deco.rotation || 0) * (Math.PI / 180);
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);

    const startDx = e.clientX - centerX;
    const startDy = e.clientY - centerY;
    const startLocalY = Math.max(1, Math.abs(startDx * sin + startDy * cos));
    const startScaleY = deco.scaleY || 1;

    const ac = new AbortController();
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - centerX;
      const dy = moveEvent.clientY - centerY;
      const currentLocalY = Math.abs(dx * sin + dy * cos);
      const ratio = currentLocalY / startLocalY;
      setDecorations(prev => prev.map(d => d.id === deco.id ? {
        ...d,
        scaleY: Math.max(0.1, Math.min(10, startScaleY * ratio))
      } : d));
    };
    const onUp = (upEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      ac.abort();
    };
    target.addEventListener('pointermove', onMove, { signal: ac.signal });
    target.addEventListener('pointerup', onUp, { signal: ac.signal });
    target.addEventListener('pointercancel', onUp, { signal: ac.signal });
  };

  const handleRotate = (e) => {
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const rect = elementRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const startRotation = deco.rotation || 0;

    const ac = new AbortController();
    const onMove = (moveEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * (180 / Math.PI);
      let delta = currentAngle - startAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, rotation: startRotation + delta } : d));
    };
    const onUp = (upEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      ac.abort();
    };
    target.addEventListener('pointermove', onMove, { signal: ac.signal });
    target.addEventListener('pointerup', onUp, { signal: ac.signal });
    target.addEventListener('pointercancel', onUp, { signal: ac.signal });
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setDecorations(prev => prev.filter(d => d.id !== deco.id));
  };

  function keyboardAdjust(e, operation) {
    if (e.detail !== 0) return;
    e.stopPropagation();
    setDecorations(prev => prev.map(d => {
      if (d.id !== deco.id) return d;
      if (operation === 'rotate') return { ...d, rotation: (d.rotation || 0) + 15 };
      const factor = e.shiftKey ? 1 / 1.1 : 1.1;
      return { ...d,
        scaleX: Math.max(0.1, Math.min(10, (d.scaleX || 1) * (operation === 'height' ? 1 : factor))),
        scaleY: Math.max(0.1, Math.min(10, (d.scaleY || 1) * (operation === 'width' ? 1 : factor))),
      };
    }));
  }

  const invScale = {
    scale: `${1 / (deco.scaleX || 1)} ${1 / (deco.scaleY || 1)}`,
  };

  return (
    <>
      {!hideDelete && <button type="button" aria-label="Remove" className="deco-handle delete-handle" data-tip="Remove" onClick={handleDelete} style={invScale}>
        <Trash2 size={11} />
      </button>}
      {!hideDelete && <button type="button" aria-label="Rotate" className="deco-handle rotate-handle" data-tip="Rotate" onPointerDown={handleRotate} onClick={e => keyboardAdjust(e, 'rotate')} style={invScale}>
        <RotateCw size={13} />
      </button>}
      <button type="button" aria-label="Scale All" className="deco-handle resize-handle" data-tip="Scale All" onPointerDown={handleResize} onClick={e => keyboardAdjust(e, 'both')} style={invScale}>
        <Sparkles size={13} />
      </button>

      {/* Stretch Handles (Horizontal X & Vertical Y) */}
      <button type="button" aria-label="Stretch Width" className="deco-handle stretch-x-handle" data-tip="Stretch Width" onPointerDown={handleStretchX} onClick={e => keyboardAdjust(e, 'width')} style={invScale}>
        <ArrowLeftRight size={13} />
      </button>
      <button type="button" aria-label="Stretch Height" className="deco-handle stretch-y-handle" data-tip="Stretch Height" onPointerDown={handleStretchY} onClick={e => keyboardAdjust(e, 'height')} style={invScale}>
        <ArrowUpDown size={13} />
      </button>

      {/* Corner Dots - uniform scale */}
      <div className="deco-corner top-left" onPointerDown={handleResize} style={invScale} />
      <div className="deco-corner top-right" onPointerDown={handleResize} style={invScale} />
      <div className="deco-corner bottom-left" onPointerDown={handleResize} style={invScale} />
      <div className="deco-corner bottom-right" onPointerDown={handleResize} style={invScale} />
    </>
  );
}

