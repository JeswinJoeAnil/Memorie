import { GradedPhoto } from './GradedPhoto.jsx';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BatteryMedium,
  Camera,
  Flashlight,
  Grid2X2,
  Pause,
  Play,
  RefreshCcw,
  Repeat,
  RotateCw,
  Sparkles,
  Upload,
  Video,
  Zap,
} from 'lucide-react';
import { assetPhotos } from '../constants/assets.js';
import { importPhoto, encodeVideoFrameToStrip } from '../utils/capture.js';
import { burstConfirmMessage, fullStripMessage, isStreamAlive, isStripFull, needsBurstConfirm } from '../utils/captureGuards.js';
import { getFormattedTimestamp } from '../utils/timestamp.js';
import { CameraOverlay } from './CameraOverlay.jsx';

function CameraBoothComponent({
  isOpen,
  setOpen,
  mode,
  setMode,
  timer,
  setTimer,
  activeFilter,
  captured,
  setCaptured,
  timestamp,
  setTimestamp,
  flashOn,
  setFlashOn,
  mirrorOn,
  setMirrorOn,
  onCapture,
  cameraStream,
  onRequestCamera,
  onCameraExpired,
  cameraError,
  gifMode,
  setGifMode,
  capturedAnimations,
  setCapturedAnimations,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const capturedRef = useRef(captured);
  capturedRef.current = captured;

  const [streaming, setStreaming] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [shotIndex, setShotIndex] = useState(null);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [shooting, setShooting] = useState(false);
  const shootingRef = useRef(false);
  const [flashFire, setFlashFire] = useState(false);
  const [gifRecording, setGifRecording] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);

  const updateTimestamp = useCallback(() => {
    setTimestamp(getFormattedTimestamp());
  }, [setTimestamp]);

  /* Use the pre-acquired camera stream from App (borrowed, never stopped here) */
  useEffect(() => {
    if (!cameraStream) { setStreaming(false); return; }
    if (!isStreamAlive(cameraStream)) {
      setStreaming(false);
      onCameraExpired?.();
      return;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      setStreaming(true);
      setError('');
      setStatusMessage('Camera ready.');
    }
    const track = cameraStream.getVideoTracks()[0];
    track?.addEventListener('ended', onCameraExpired);
    return () => track?.removeEventListener('ended', onCameraExpired);
  }, [cameraStream, onCameraExpired]);

  // A stopped countdown or import must never commit into a later session.
  const operation = useRef(0);
  useEffect(() => () => { operation.current++; }, []);

  const fireFlash = useCallback(() => {
    if (!flashOn) return;
    setFlashFire(true);
    window.setTimeout(() => setFlashFire(false), 480);
  }, [flashOn]);

  const captureOnePhoto = useCallback(async (currentCaptured) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    /* Never invent a photo — if camera isn't ready, return unchanged */
    if (!canvas || !video || !streaming) {
      return [...currentCaptured];
    }
    if (video.readyState < 2 || (video.videoWidth || 0) === 0) {
      return [...currentCaptured];
    }

    if (currentCaptured.length === 0) {
      updateTimestamp();
    }

    /* ── GIF / Boomerang capture: grab multiple frames ── */
    if (gifMode) {
      const GIF_FRAMES = 16;
      const FRAME_INTERVAL = 90; // ms between frames
      const frames = [];
      setGifRecording(true);
      setGifProgress(0);
      for (let i = 0; i < GIF_FRAMES; i++) {
        let dataUrl;
        try { dataUrl = await encodeVideoFrameToStrip(canvas, video, mirrorOn); }
        catch { break; }
        frames.push(dataUrl);
        setGifProgress((i + 1) / GIF_FRAMES);
        if (i < GIF_FRAMES - 1) {
          await new Promise(r => setTimeout(r, FRAME_INTERVAL));
        }
      }
      setGifRecording(false);
      setGifProgress(0);
      if (frames.length === 0) return currentCaptured;

      // For boomerang, append reversed frames (excluding first and last to avoid stutter)
      const finalFrames = gifMode === 'boomerang'
        ? [...frames, ...frames.slice(1, -1).reverse()]
        : frames;

      // Store the animation data for this slot
      const slotIndex = currentCaptured.length;
      setCapturedAnimations(prev => ({
        ...prev,
        [slotIndex]: { frames: finalFrames, boomerang: gifMode === 'boomerang' },
      }));

      fireFlash();
      if (onCapture) onCapture();
      // Use first frame as hero/thumbnail in the captured array
      return [...currentCaptured, frames[0]];
    }

    let dataUrl;
    try { dataUrl = await encodeVideoFrameToStrip(canvas, video, mirrorOn); }
    catch { return currentCaptured; }
    fireFlash();
    if (onCapture) onCapture();
    return [...currentCaptured, dataUrl];
  }, [fireFlash, gifMode, mirrorOn, onCapture, setCapturedAnimations, streaming, updateTimestamp]);

  const handleFileUpload = useCallback((e) => {
    const input = e.target;
    if (shootingRef.current) return;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    const remainingSlots = mode - captured.length;
    if (remainingSlots <= 0) {
      setStatusMessage(`The strip is already full with ${mode} photos. Clear the roll to add more.`);
      input.value = '';
      return;
    }

    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const filesToProcess = imageFiles.slice(0, remainingSlots);
    input.value = '';

    if (files.length !== imageFiles.length) {
      setStatusMessage('Some non-image files were skipped.');
    } else if (files.length > remainingSlots) {
      setStatusMessage(`Added the first ${remainingSlots} images because the strip holds ${mode} photos.`);
    } else {
      setStatusMessage(`Importing ${filesToProcess.length} ${filesToProcess.length === 1 ? 'photo' : 'photos'}...`);
    }

    if (filesToProcess.length === 0) return;

    const session = ++operation.current;
    shootingRef.current = true;
    setShooting(true);
    (async () => {
      const added = [];
      let warning = files.length > filesToProcess.length ? 'Some files were skipped.' : '';
      try {
        for (const file of filesToProcess) {
          try { added.push(await importPhoto(file)); }
          catch (err) { warning = err.message || 'Could not read a photo.'; }
        }
        if (session !== operation.current) return;
        if (added.length && !captured.length) updateTimestamp();
        setCaptured(list => [...list, ...added].slice(0, mode));
        setStatusMessage(`Added ${added.length} photos. ${warning}`.trim());
        if (added.length) onCapture?.();
      } finally {
        if (session === operation.current) {
          shootingRef.current = false;
          setShooting(false);
        }
      }
    })();
  }, [captured.length, mode, onCapture, setCaptured, updateTimestamp]);

  const delay = (ms) => new Promise((r) => window.setTimeout(r, ms));

  const runSingleCapture = useCallback(async () => {
    if (shootingRef.current) return;

    /* If camera is not streaming, request it and wait */
    if (!streaming) {
      if (onRequestCamera) onRequestCamera();
      setStatusMessage('Enable the camera first — waiting for permission...');
      return;
    }

    /* Never silently overwrite a full strip */
    if (isStripFull(capturedRef.current.length, mode)) {
      setStatusMessage(fullStripMessage(mode));
      return;
    }

    const session = ++operation.current;
    shootingRef.current = true;
    setShooting(true);
    setOpen(true);

    const prevBefore = capturedRef.current;
    setShotIndex(prevBefore.length + 1);

    if (timer > 0) {
      for (let t = timer; t >= 1; t--) {
        setCountdown(t);
        await delay(1000);
        if (session !== operation.current) return;
      }
    }
    setCountdown(null);

    const prev = capturedRef.current;
    const next = await captureOnePhoto(prev);
    if (session !== operation.current) return;
    if (next.length === prev.length) {
      setStatusMessage("Couldn't capture — camera not ready. Allow access or use Import.");
      setShotIndex(null);
      setShooting(false);
      shootingRef.current = false;
      return;
    }
    setCaptured(next);
    setStatusMessage(gifMode
      ? `Recorded ${gifMode === 'boomerang' ? 'boomerang' : 'GIF'} clip ${Math.min(next.length, mode)} of ${mode}.`
      : `Captured photo ${Math.min(next.length, mode)} of ${mode}.`
    );

    setShotIndex(null);
    setShooting(false);
    shootingRef.current = false;
  }, [captureOnePhoto, mode, setCaptured, setOpen, timer, streaming, onRequestCamera]);

  const runSequentialCapture = useCallback(async (totalShots) => {
    if (shootingRef.current) return;

    /* If camera is not streaming, request it and wait */
    if (!streaming) {
      if (onRequestCamera) onRequestCamera();
      setStatusMessage('Enable the camera first — waiting for permission...');
      return;
    }

    /* Burst replaces the whole roll — confirm first when photos exist */
    const existing = capturedRef.current.length;
    if (needsBurstConfirm(existing)) {
      const ok = window.confirm(burstConfirmMessage(existing, totalShots));
      if (!ok) return;
    }

    const session = ++operation.current;
    shootingRef.current = true;
    setShooting(true);
    setOpen(true);
    let currentPhotos = [];

    for (let i = 0; i < totalShots; i++) {
      if (session !== operation.current) return;
      setShotIndex(i + 1);
      if (timer > 0) {
        for (let t = timer; t >= 1; t--) {
          setCountdown(t);
          await delay(1000);
          if (session !== operation.current) return;
        }
      }
      setCountdown(null);
      const before = currentPhotos.length;
      currentPhotos = await captureOnePhoto(currentPhotos);
      if (session !== operation.current) return;
      if (currentPhotos.length === before) {
        setStatusMessage("Stopped — camera not ready. Allow access or use Import.");
        break;
      }
      setCaptured([...currentPhotos]);
      setStatusMessage(`Captured photo ${i + 1} of ${totalShots}.`);
      if (i < totalShots - 1) {
        await delay(800);
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    setShotIndex(null);
    setShooting(false);
    shootingRef.current = false;
  }, [captureOnePhoto, setCaptured, setOpen, timer, streaming, onRequestCamera]);

  const stopBurst = useCallback(() => {
    operation.current++;
    shootingRef.current = false;
    setShooting(false);
    setCountdown(null);
    setShotIndex(null);
    setStatusMessage('Capture stopped.');
  }, []);

  const flashPortal = createPortal(
    <AnimatePresence>
      {flashFire && (
        <motion.div className="flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.46 }} />
      )}
    </AnimatePresence>,
    document.body,
  );

  return (
    <>
      <motion.section className="booth-card capture-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: 'spring' }}>
        <div className="section-title">
          <Sparkles size={18} />
          <span>Live Booth</span>
          {shooting && <span className="shooting-badge" aria-live="polite">● SHOOTING {shotIndex}/{mode}</span>}
        </div>
        <div className="capture-layout">
          <div className="mode-stack" role="radiogroup" aria-label="Photo count">
            <span className="mode-stack-label">Strip length</span>
            {[1, 2, 3, 4, 6].map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                className={mode === item ? 'active' : ''}
                onClick={() => { if (!shooting) { setMode(item); setStatusMessage(`Strip set to ${item} photos.`); } }}
                aria-checked={mode === item}
                disabled={shooting}
              >
                <Grid2X2 size={18} />
                <span>{item}</span>
                <span className="mode-shots-label">{item === 1 ? 'shot' : 'shots'}</span>
              </button>
            ))}
          </div>
          <div className="camera-stage">
            <video ref={videoRef} autoPlay playsInline muted className="live-video" aria-label="Live camera preview" style={{ filter: activeFilter.css, transform: mirrorOn ? 'scaleX(-1)' : 'none' }} />
            {!streaming && <GradedPhoto filter={activeFilter} src={assetPhotos[captured.length % assetPhotos.length]} className="live-video fallback-video" alt="" />}
            <CameraOverlay timestamp={timestamp} />
            <AnimatePresence mode="wait">
              {countdown && <motion.div className="countdown" role="timer" aria-live="polite" aria-atomic="true" key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }}>{countdown}</motion.div>}
            </AnimatePresence>
            <AnimatePresence>
              {gifRecording && (
                <motion.div
                  className="gif-recording-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  key="gif-rec"
                >
                  <div className="gif-rec-badge">
                    <span className="gif-rec-dot" />
                    <span className="gif-rec-label">REC</span>
                    <span className="gif-rec-mode">{gifMode === 'boomerang' ? 'BOOMERANG' : 'GIF'}</span>
                  </div>
                  <div className="gif-rec-progress-track">
                    <motion.div
                      className="gif-rec-progress-bar"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: gifProgress }}
                      transition={{ duration: 0.08, ease: 'linear' }}
                    />
                  </div>
                  <div className="gif-rec-hint">Hold your pose!</div>
                </motion.div>
              )}
            </AnimatePresence>
            {(cameraError || error) && <div className="camera-error" role="alert">{cameraError || error}</div>}
          </div>
          <div className="camera-options">
            <button type="button" className={flashOn ? 'opt-active' : ''} onClick={() => setFlashOn((v) => !v)} aria-pressed={flashOn}><Flashlight size={18} /> Flash <span>{flashOn ? 'on' : 'off'}</span></button>
            <button type="button" className={mirrorOn ? 'opt-active' : ''} onClick={() => setMirrorOn((v) => !v)} aria-pressed={mirrorOn}><RefreshCcw size={18} /> Mirror <span>{mirrorOn ? 'on' : 'off'}</span></button>
            <button
              type="button"
              className={timer > 0 ? 'opt-active' : ''}
              onClick={() => {
                const options = [0, 2, 3, 5, 10];
                const next = options[(options.indexOf(timer) + 1) % options.length];
                setTimer(next);
                setStatusMessage(next === 0 ? 'Timer turned off.' : `Timer set to ${next} seconds.`);
              }}
            >
              <BatteryMedium size={18} /> Timer <span>{timer === 0 ? 'off' : `${timer}s`}</span>
            </button>
            <button
              type="button"
              className={gifMode ? 'opt-active gif-mode-btn' : 'gif-mode-btn'}
              onClick={() => {
                const modes = [null, 'gif', 'boomerang'];
                const next = modes[(modes.indexOf(gifMode) + 1) % modes.length];
                setGifMode(next);
                if (!next) setStatusMessage('GIF mode off — capturing photos.');
                else if (next === 'gif') setStatusMessage('GIF mode on — captures a looping clip.');
                else setStatusMessage('Boomerang mode — captures a bouncing clip.');
              }}
            >
              {gifMode === 'boomerang' ? <Repeat size={18} /> : <Video size={18} />}
              {!gifMode ? 'GIF' : gifMode === 'gif' ? 'GIF' : 'Boomerang'}
              <span>{gifMode || 'off'}</span>
            </button>
            <button type="button" onClick={() => { if (!shooting) { setCaptured((list) => list.slice(0, -1)); setCapturedAnimations(prev => { const next = { ...prev }; delete next[captured.length - 1]; return next; }); setStatusMessage('Removed the latest photo.'); } }} disabled={shooting || captured.length === 0}><RotateCw size={18} /> Retake <span>{captured.length}</span></button>
          </div>
        </div>
        {(statusMessage || error || cameraError) && (
          <div className="accessible-status" role="status" aria-live="polite">
            {cameraError || statusMessage || error}
          </div>
        )}
        <div className="capture-actions">
          {!shooting ? (
            <>
              {cameraError ? (
                <div className="camera-status-bar camera-status-bar--error" role="alert">
                  <span className="camera-status-dot camera-status-dot--error" />
                  <span>{cameraError}</span>
                  <button type="button" className="pill-button" onClick={() => onRequestCamera?.()} style={{ marginLeft: 8 }}>Retry</button>
                </div>
              ) : !streaming && (
                <div className="camera-status-bar" role="status">
                  <span className="camera-status-dot" />
                  <span>camera off · tap capture to start</span>
                </div>
              )}
              <div className="capture-btn-row">
                <div className="capture-btn-wrapper">
                  <button type="button" className="shutter-large burst-button" onClick={() => runSequentialCapture(mode)}><Zap size={22} /> Burst Mode</button>
                  <span className="capture-hint">Takes all {mode} shots in a row</span>
                </div>
                <div className="capture-btn-wrapper">
                  <button type="button" className="shutter-large" onClick={runSingleCapture}><Camera size={24} /> Capture Shot</button>
                  <span className="capture-hint">One photo at a time</span>
                </div>
              </div>
              <div className="secondary-actions" style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="pill-button" onClick={() => { if (captured.length === 0) return; const ok = window.confirm(`Clear all ${captured.length} photos? This cannot be undone.`); if (!ok) return; setCaptured([]); setCapturedAnimations({}); setStatusMessage('Roll cleared.'); }} disabled={shooting || captured.length === 0}>Clear roll</button>
                <button type="button" className="pill-button import-btn" onClick={() => document.getElementById('booth-file-upload').click()} aria-controls="booth-file-upload">
                  <Upload size={16} /> Import
                </button>
                <input type="file" id="booth-file-upload" className="sr-only" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleFileUpload} aria-label="Import photos" />
              </div>
            </>
          ) : (
            <button type="button" className="shutter-large stop-button" onClick={stopBurst}><Pause size={22} /> Stop</button>
          )}
        </div>
        <a href="#templates" className="vibe-link"><Sparkles size={16} /> Choose Your Vibe</a>
        <canvas ref={canvasRef} hidden />
      </motion.section>
      {flashPortal}
    </>
  );
}

export const CameraBooth = memo(CameraBoothComponent);
