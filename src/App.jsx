import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Camera, Sparkles } from 'lucide-react';
import { ASSETS, BACKGROUNDS, PRELOAD_IMAGE_URLS, filters, frames, stickers } from './constants/assets.js';
import { getPreviewPhotos, getStripPhotos } from './utils/stripPhotos.js';
import { generateShuffleDecorations, triggerMagicFlashOnStrip } from './utils/shuffleDecorations.js';
import { getFormattedTimestamp } from './utils/timestamp.js';
import { AmbientLayers } from './components/AmbientLayers.jsx';
import { SiteChrome } from './components/SiteChrome.jsx';
import { Hero } from './components/Hero.jsx';
import { CameraBooth } from './components/CameraBooth.jsx';
import { CameraEditor } from './components/CameraEditor.jsx';
import { TemplateRail } from './components/TemplateRail.jsx';
import { PhotoResult } from './components/PhotoResult.jsx';
import { StripEditor } from './components/StripEditor.jsx';
import { MemoryLab } from './components/MemoryLab.jsx';
import { Footer } from './components/Footer.jsx';
import { NotFound } from './components/NotFound.jsx';
const StudioMode = lazy(() => import('./components/Studio/StudioMode.jsx').then(m => ({ default: m.StudioMode })));

// Valid SPA routes - everything else is 404
const VALID_HASHES = new Set(['', 'capture', 'editor', 'booth', 'templates']);
function isValidRoute() {
  const base = import.meta.env.BASE_URL || '/';
  const path = window.location.pathname;
  // Allow base path, index.html, and root (dev server)
  const validPaths = new Set([base, `${base}index.html`, '/', '/index.html']);
  // Also allow base without trailing slash
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  if (validPaths.has(path) || path === normalizedBase) {
    const hash = window.location.hash.replace(/^#\/?/, '').replace('#', '');
    // empty hash or known hash = valid
    if (hash === '' || VALID_HASHES.has(hash)) return true;
    return false;
  }
  return false;
}

export default function App() {
  const [mode, setMode] = useState(4);
  const [timer, setTimer] = useState(3);
  const [captured, setCaptured] = useState([]);
  const [timestamp, setTimestamp] = useState(getFormattedTimestamp());
  const [fitSettings, setFitSettings] = useState({});
  const [photoScales, setPhotoScales] = useState({});
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [frame, setFrame] = useState(frames[0]);
  const [audioOn, setAudioOn] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const audioRef = useRef(null);
  const shutterRef = useRef(null);

  const [developing, setDeveloping] = useState(null);
  const [flashOn, setFlashOn] = useState(true);
  const [isBoothOpen, setBoothOpen] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [decorations, setDecorations] = useState([]);
  const [activeDecoId, setActiveDecoId] = useState(null);
  const [doodlePaths, setDoodlePaths] = useState([]);
  const [doodleBrush, setDoodleBrush] = useState({ color: '#ff5aaf', size: 6, shadow: 0 });
  const [accent, setAccent] = useState('#ff5aaf');
  const [stripBackground, setStripBackground] = useState(BACKGROUNDS[0]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [grain, setGrain] = useState(36);
  const [lightLeak, setLightLeak] = useState(28);
  const [vignette, setVignette] = useState(16);
  const [editorTab, setEditorTab] = useState('filters');
  const [stripTab, setStripTab] = useState('text');
  const [mirrorOn, setMirrorOn] = useState(true);
  const [currentPage, setCurrentPage] = useState(() => {
    if (!isValidRoute()) return '404';
    const hash = window.location.hash.replace('#', '');
    return hash === 'editor' ? 'editor' : 'capture';
  });
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(380);
  const stripElementRef = useRef(null);

  const requestCamera = useCallback(() => {
    if (cameraRequested) return;
    setCameraRequested(true);
    setCameraError(null);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        setCameraStream(stream);
      })
      .catch((err) => {
        console.warn('Camera access error:', err.name, err.message);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCameraError('Camera permission denied. Please allow camera access and try again.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setCameraError('No camera found. Please connect a camera and try again.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setCameraError('Camera is in use by another application. Please close other apps using the camera.');
        } else {
          setCameraError('Could not access camera. Please check your device settings.');
        }
        setCameraRequested(false); // Allow retry
      });
  }, [cameraRequested]);

  useEffect(() => {
    PRELOAD_IMAGE_URLS.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = 0.55;
    if (audioOn) {
      audioRef.current.play().catch(() => { });
    } else {
      audioRef.current.pause();
    }
  }, [audioOn, trackIndex]);

  useEffect(() => {
    const s = new Audio(ASSETS.shutter);
    s.volume = 0.45;
    shutterRef.current = s;
  }, []);

  const selectedFilter = useMemo(() => ({
    ...activeFilter,
    css: activeFilter.css === 'none' ? '' : `${activeFilter.css} contrast(${1 + grain / 420}) brightness(${1 + lightLeak / 600})`,
  }), [activeFilter, grain, lightLeak]);

  const stripPhotos = useMemo(() => getStripPhotos(captured, mode), [captured, mode]);

  /* Preview-only filler for Hero / template thumbnails. Never exported. */
  const previewPhotos = useMemo(() => getPreviewPhotos(captured, mode), [captured, mode]);

  const stripComplete = captured.length >= mode && mode > 0;
  const missingCount = Math.max(0, mode - captured.length);

  const handleModeChange = useCallback((nextMode) => {
    if (nextMode === mode) return;
    if (captured.length > nextMode) {
      const hidden = captured.length - nextMode;
      const ok = window.confirm(
        `Switch to ${nextMode} photos? The last ${hidden} captured photo${hidden === 1 ? '' : 's'} will be removed from the strip.`
      );
      if (!ok) return;
      setCaptured((prev) => prev.slice(0, nextMode));
    }
    setMode(nextMode);
  }, [captured.length, mode]);

  const nextTrack = useCallback(() => {
    setTrackIndex((prev) => (prev + 1) % ASSETS.playlist.length);
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioOn((v) => !v);
  }, []);

  const playShutter = useCallback(() => {
    if (!audioOn || !shutterRef.current) return;
    const s = shutterRef.current.cloneNode();
    s.volume = 0.45;
    s.play().catch(() => { });
  }, [audioOn]);

  const onStartBooth = useCallback(() => {
    setBoothOpen(true);
    document.querySelector('#booth')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const [shuffleUndo, setShuffleUndo] = useState(null);

  const handleShuffle = useCallback(() => {
    /* Save current state for undo */
    setShuffleUndo({
      frame,
      filter: activeFilter,
      accent,
      decorations: [...decorations],
    });

    const randomFrame = frames[Math.floor(Math.random() * frames.length)];
    setFrame(randomFrame);

    const randomFilter = filters[Math.floor(Math.random() * filters.length)];
    setActiveFilter(randomFilter);

    const accents = ['#ff5aaf', '#5ac8ff', '#b45aff', '#5aff8c', '#ffea5a', '#111111'];
    setAccent(accents[Math.floor(Math.random() * accents.length)]);

    setDecorations(generateShuffleDecorations(stickers));
    setActiveDecoId(null);
    triggerMagicFlashOnStrip();
  }, [frame, activeFilter, accent, decorations]);

  const handleUndoShuffle = useCallback(() => {
    if (!shuffleUndo) return;
    setFrame(shuffleUndo.frame);
    setActiveFilter(shuffleUndo.filter);
    setAccent(shuffleUndo.accent);
    setDecorations(shuffleUndo.decorations);
    setShuffleUndo(null);
  }, [shuffleUndo]);

  const prevCapturedLength = useRef(0);
  useEffect(() => {
    const wasGrowing = captured.length > prevCapturedLength.current;
    const isFull = captured.length >= mode && captured.length > 0;
    prevCapturedLength.current = captured.length;

    if (isFull && wasGrowing && currentPage === 'capture') {
      setCurrentPage('editor');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [captured.length, mode, currentPage]);

  /* Sync URL hash with currentPage for browser back/forward support */
  useEffect(() => {
    const newHash = currentPage === 'editor' ? '#editor' : '#capture';
    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash);
    }
  }, [currentPage]);

  /* Handle browser back/forward navigation */
  useEffect(() => {
    const handlePopState = () => {
      if (!isValidRoute()) {
        setCurrentPage('404');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const hash = window.location.hash.replace('#', '');
      setCurrentPage(hash === 'editor' ? 'editor' : 'capture');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Also check on mount for invalid pathname (direct navigation)
  useEffect(() => {
    if (!isValidRoute()) setCurrentPage('404');
  }, []);

  const goToEditor = useCallback(() => {
    setCurrentPage('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToCapture = useCallback(() => {
    if (window.location.pathname !== (import.meta.env.BASE_URL || '/')) {
      window.history.pushState(null, '', import.meta.env.BASE_URL || '/');
    }
    setCurrentPage('capture');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToHome = useCallback(() => {
    window.history.pushState(null, '', import.meta.env.BASE_URL || '/');
    setCurrentPage('capture');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* ─── Studio Mode state ─── */
  const [isStudioOpen, setStudioOpen] = useState(false);

  const openStudio = useCallback(() => {
    setStudioOpen(true);
  }, []);

  const closeStudio = useCallback(() => {
    setStudioOpen(false);
  }, []);

  const handleStudioCapture = useCallback((photos, studioShotCount) => {
    /* Push group photos into the captured state and transition to strip editor */
    const photoList = Array.isArray(photos) ? photos : [photos];
    const count = studioShotCount || photoList.length;
    setMode(count);
    setCaptured(photoList);
    setTimestamp(getFormattedTimestamp());
    setStudioOpen(false);
    setCurrentPage('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <main>
      <AmbientLayers />
      <SiteChrome
        audioOn={audioOn}
        toggleAudio={toggleAudio}
        nextTrack={nextTrack}
        currentPage={currentPage}
        capturedCount={captured.length}
        onGoToEditor={goToEditor}
        onStudioOpen={openStudio}
      />
      {isStudioOpen && (
        <Suspense fallback={<div className="studio-loading">Loading Studio…</div>}>
          <StudioMode isOpen={isStudioOpen} onClose={closeStudio} onCaptureComplete={handleStudioCapture} />
        </Suspense>
      )}
      <audio
        ref={audioRef}
        src={ASSETS.playlist[trackIndex]}
        preload="none"
        onEnded={nextTrack}
        onPlay={(e) => { e.currentTarget.volume = 0.55; }}
        crossOrigin="anonymous"
      />

      <AnimatePresence mode="wait">
        {currentPage === '404' ? (
          <motion.div
            key="notfound-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <NotFound onGoHome={goToHome} onOpenLab={goToEditor} />
            <Footer />
          </motion.div>
        ) : currentPage === 'capture' ? (
          <motion.div
            key="capture-page"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          >
            <Hero
              onStart={() => { requestCamera(); onStartBooth(); }}
              photos={previewPhotos}
              filter={selectedFilter}
              timestamp={timestamp}
            />
            <section id="booth" className="studio-grid">
              <CameraBooth
                isOpen={isBoothOpen}
                setOpen={setBoothOpen}
                mode={mode}
                setMode={handleModeChange}
                timer={timer}
                setTimer={setTimer}
                activeFilter={selectedFilter}
                captured={captured}
                setCaptured={setCaptured}
                timestamp={timestamp}
                setTimestamp={setTimestamp}
                flashOn={flashOn}
                setFlashOn={setFlashOn}
                mirrorOn={mirrorOn}
                setMirrorOn={setMirrorOn}
                onCapture={playShutter}
                cameraStream={cameraStream}
                onRequestCamera={requestCamera}
                cameraError={cameraError}
              />
              <CameraEditor
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                grain={grain}
                setGrain={setGrain}
                lightLeak={lightLeak}
                setLightLeak={setLightLeak}
                vignette={vignette}
                setVignette={setVignette}
                editorTab={editorTab}
                setEditorTab={setEditorTab}
              />
            </section>
            <TemplateRail frame={frame} setFrame={setFrame} photos={previewPhotos} filter={selectedFilter} accent={accent} mode={mode} compact />
            {captured.length > 0 && (
              <motion.div
                className="go-to-editor-bar"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="editor-bar-inner">
                  <div className="editor-bar-info">
                    <span className="editor-bar-count">{captured.length}/{mode}</span>
                    <span>{stripComplete ? 'photos captured' : `${missingCount} more needed`}</span>
                  </div>
                  <button type="button" className="editor-bar-btn" onClick={goToEditor}>
                    {stripComplete ? 'Edit & Download →' : 'Continue Editing →'}
                  </button>
                </div>
              </motion.div>
            )}

            <Footer />
          </motion.div>
        ) : (
          <div key="editor-page" className="editor-page">
            <header className="editor-page-header">
              <button type="button" className="back-to-booth-btn" onClick={goToCapture}>
                <ArrowLeft size={18} />
                <span>Back to Booth</span>
              </button>
              <div className="editor-page-title">
                <Sparkles size={16} />
                <span>Edit & Download</span>
              </div>
              <button type="button" className="retake-btn" onClick={goToCapture}>
                <Camera size={16} />
                <span>Retake</span>
              </button>
            </header>

            <div className="editor-split">
              {captured.length === 0 ? (
                <div className="editor-empty" role="status" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 20px', background: 'rgba(255,255,255,.7)', borderRadius: 16 }}>
                  <h2 style={{ margin: '0 0 8px' }}>No photos yet</h2>
                  <p style={{ margin: '0 0 16px', color: '#655d56' }}>Capture photos or import images to start editing. We never fill your strip with sample photos.</p>
                  <button type="button" className="editor-bar-btn" onClick={goToCapture}>
                    Back to Booth
                  </button>
                </div>
              ) : (
              <>
              <div className="editor-strip-col">
                <div className="editor-strip-canvas">
                  {!stripComplete && (
                    <p role="status" style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#8e104d', background: '#ffe0ed', borderRadius: 12, padding: '8px 12px', margin: '0 0 12px' }}>
                      Strip incomplete ({captured.length}/{mode}) — export will include only your {captured.length} photo{captured.length === 1 ? '' : 's'}.
                    </p>
                  )}
                  <PhotoResult
                    frame={frame}
                    photos={stripPhotos}
                    filter={selectedFilter}
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
                    stripElementRef={stripElementRef}
                  />
                </div>
              </div>

              <div className="editor-controls-col">
                <div className="editor-controls-card">
                  <div className="magic-shuffle-row">
                    <button className="magic-btn" onClick={handleShuffle}>
                      <span className="sparkle-icon">✦</span>
                      MAGIC SHUFFLE
                    </button>
                    {shuffleUndo && (
                      <button type="button" className="pill-button undo-btn" onClick={handleUndoShuffle}>
                        ↩ Undo
                      </button>
                    )}
                  </div>
                </div>

                <div className="editor-controls-card">
                  <TemplateRail frame={frame} setFrame={setFrame} photos={previewPhotos} filter={selectedFilter} accent={accent} mode={mode} compact />
                </div>

                <div className="editor-controls-card">
                  <CameraEditor
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                    grain={grain}
                    setGrain={setGrain}
                    lightLeak={lightLeak}
                    setLightLeak={setLightLeak}
                    vignette={vignette}
                    setVignette={setVignette}
                    editorTab={editorTab}
                    setEditorTab={setEditorTab}
                  />
                </div>

                <div className="editor-controls-card">
                  <StripEditor
                    decorations={decorations}
                    setDecorations={setDecorations}
                    activeDecoId={activeDecoId}
                    setActiveDecoId={setActiveDecoId}
                    doodlePaths={doodlePaths}
                    setDoodlePaths={setDoodlePaths}
                    doodleBrush={doodleBrush}
                    setDoodleBrush={setDoodleBrush}
                    accentColor={accent}
                    zoom={zoom}
                    setZoom={setZoom}
                    rotation={rotation}
                    setRotation={setRotation}
                    stripTab={stripTab}
                    setStripTab={setStripTab}
                    fitSettings={fitSettings}
                    setFitSettings={setFitSettings}
                    mode={mode}
                    onShuffle={handleShuffle}
                    onUndoShuffle={handleUndoShuffle}
                    canUndoShuffle={!!shuffleUndo}
                    stripBackground={stripBackground}
                    setStripBackground={setStripBackground}
                  />
                </div>

                <div className="editor-controls-card editor-export-card">
                  <div className="paper-note">All set! <Sparkles size={16} /></div>
                  <p>Export your memory</p>
                  <MemoryLab
                    frame={frame}
                    photos={stripPhotos}
                    filter={selectedFilter}
                    accent={accent}
                    decorations={decorations}
                    setDecorations={setDecorations}
                    activeDecoId={activeDecoId}
                    setActiveDecoId={setActiveDecoId}
                    doodlePaths={doodlePaths}
                    setDoodlePaths={setDoodlePaths}
                    doodleBrush={doodleBrush}
                    setDoodleBrush={setDoodleBrush}
                    developing={developing}
                    setDeveloping={setDeveloping}
                    zoom={zoom}
                    setZoom={setZoom}
                    rotation={rotation}
                    setRotation={setRotation}
                    vignette={vignette}
                    stripTab={stripTab}
                    setStripTab={setStripTab}
                    accentColor={accent}
                    captured={captured}
                    fitSettings={fitSettings}
                    setFitSettings={setFitSettings}
                    photoScales={photoScales}
                    setPhotoScales={setPhotoScales}
                    timestamp={timestamp}
                    mode={mode}
                    onShuffle={handleShuffle}
                    resultImage={resultImage}
                    setResultImage={setResultImage}
                    stripBackground={stripBackground}
                    previewScale={previewScale}
                    previewWidth={previewWidth}
                    stripElementRef={stripElementRef}
                    exportOnly
                  />
                </div>
              </div>
              </>
              )}
            </div>

            <Footer />
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
