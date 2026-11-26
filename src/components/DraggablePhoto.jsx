import { GradedPhoto } from './GradedPhoto.jsx';
import React, { memo, useCallback, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { DecoHandles } from './DecoHandles.jsx';

function DraggablePhotoComponent({ 
  photo, 
  filter, 
  index, 
  zoom, 
  rotation, 
  fitMode, 
  scale = { x: 1, y: 1 }, 
  onScale, 
  isActive, 
  onPointerDown 
}) {
  const elementRef = useRef(null);
  const dragControls = useDragControls();

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('.deco-handle')) return;
    onPointerDown(e);
    dragControls.start(e);
  }, [dragControls, onPointerDown]);
  
  return (
    <motion.div
      ref={elementRef}
      tabIndex={0}
      onFocus={onPointerDown}
      className={`photo-slot ${isActive ? 'active-deco' : ''}`}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!delta) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        onScale({ dx: (scale.dx || 0) + delta[0] * step, dy: (scale.dy || 0) + delta[1] * step });
      }}
      onDragEnd={(_, info) => {
        const strip = elementRef.current.closest('.photo-result');
        const factor = strip.getBoundingClientRect().width / strip.offsetWidth || 1;
        onScale({ dx: (scale.dx || 0) + info.offset.x / factor, dy: (scale.dy || 0) + info.offset.y / factor });
      }}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      onPointerDown={handlePointerDown}
      whileDrag={{ scale: 1.035, zIndex: 5 }}
      whileHover={{ outline: '2px dashed var(--accent)', outlineOffset: '2px' }}
      style={{
        x: scale.dx || 0,
        y: scale.dy || 0,
        rotate: rotation + (index % 2 ? 1.5 : -1.2),
        scaleX: scale.x ?? 1,
        scaleY: scale.y ?? 1,
        zIndex: isActive ? 10 : 1,
        cursor: 'grab',
        borderRadius: '4px',
      }}
    >
      <GradedPhoto filter={filter} index={index}
        src={photo}
        style={{
          transform: `scale(${zoom})`,
          objectFit: fitMode === 'contain' ? 'contain' : 'cover',
          background: '#000',
          pointerEvents: 'none'
        }}
        alt={`Photo ${index + 1} in the strip`}
      />
      <span>{String(index + 1).padStart(2, '0')}</span>
      {isActive && (
        <DecoHandles
          deco={{ id: `photo-${index}`, scaleX: scale.x ?? 1, scaleY: scale.y ?? 1, rotation: 0 }}
          setDecorations={(updater) => {
            // Mock deco array update for photo scaling
            const mockPrev = [{ id: `photo-${index}`, scaleX: scale.x ?? 1, scaleY: scale.y ?? 1, rotation: 0 }];
            const result = typeof updater === 'function' ? updater(mockPrev) : updater;
            const updated = result.find(d => d.id === `photo-${index}`);
            if (updated) onScale?.({ x: updated.scaleX, y: updated.scaleY });
          }}
          elementRef={elementRef}
          hideDelete
        />
      )}
    </motion.div>
  );
}

export const DraggablePhoto = memo(DraggablePhotoComponent);
