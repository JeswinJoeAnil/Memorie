import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../constants/assets.js';
import { DraggableDeco } from './DraggableDeco.jsx';
import { DraggablePhoto } from './DraggablePhoto.jsx';
import { DoodleCanvas } from './DoodleCanvas.jsx';

function PhotoResultComponent({
  frame,
  photos,
  filter,
  accent,
  decorations,
  setDecorations,
  activeDecoId,
  setActiveDecoId,
  doodlePaths,
  setDoodlePaths,
  doodleBrush,
  stripTab,
  zoom,
  rotation,
  vignette,
  fitSettings,
  timestamp,
  photoScales,
  setPhotoScales,
  stripBackground,
  setPreviewScale,
  setPreviewWidth,
  stripElementRef,
}) {
  const wrapperRef = useRef(null);
  const stripRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [marginBottomVal, setMarginBottomVal] = useState(0);
  const [previewW, setPreviewW] = useState(380);

  const isCustom = frame.type === 'custom';

  useEffect(() => {
    if (!wrapperRef.current || !stripRef.current) return;
    const compute = () => {
      const wW = wrapperRef.current.clientWidth > 0 ? wrapperRef.current.clientWidth - 32 : 340;
      const rawH = wrapperRef.current.clientHeight;
      const wH = (rawH > 100 ? rawH : 550) - 32;
      const sW = stripRef.current.offsetWidth || 380;
      const sH = stripRef.current.offsetHeight || 800;
      if (!sW || !sH || wW <= 0) return;
      const s = Math.min(wW / sW, wH / sH, 1);
      const safeScale = Math.max(s, 0.42);
      setScale(safeScale);
      setMarginBottomVal(safeScale < 1 ? -(stripRef.current.offsetHeight * (1 - safeScale)) : 0);

      setPreviewW(sW);

      /* Report actual preview dimensions + scale to parent for export */
      if (setPreviewScale) setPreviewScale(safeScale);
      if (setPreviewWidth) setPreviewWidth(sW);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrapperRef.current);
    ro.observe(stripRef.current);
    return () => ro.disconnect();
  }, [photos.length, frame.id]);

  const onStripBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) setActiveDecoId(null);
  }, [setActiveDecoId]);

  const onPhotoSlotsClick = useCallback(() => {
    setActiveDecoId(null);
  }, [setActiveDecoId]);

  const makeDecoActivate = useCallback((id) => () => setActiveDecoId(id), [setActiveDecoId]);

  const setStripNode = useCallback((node) => {
    stripRef.current = node;
    if (stripElementRef) stripElementRef.current = node;
  }, [stripElementRef]);

  // ── Custom Template Overlay Rendering ──
  if (isCustom) {
    // frame.image is now the eagerly-imported URL; fall back to asset() for legacy string paths
    const templateImgSrc = frame.image?.startsWith?.('data:') || frame.image?.startsWith?.('blob:') || frame.image?.startsWith?.('/') || frame.image?.startsWith?.('http') ? frame.image : asset(frame.image || frame.imagePath);
    const slots = frame.photoSlots || [];
    // Use the template's native aspect ratio to set the preview height
    const stripWidth = 380;
    const stripHeight = stripWidth / frame.aspectRatio;

    return (
      <div ref={wrapperRef} className="strip-scale-wrapper">
        <div
          ref={setStripNode}
          className="photo-result photo-result-custom"
          role="img"
          aria-label={`Photo strip preview using the ${frame.name} custom template with ${photos.length} photos`}
          style={{
            '--accent': accent,
            width: `${stripWidth}px`,
            height: `${stripHeight}px`,
            transform: `scale(${scale}) rotate(-1.5deg)`,
            transformOrigin: 'top center',
            marginBottom: `${marginBottomVal}px`,
            position: 'relative',
            overflow: 'hidden',
          }}
          onClick={onStripBackdropClick}
        >
          {/* Photos positioned at slot coordinates behind the overlay */}
          {slots.map((slot, index) => {
            const photo = photos[index];
            if (!photo) return null;
            const pScale = photoScales?.[index] || { x: 1, y: 1 };
            const tilt = slot.rot !== undefined ? slot.rot : (frame.tilt || 0);
            return (
              <div
                key={`custom-slot-${index}`}
                className="custom-template-slot"
                style={{
                  position: 'absolute',
                  left: `${slot.x * 100}%`,
                  top: `${slot.y * 100}%`,
                  width: `${slot.w * 100}%`,
                  height: `${slot.h * 100}%`,
                  overflow: 'hidden',
                  borderRadius: slot.borderRadius || (frame.id === 'custom-capturing-moments' ? '50%' : '14px'),
                  transform: tilt ? `rotate(${tilt}deg)` : undefined,
                  transformOrigin: 'center center',
                }}
              >
                <img
                  src={photo}
                  alt=""
                  aria-hidden="true"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: fitSettings?.[index] === 'contain' ? 'contain' : 'cover',
                    filter: filter.css || 'none',
                    transform: `scale(${pScale.x * zoom}, ${pScale.y * zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            );
          })}

          {/* Template overlay on top */}
          <img
            src={templateImgSrc}
            alt=""
            aria-hidden="true"
            className="custom-template-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />

          <DoodleCanvas stripTab={stripTab} doodlePaths={doodlePaths} setDoodlePaths={setDoodlePaths} doodleBrush={doodleBrush} previewWidth={previewW} />

          <div className="decorations-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 22 }}>
            {decorations.map(deco => (
              <DraggableDeco key={`${deco.id}-${deco.dragKey || 0}`} deco={deco} setDecorations={setDecorations} isActive={activeDecoId === deco.id} onPointerDown={makeDecoActivate(deco.id)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Default Template Rendering (unchanged) ──
  return (
    <div ref={wrapperRef} className="strip-scale-wrapper">
      <div
        ref={setStripNode}
        className={`photo-result frame-${frame.id}`}
        role="img"
        aria-label={`Photo strip preview using the ${frame.name} template with ${photos.length} photos`}
        style={{
          '--accent': accent,
          '--vignette': `${vignette / 100}`,
          background: stripBackground?.type === 'gradient'
            ? `linear-gradient(180deg, ${stripBackground.from}, ${stripBackground.to})`
            : (stripBackground?.value || ''),
          transform: `scale(${scale}) rotate(-1.5deg)`,
          transformOrigin: 'top center',
          marginBottom: `${marginBottomVal}px`,
        }}
        onClick={onStripBackdropClick}
      >
        <div className="result-meta">{timestamp.time} / {timestamp.date}</div>
        {(!photos || photos.length === 0) && (
          <div role="status" style={{ padding: '32px 16px', textAlign: 'center', background: 'rgba(0,0,0,.06)', borderRadius: 12, fontSize: 13, fontWeight: 700, color: '#655d56' }}>
            No photos yet — your captures will appear here. Sample images are never added to your strip.
          </div>
        )}
        {(photos || []).map((photo, index) => (
          <DraggablePhoto
            key={`photo-${index}`}
            photo={photo}
            filter={filter}
            index={index}
            zoom={zoom}
            rotation={rotation}
            fitMode={fitSettings?.[index]}
            scale={photoScales?.[index] || { x: 1, y: 1 }}
            onScale={(newScale) => setPhotoScales?.(prev => ({ ...prev, [index]: newScale }))}
            isActive={activeDecoId === `photo-${index}`}
            onPointerDown={() => setActiveDecoId?.(`photo-${index}`)}
          />
        ))}

        <DoodleCanvas stripTab={stripTab} doodlePaths={doodlePaths} setDoodlePaths={setDoodlePaths} doodleBrush={doodleBrush} previewWidth={previewW} />

        <div className="decorations-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 22 }}>
          {decorations.map(deco => (
            <DraggableDeco key={`${deco.id}-${deco.dragKey || 0}`} deco={deco} setDecorations={setDecorations} isActive={activeDecoId === deco.id} onPointerDown={makeDecoActivate(deco.id)} />
          ))}
        </div>
        <div className="tape tape-a" />
        <div className="tape tape-b" />
        <div className="result-doodles">✧ ⋆ ˚｡⋆୨୧˚</div>
      </div>
    </div>
  );
}

export const PhotoResult = memo(PhotoResultComponent);
