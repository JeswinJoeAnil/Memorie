import { useDialogFocus } from '../hooks/useDialogFocus.js';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Download,
  Grid2X2,
  Image as ImageIcon,
} from 'lucide-react';
import { renderExport } from '../utils/exportCanvas.js';
import { DevelopingOverlay } from './DevelopingOverlay.jsx';

function MemoryLabComponent(props) {
  const { photos, filter, frame, developing, setDeveloping, mode,
    resultImage, setResultImage, stripElementRef } = props;
  const busy = useRef(false);
  const mounted = useRef(false);
  const resultUrl = useRef(null);
  const [exportStatus, setExportStatus] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      setResultImage(null);
    };
  }, [setResultImage]);

  const exportCanvas = useCallback(async (type) => {
    if (type !== 'png' && type !== 'jpg') {
      setExportStatus('That export format is not available yet.');
      return;
    }
    if (!Array.isArray(photos) || photos.length === 0) {
      setExportStatus('Capture photos first — nothing to download yet.');
      return;
    }

    if (busy.current) return;
    busy.current = true;
    setDeveloping(type);
    setExportStatus(`Preparing ${type.toUpperCase()} download...`);
    try {
      // No artificial delay — render immediately so repeated exports feel instant.
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      setExportStatus(`Compositing ${photos.length} photo${photos.length === 1 ? '' : 's'}...`);
      const canvas = await renderExport({
        photos, filter, type,
        stripElement: stripElementRef?.current || null,
      });

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error('Could not generate image.'));
        }, type === 'png' ? 'image/png' : 'image/jpeg', 0.92);
      });

      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = url;
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
      const link = document.createElement('a');
      link.download = `memorie-${stamp}-${frame.id}.${type === 'png' ? 'png' : 'jpg'}`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setResultImage(url);
      setExportStatus(`${type.toUpperCase()} ready — download started. Tap preview to save on mobile.`);
    } catch (err) {
      console.error('Export failed:', err);
      setExportStatus('Download failed. One of the assets might have failed to load.');
    } finally {
      busy.current = false;
      setDeveloping(null);
    }
  }, [photos, filter, frame.id, setDeveloping, setResultImage, stripElementRef]);

  const closeResult = useCallback(() => {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
    setResultImage(null);
  }, [setResultImage]);

  const dialog = useDialogFocus(Boolean(resultImage), closeResult);
  const photoCount = Array.isArray(photos) ? photos.length : 0;
  const hasPhotos = photoCount > 0;
  const incomplete = hasPhotos && typeof mode === 'number' && photoCount < mode;
  return (
    <>
      <div className="export-grid">
        <button type="button" onClick={() => exportCanvas('png')} disabled={!hasPhotos || Boolean(developing)} title={hasPhotos ? 'Download full strip as PNG (best quality)' : 'Capture photos first'}><ImageIcon size={18} /> Download <span>PNG · best</span><Download size={16} /></button>
        <button type="button" onClick={() => exportCanvas('jpg')} disabled={!hasPhotos || Boolean(developing)} title={hasPhotos ? 'Download full strip as JPG (smaller file)' : 'Capture photos first'}><Grid2X2 size={18} /> Download <span>JPG · small</span><Download size={16} /></button>
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
            onClick={closeResult}
          >
            <div ref={dialog} role="dialog" aria-modal="true" aria-label="Save your Memory" className="mobile-result-content" onClick={e => e.stopPropagation()}>
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
                onClick={closeResult}
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

export const MemoryLab = memo(MemoryLabComponent);
