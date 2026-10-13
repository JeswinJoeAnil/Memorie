import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Download,
  Film,
  Grid2X2,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { renderExport } from '../utils/exportCanvas.js';
import { DevelopingOverlay } from './DevelopingOverlay.jsx';
import { PhotoResult } from './PhotoResult.jsx';
import { StripEditor } from './StripEditor.jsx';

function MemoryLabComponent(props) {
  const {
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
    setDoodleBrush,
    developing,
    setDeveloping,
    zoom,
    setZoom,
    rotation,
    setRotation,
    vignette,
    stripTab,
    setStripTab,
    accentColor,
    captured,
    fitSettings,
    setFitSettings,
    timestamp,
    mode,
    onShuffle,
     photoScales,
     setPhotoScales,
     stripBackground,
     setStripBackground,
     resultImage,
     setResultImage,
     previewScale = 1,
     previewWidth = 380,
     stripElementRef,
     exportOnly,
   } = props;

  const exportRef = useRef(null);
  const blobUrlsRef = useRef([]);
  const [exportStatus, setExportStatus] = useState('');

  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, []);

  const exportCanvas = useCallback(async (type) => {
    if (type !== 'png' && type !== 'jpg') {
      setExportStatus('That export format is not available yet.');
      return;
    }
    if (!Array.isArray(photos) || photos.length === 0) {
      setExportStatus('Capture photos first — nothing to download yet.');
      return;
    }

    setDeveloping(type);
    setExportStatus(`Preparing ${type.toUpperCase()} download...`);
    try {
      // No artificial delay — render immediately so repeated exports feel instant.
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      setExportStatus(`Compositing ${photos.length} photo${photos.length === 1 ? '' : 's'}...`);
      const canvas = await renderExport({
        frame,
        photos,
        filter,
        accent,
        decorations,
        doodlePaths,
        zoom,
        rotation,
        vignette,
        fitSettings,
        photoScales,
        timestamp,
        stripBackground,
        previewScale,
        previewWidth,
        stripElement: stripElementRef?.current || null,
      });

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error('Could not generate image.'));
        }, type === 'png' ? 'image/png' : 'image/jpeg', 0.92);
      });

      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.push(url);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const link = document.createElement('a');
      link.download = `memorie-${stamp}-${frame.id}.${type === 'png' ? 'png' : 'jpg'}`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep URL alive for mobile long-press overlay; revoke on next export/unmount/close.
      setResultImage?.((prev) => {
        if (typeof prev === 'string' && prev.startsWith('blob:')) {
          try { URL.revokeObjectURL(prev); } catch { /* noop */ }
        }
        return url;
      });
      setExportStatus(`${type.toUpperCase()} ready — download started. Tap preview to save on mobile.`);
    } catch (err) {
      console.error('Export failed:', err);
      setExportStatus('Download failed. One of the assets might have failed to load.');
    } finally {
      setDeveloping(null);
    }
  }, [accent, decorations, doodlePaths, filter, fitSettings, frame, photos, photoScales, rotation, setDeveloping, setResultImage, stripBackground, timestamp, vignette, zoom, previewScale, previewWidth]);

  const downloadSingleImage = useCallback((img, index) => {
    const link = document.createElement('a');
    link.href = img;
    link.download = `memorie-photo-${index + 1}.png`;
    link.click();
    setExportStatus(`Photo ${index + 1} downloaded.`);
  }, []);

  const closeResult = useCallback(() => {
    setResultImage?.((prev) => {
      if (typeof prev === 'string' && prev.startsWith('blob:')) {
        try { URL.revokeObjectURL(prev); } catch { /* noop */ }
        blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== prev);
      }
      return null;
    });
  }, [setResultImage]);

  /* ── exportOnly mode: only render export buttons + overlays ── */
  if (exportOnly) {
    const photoCount = Array.isArray(photos) ? photos.length : 0;
    const hasPhotos = photoCount > 0;
    const incomplete = hasPhotos && typeof mode === 'number' && photoCount < mode;
    return (
      <>
        <div className="export-grid">
          <button type="button" onClick={() => exportCanvas('png')} disabled={!hasPhotos} title={hasPhotos ? 'Download full strip as PNG (best quality)' : 'Capture photos first'}><ImageIcon size={18} /> Download <span>PNG · best</span><Download size={16} /></button>
          <button type="button" onClick={() => exportCanvas('jpg')} disabled={!hasPhotos} title={hasPhotos ? 'Download full strip as JPG (smaller file)' : 'Capture photos first'}><Grid2X2 size={18} /> Download <span>JPG · small</span><Download size={16} /></button>
        </div>
        {!hasPhotos && <p className="export-status" role="status">Capture photos first — we never export sample photos.</p>}
        {incomplete && <p className="export-status" role="status">Incomplete strip ({photoCount}/{mode}) — download includes only your photos.</p>}
        {exportStatus && <p className="export-status" role="status" aria-live="polite">{exportStatus}</p>}
        <AnimatePresence>
          {resultImage && (
            <motion.div
              className="mobile-result-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                URL.revokeObjectURL(resultImage);
                setResultImage?.(null);
              }}
            >
              <div className="mobile-result-content" onClick={e => e.stopPropagation()}>
                <div className="mobile-result-header">
                  <h3>Save your Memory</h3>
                  <p>Long press the image to save it to your photos</p>
                </div>
                <div className="result-img-container">
                  <img src={resultImage} alt="Your photobooth strip" />
                </div>
                <button
                  type="button"
                  className="close-result"
                  onClick={() => {
                    URL.revokeObjectURL(resultImage);
                    setResultImage?.(null);
                  }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>{developing && <DevelopingOverlay type={developing} />}</AnimatePresence>
      </>
    );
  }

  /* ── Full layout mode (used outside editor-split) ── */
  return (
    <section id="memory-lab" className="memory-lab">
      {onShuffle && (
        <div className="lab-header">
          <button type="button" className="magic-btn" onClick={onShuffle}>
            <span className="sparkle-icon">✦</span>
            MAGIC SHUFFLE
          </button>
        </div>
      )}
      <div className="result-wrap" ref={exportRef}>
        <PhotoResult
          frame={frame}
          photos={photos}
          filter={filter}
          accent={accent}
          decorations={decorations}
          setDecorations={setDecorations}
          activeDecoId={activeDecoId}
          setActiveDecoId={setActiveDecoId}
          doodlePaths={doodlePaths}
          setDoodlePaths={setDoodlePaths}
          doodleBrush={doodleBrush}
          stripTab={stripTab}
          zoom={zoom}
          rotation={rotation}
          vignette={vignette}
          fitSettings={fitSettings}
          photoScales={photoScales}
          setPhotoScales={setPhotoScales}
          timestamp={timestamp}
          stripBackground={stripBackground}
          setPreviewScale={setPreviewScale}
          setPreviewWidth={setPreviewWidth}
        />
      </div>

      <StripEditor
        decorations={decorations}
        setDecorations={setDecorations}
        activeDecoId={activeDecoId}
        setActiveDecoId={setActiveDecoId}
        doodlePaths={doodlePaths}
        setDoodlePaths={setDoodlePaths}
        doodleBrush={doodleBrush}
        setDoodleBrush={setDoodleBrush}
        accentColor={accentColor}
        zoom={zoom}
        setZoom={setZoom}
        rotation={rotation}
        setRotation={setRotation}
        stripTab={stripTab}
        setStripTab={setStripTab}
        fitSettings={fitSettings}
        setFitSettings={setFitSettings}
        mode={mode}
        onShuffle={onShuffle}
        stripBackground={stripBackground}
        setStripBackground={setStripBackground}
      />

      <div className="memory-sidebar">
        <div id="export" className="export-panel">
          <div className="paper-note">All set! <Sparkles size={16} /></div>
          <p>Export your memory</p>
          <div className="export-grid">
            <button type="button" onClick={() => exportCanvas('png')} disabled={!Array.isArray(photos) || photos.length === 0}><ImageIcon size={18} /> Download <span>PNG · best</span><Download size={16} /></button>
            <button type="button" onClick={() => exportCanvas('jpg')} disabled={!Array.isArray(photos) || photos.length === 0}><Grid2X2 size={18} /> Download <span>JPG · small</span><Download size={16} /></button>
          </div>
          {exportStatus && <p className="export-status" role="status" aria-live="polite">{exportStatus}</p>}
          <AnimatePresence>
            {resultImage && (
              <motion.div
                className="mobile-result-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  URL.revokeObjectURL(resultImage);
                  setResultImage?.(null);
                }}
              >
                <div className="mobile-result-content" onClick={e => e.stopPropagation()}>
                  <div className="mobile-result-header">
                    <h3>Save your Memory</h3>
                    <p>Long press the image to save it to your photos</p>
                  </div>
                  <div className="result-img-container">
                    <img src={resultImage} alt="Your photobooth strip" />
                  </div>
                  <button
                    type="button"
                    className="close-result"
                    onClick={() => {
                      URL.revokeObjectURL(resultImage);
                      setResultImage?.(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>{developing && <DevelopingOverlay type={developing} />}</AnimatePresence>
        </div>

        <div className="memory-roll">
          <div className="section-title"><Film size={16} /><span>Memory Roll</span></div>
          <div className="roll-previews">
            {captured && captured.slice(-4).reverse().map((img, i) => (
              <div key={i} className="roll-item">
                <img src={img} alt={`Captured photo ${captured.length - i}`} />
                <button type="button" className="roll-dl" onClick={() => downloadSingleImage(img, captured.length - i - 1)} aria-label={`Download captured photo ${captured.length - i}`}>
                  <Download size={12} />
                </button>
              </div>
            ))}
            {(!captured || captured.length === 0) && (
              <div className="roll-empty">Capture moments to fill your roll...</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export const MemoryLab = memo(MemoryLabComponent);
