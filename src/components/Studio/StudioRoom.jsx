import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BatteryMedium,
  Camera,
  Check,
  Flashlight,
  Grid2X2,
  Image as ImageIcon,
  RefreshCcw,
  Sliders,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { StudioCompositor } from '../../studio/compositor/StudioCompositor.js';
import { segmentationManager } from '../../studio/segmentation/segmentationManager.js';
import { invalidateBackgroundCache } from '../../studio/compositor/backgroundRenderer.js';
import { getTierConfig } from '../../studio/performance/deviceTier.js';
import { PerfMonitor } from '../../studio/performance/perfMonitor.js';
import { STUDIO_BACKGROUNDS } from '../../constants/studioAssets.js';
import { activeMembers, sortMembersByJoinOrder } from '../../studio/room/roomState.js';
import { constrainParticipantPosition } from '../../studio/compositor/participantLayout.js';
import {
  computeCaptureTimestamps,
  executeCaptureSequence,
} from '../../studio/capture/studioCapture.js';
import {
  createFlashFireMessage,
  createShutterMessage,
  PROTOCOL_TYPES,
} from '../../studio/room/roomProtocol.js';

const RESOLUTION_OPTIONS = [
  { id: '1080p', label: '1080p (Full HD)', desc: 'Highest photo detail & crisp resolution', width: 1920, height: 1080 },
  { id: '720p', label: '720p (HD)', desc: 'Balanced sharpness & smooth motion', width: 1280, height: 720 },
  { id: '480p', label: '480p (SD)', desc: 'Fastest performance & low latency', width: 854, height: 480 },
];

const SHOW_DEBUG = import.meta.env.DEV;

function StudioRoomComponent({
  isHost,
  roomCode,
  roomState,
  selfPeerId,
  participants,
  localStream,
  displayName,
  broadcast,
  onData,
  onLeave,
  onCaptureComplete,
  updateSelfParticipant,
  updateHostSettings,
  getStreamForPeer,
}) {
  const [localCustomBgUrl, setLocalCustomBgUrl] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [flashFire, setFlashFire] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showQualityControls, setShowQualityControls] = useState(false);
  const [showDebug, setShowDebug] = useState(SHOW_DEBUG);
  const [selectedResolution, setSelectedResolution] = useState('720p');
  const [shooting, setShooting] = useState(false);
  const [shotIndex, setShotIndex] = useState(null);
  const [streamTick, setStreamTick] = useState(0);
  const [perfTier, setPerfTier] = useState(() => segmentationManager.getTier());
  const [perfSnap, setPerfSnap] = useState({ fps: 60, avgSegMs: 0, avgRenderMs: 0 });

  const compositorCanvasRef = useRef(null);
  const compositorEngineRef = useRef(null);
  const videoElementsRef = useRef(new Map());
  const fileInputRef = useRef(null);
  const animFrameRef = useRef(null);
  const sceneParticipantsRef = useRef([]);
  const dragRef = useRef(null);
  const isCancelledRef = useRef(false);

  const customBgUrl = roomState?.customBgUrl ?? localCustomBgUrl ?? null;

  const background = useMemo(() => {
    const bgId = roomState?.backgroundId || 'y2k-chrome';
    return STUDIO_BACKGROUNDS.find((b) => b.id === bgId) || STUDIO_BACKGROUNDS[0];
  }, [roomState?.backgroundId]);

  const timer = roomState?.timer ?? 3;
  const shotCount = roomState?.shots ?? 4;

  const selfMember = useMemo(
    () => roomState?.members?.find((m) => m.peerId === selfPeerId),
    [roomState?.members, selfPeerId]
  );

  const mirrorOn = selfMember?.mirror ?? true;
  const flashOn = selfMember?.flash ?? true;

  const sortedMembers = useMemo(
    () => sortMembersByJoinOrder(activeMembers(roomState?.members || [])),
    [roomState?.members]
  );

  const sceneParticipants = useMemo(() => {
    return sortedMembers.map((m) => ({
      peerId: m.peerId,
      name: m.displayName,
      video: videoElementsRef.current.get(m.peerId) || null,
      mirror: m.mirror,
      flash: m.flash,
      transform: m.transform,
      mediaState: m.mediaState,
      connectionState: m.connectionState,
      joinedAt: m.joinedAt,
      isSelf: m.peerId === selfPeerId,
    }));
  }, [sortedMembers, selfPeerId, streamTick]);

  useEffect(() => {
    sceneParticipantsRef.current = sceneParticipants;
  }, [sceneParticipants]);

  useEffect(() => {
    segmentationManager.init();
    return () => {
      isCancelledRef.current = true;
    };
  }, []);

  // Re-attach tick only when a video actually starts playing; slow poll as fallback.
  // Previously re-rendered every 2s even when idle — wasted React work per frame window.
  useEffect(() => {
    const id = setInterval(() => setStreamTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // Adaptive tier → compositor size + quality flags. Runs once + on auto-degrade.
  useEffect(() => {
    const cfg = getTierConfig(perfTier);
    segmentationManager.setTier(perfTier);
    const engine = compositorEngineRef.current;
    if (engine) {
      engine.setCompositeSize(cfg.compositeWidth, cfg.compositeHeight);
      engine.setQualityFlags({ enableGlow: cfg.enableGlow, enableShadows: cfg.enableShadows });
    }
    invalidateBackgroundCache();
  }, [perfTier]);

  useEffect(() => {
    if (!compositorEngineRef.current) {
      compositorEngineRef.current = new StudioCompositor(compositorCanvasRef.current);
      const cfg = getTierConfig(segmentationManager.getTier());
      compositorEngineRef.current.setCompositeSize(cfg.compositeWidth, cfg.compositeHeight);
      compositorEngineRef.current.setQualityFlags({ enableGlow: cfg.enableGlow, enableShadows: cfg.enableShadows });
      setPerfTier(segmentationManager.getTier());
    } else {
      compositorEngineRef.current.setCanvas(compositorCanvasRef.current);
    }
  }, []);

  // Single requestAnimationFrame loop for the studio scene
  // Pauses when the tab is hidden to prevent wasted CPU/GPU cycles.
  // Includes perf monitor + sustained-low-fps auto-degrade (high → balanced → performance).
  useEffect(() => {
    const activeBg = customBgUrl
      ? { solidColor: '#000', customImageUrl: customBgUrl }
      : background;

    let isVisible = !document.hidden;
    const monitor = new PerfMonitor({
      onDegrade: () => {
        setPerfTier((prev) => {
          const next = prev === 'high' ? 'balanced' : prev === 'balanced' ? 'performance' : prev;
          return next;
        });
      },
    });
    let snapTimer = 0;

    const renderLoop = () => {
      if (compositorEngineRef.current && isVisible) {
        const t0 = performance.now();
        monitor.beginFrame(t0);
        compositorEngineRef.current.renderFrame({
          background: activeBg,
          sceneParticipants: sceneParticipantsRef.current,
        });
        const t1 = performance.now();
        monitor.endFrame(t1, t0);
        // Refresh debug HUD ~2x/sec without re-rendering every frame
        if (t1 - snapTimer > 500) {
          snapTimer = t1;
          const seg = segmentationManager.getStats();
          const m = monitor.snapshot();
          setPerfSnap({ ...m, avgSegMs: seg.avgSegMs, backend: seg.backend });
        }
      }
      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    const handleVisibility = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    renderLoop();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [background, customBgUrl]);

  // Clean up detached participant videos
  useEffect(() => {
    const activePeerIds = new Set(sortedMembers.map((m) => m.peerId));
    videoElementsRef.current.forEach((video, peerId) => {
      if (!activePeerIds.has(peerId)) {
        if (video) video.srcObject = null;
        videoElementsRef.current.delete(peerId);
        segmentationManager.removeParticipant(peerId);
      }
    });
  }, [sortedMembers]);

  const attachVideoRef = useCallback((peerId, stream) => (el) => {
    if (!el) return;
    videoElementsRef.current.set(peerId, el);
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (el.paused) el.play().catch(() => {});
    // Decode-efficient hidden videos: low-res render, no audio
    try {
      el.preload = 'auto';
      if ('disablePictureInPicture' in el) el.disablePictureInPicture = true;
    } catch {}
    // Bump scene tick exactly when pixels arrive instead of polling
    if (!el._studioTickHooked) {
      el._studioTickHooked = true;
      el.addEventListener('playing', () => setStreamTick((t) => t + 1), { once: false });
    }

    sceneParticipantsRef.current = sceneParticipantsRef.current.map((p) =>
      p.peerId === peerId ? { ...p, video: el } : p
    );
  }, []);

  const allVideoSources = useMemo(() => {
    const sources = [];
    if (localStream && selfPeerId) {
      sources.push({ peerId: selfPeerId, stream: localStream });
    }
    participants.forEach((p) => {
      if (p.stream) sources.push({ peerId: p.peerId, stream: p.stream });
    });
    return sources;
  }, [localStream, selfPeerId, participants]);

  const handleResolutionChange = useCallback(
    (opt) => {
      setSelectedResolution(opt.id);
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()?.[0];
        if (videoTrack?.applyConstraints) {
          videoTrack
            .applyConstraints({
              width: { ideal: opt.width },
              height: { ideal: opt.height },
            })
            .catch((err) => console.warn('Camera resolution notice:', err));
        }
      }
    },
    [localStream]
  );

  const handleBackgroundChange = useCallback(
    (bg) => {
      setLocalCustomBgUrl(null);
      setShowBgPicker(false);
      if (isHost) {
        updateHostSettings({ backgroundId: bg.id, customBgUrl: null });
      }
    },
    [isHost, updateHostSettings]
  );

  const handleCustomImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !isHost) return;

    // Pre-decode guard: reject oversized files before decoding (OOM protection)
    const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`Custom background: rejected oversized file ${(file.size / 1048576).toFixed(1)}MB > 8MB`);
      e.target.value = '';
      return;
    }

    // Validate file type: only raster image formats accepted, no SVG
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      console.warn('Custom background: rejected file type', file.type);
      e.target.value = '';
      return;
    }

    // Local rasterization pipeline: File → Image → Canvas resize → JPEG compress → data URL
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate scaled dimensions maintaining aspect ratio
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX_WIDTH || h > MAX_HEIGHT) {
        const scale = Math.min(MAX_WIDTH / w, MAX_HEIGHT / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      // Rasterize onto canvas and compress as JPEG
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

      setLocalCustomBgUrl(compressedDataUrl);
      setShowBgPicker(false);
      updateHostSettings({ customBgUrl: compressedDataUrl, backgroundId: null });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      console.warn('Custom background: failed to decode image');
    };
    img.src = objectUrl;
  };

  const toggleMirror = useCallback(() => {
    updateSelfParticipant({ mirror: !mirrorOn });
  }, [mirrorOn, updateSelfParticipant]);

  const toggleFlash = useCallback(() => {
    updateSelfParticipant({ flash: !flashOn });
  }, [flashOn, updateSelfParticipant]);

  // Pointer dragging to reposition participant in normalized space
  const handlePointerDown = useCallback(
    (e) => {
      if (!selfMember?.transform) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: selfMember.transform.x,
        originBaselineY: selfMember.transform.baselineY ?? 0.88,
      };
    },
    [selfMember]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragRef.current || !selfMember?.transform) return;
      const canvas = compositorCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - dragRef.current.startX) / rect.width;
      const dy = (e.clientY - dragRef.current.startY) / rect.height;

      const rawX = dragRef.current.originX + dx;
      const rawBaselineY = dragRef.current.originBaselineY + dy;
      const constrained = constrainParticipantPosition(rawX, rawBaselineY);

      updateSelfParticipant({
        transform: {
          ...selfMember.transform,
          x: constrained.x,
          baselineY: constrained.baselineY,
          isManual: true,
        },
      });
    },
    [selfMember, updateSelfParticipant]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Synchronized multi-shot capture execution
  const runCapture = useCallback(
    async (totalShots, timerSec, captureTimestamps) => {
      if (shooting) return;
      setShooting(true);

      const activeBg = customBgUrl
        ? { solidColor: '#000', customImageUrl: customBgUrl }
        : background;

      const photos = await executeCaptureSequence({
        totalShots,
        timerSec,
        captureTimestamps,
        compositorEngine: compositorEngineRef.current,
        background: activeBg,
        getSceneParticipants: () => sceneParticipantsRef.current,
        onCountdown: setCountdown,
        onFlash: () => {
          if (flashOn) {
            setFlashFire(true);
            setTimeout(() => setFlashFire(false), 450);
          }
        },
        onShotIndex: setShotIndex,
        isCancelled: () => isCancelledRef.current,
      });

      setShooting(false);
      setShotIndex(null);

      if (photos.length > 0) {
        onCaptureComplete(photos, totalShots);
      }
    },
    [shooting, customBgUrl, background, flashOn, onCaptureComplete]
  );

  useEffect(() => {
    const unsubscribe = onData((data) => {
      if (!data?.type) return;

      if (data.type === PROTOCOL_TYPES.SHUTTER) {
        runCapture(data.totalShots, data.timerSec, data.captureTimestamps || []);
      }

      if (data.type === PROTOCOL_TYPES.FLASH_FIRE && flashOn) {
        setFlashFire(true);
        setTimeout(() => setFlashFire(false), 450);
      }
    });

    return unsubscribe;
  }, [onData, runCapture, flashOn]);

  const handleShutter = useCallback(() => {
    if (!isHost || shooting) return;

    const timerSec = timer;
    const totalShots = shotCount;
    const captureTimestamps = computeCaptureTimestamps(totalShots, timerSec);

    broadcast(
      createShutterMessage({
        totalShots,
        timerSec,
        captureTimestamps,
      })
    );

    if (flashOn) {
      broadcast(createFlashFireMessage());
    }

    runCapture(totalShots, timerSec, captureTimestamps);
  }, [isHost, shooting, timer, shotCount, broadcast, flashOn, runCapture]);

  const cycleTimer = useCallback(() => {
    if (!isHost || shooting) return;
    const options = [0, 2, 3, 5, 10];
    const next = options[(options.indexOf(timer) + 1) % options.length];
    updateHostSettings({ timer: next });
  }, [isHost, shooting, timer, updateHostSettings]);

  const cycleShots = useCallback(() => {
    if (!isHost || shooting) return;
    const options = [1, 2, 3, 4, 6];
    const next = options[(options.indexOf(shotCount) + 1) % options.length];
    updateHostSettings({ shots: next });
  }, [isHost, shooting, shotCount, updateHostSettings]);

  const segReadyCount = sceneParticipants.filter(
    (p) => segmentationManager.getStatus(p.peerId) === 'ready'
  ).length;
  const streamCount = sceneParticipants.filter((p) => p.video?.readyState >= 1).length;
  const expectedRemotes = sortedMembers.length - 1;
  const connectedPeers = participants.filter((p) => p.stream).length;

  return (
    <motion.div
      className="studio-room"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Hidden video container — kept in-viewport to prevent browser decoding suspension */}
      <div
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        {allVideoSources.map(({ peerId, stream }) => (
          <video
            key={peerId}
            ref={attachVideoRef(peerId, stream)}
            style={{ width: '320px', height: '240px' }}
            autoPlay
            playsInline
            muted
          />
        ))}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        style={{ display: 'none' }}
        onChange={handleCustomImageUpload}
      />

      {/* Top Bar */}
      <div className="studio-room-topbar">
        <button type="button" className="studio-room-back" onClick={onLeave} disabled={shooting}>
          <ArrowLeft size={18} />
          <span>Leave Studio</span>
        </button>
        <div className="studio-room-info">
          <span className="studio-room-code-badge">{roomCode}</span>
          <span className="studio-room-participant-count">
            <Users size={14} /> {sortedMembers.length}
          </span>
          {SHOW_DEBUG && (
            <button
              type="button"
              className="studio-room-code-badge"
              onClick={() => setShowDebug((v) => !v)}
              style={{ marginLeft: 8, cursor: 'pointer' }}
            >
              DBG
            </button>
          )}
        </div>
      </div>

      {/* Development Diagnostics */}
      {showDebug && SHOW_DEBUG && (
        <div
          style={{
            position: 'absolute',
            top: 56,
            right: 12,
            zIndex: 50,
            background: 'rgba(0,0,0,0.85)',
            color: '#00ffcc',
            fontFamily: 'monospace',
            fontSize: 11,
            padding: '8px 12px',
            borderRadius: 8,
            lineHeight: 1.6,
            pointerEvents: 'none',
            border: '1px solid rgba(0,255,204,0.3)',
          }}
        >
          <div>ROOM: {roomCode}</div>
          <div>SELF: {selfPeerId?.slice(-8)}</div>
          <div>ROLE: {isHost ? 'HOST' : 'GUEST'}</div>
          <div>MEMBERS: {sortedMembers.length} / 4</div>
          <div>PEERS: {connectedPeers}/{expectedRemotes}</div>
          <div>STREAMS: {streamCount}/{sortedMembers.length}</div>
          <div>SEGMENTED: {segReadyCount}/{sortedMembers.length}</div>
          <div>TIER: {perfTier} ({perfSnap.backend || segmentationManager.backend})</div>
          <div>FPS: {perfSnap.fps} | SEG: {perfSnap.avgSegMs}ms | RND: {perfSnap.avgRenderMs}ms</div>
          <div>STATE: v{roomState?.version ?? 0}</div>
        </div>
      )}

      {shooting && shotIndex && (
        <motion.div
          className="studio-shooting-badge"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          ● SHOOTING SHOT {shotIndex} OF {shotCount}
        </motion.div>
      )}

      {/* Viewport Canvas */}
      <div className="studio-viewport">
        <canvas
          ref={compositorCanvasRef}
          className="studio-compositor-canvas"
          width={1280}
          height={720}
          onPointerDown={handlePointerDown}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const step = 0.02;
              const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
              const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
              const rawX = (selfMember?.transform?.x ?? 0.5) + dx;
              const rawY = (selfMember?.transform?.baselineY ?? 0.88) + dy;
              const c = constrainParticipantPosition(rawX, rawY);
              updateSelfParticipant({ transform: { ...selfMember.transform, x: c.x, baselineY: c.baselineY, isManual: true } });
            }
          }}
          tabIndex={0}
          role="img"
          aria-label="Studio stage — drag or use arrow keys to reposition"
          style={{ touchAction: 'none', cursor: 'grab' }}
        />

        <div className="studio-framing-guide">
          <div className="studio-framing-box" />
          <span className="studio-framing-text">Drag to reposition · Stay on floor</span>
        </div>

        <div aria-live="assertive" aria-atomic="true" className="sr-only">{countdown !== null ? `Capturing in ${countdown}` : ''}</div>
        <AnimatePresence mode="wait">
          {countdown !== null && (
            <motion.div
              className="studio-countdown-overlay"
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.35 }}
              aria-hidden="true"
            >
              <span className="studio-countdown-number">{countdown}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {flashFire && (
            <motion.div
              className="studio-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Studio Controls */}
      <div className="studio-controls">
        <motion.button
          type="button"
          className={`studio-bg-btn studio-opt-btn ${flashOn ? 'opt-active' : ''}`}
          onClick={toggleFlash}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          aria-pressed={flashOn}
        >
          <Flashlight size={16} /> Flash <span>{flashOn ? 'on' : 'off'}</span>
        </motion.button>

        <motion.button
          type="button"
          className={`studio-bg-btn studio-opt-btn ${mirrorOn ? 'opt-active' : ''}`}
          onClick={toggleMirror}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          aria-pressed={mirrorOn}
        >
          <RefreshCcw size={16} /> Mirror <span>{mirrorOn ? 'on' : 'off'}</span>
        </motion.button>

        <motion.button
          type="button"
          className={`studio-bg-btn studio-opt-btn ${showQualityControls ? 'opt-active' : ''}`}
          onClick={() => {
            setShowQualityControls(!showQualityControls);
            setShowBgPicker(false);
          }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
        >
          <Sliders size={16} /> Quality <span>{selectedResolution}</span>
        </motion.button>

        {isHost ? (
          <motion.button
            type="button"
            className="studio-shutter-btn"
            onClick={handleShutter}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={shooting || countdown !== null}
            aria-label="Take Photo"
          >
            <Camera size={24} />
          </motion.button>
        ) : (
          <div className="studio-guest-hint">
            <Sparkles size={14} />
            <span>The host will take the photo</span>
          </div>
        )}

        {isHost && (
          <>
            <motion.button
              type="button"
              className={`studio-bg-btn studio-opt-btn ${timer > 0 ? 'opt-active' : ''}`}
              onClick={cycleTimer}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              disabled={shooting}
            >
              <BatteryMedium size={16} /> Timer <span>{timer === 0 ? 'off' : `${timer}s`}</span>
            </motion.button>

            <motion.button
              type="button"
              className="studio-bg-btn studio-opt-btn opt-active"
              onClick={cycleShots}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              disabled={shooting}
            >
              <Grid2X2 size={16} /> Shots <span>{shotCount}</span>
            </motion.button>

            <motion.button
              type="button"
              className={`studio-bg-btn ${showBgPicker ? 'opt-active' : ''}`}
              onClick={() => {
                setShowBgPicker(!showBgPicker);
                setShowQualityControls(false);
              }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              disabled={shooting}
            >
              <ImageIcon size={16} /> Background
            </motion.button>
          </>
        )}
      </div>

      {/* Background Picker */}
      <AnimatePresence>
        {showBgPicker && (
          <motion.div
            className="studio-bg-picker"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div className="studio-picker-header">
              <span className="studio-bg-picker-label">Studio Backgrounds</span>
              <button
                type="button"
                className="studio-upload-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} /> Upload Custom
              </button>
            </div>
            <div className="studio-bg-picker-grid">
              {STUDIO_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  className={`studio-bg-option ${!customBgUrl && background.id === bg.id ? 'active' : ''}`}
                  onClick={() => handleBackgroundChange(bg)}
                  title={bg.name}
                >
                  <div
                    className="studio-bg-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${bg.gradient[0]}, ${bg.accent || bg.gradient[bg.gradient.length - 1]})`,
                    }}
                  />
                  <span>{bg.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quality Controls */}
      <AnimatePresence>
        {showQualityControls && (
          <motion.div
            className="studio-quality-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div className="studio-picker-header">
              <span className="studio-bg-picker-label">Camera Quality</span>
            </div>
            <div className="studio-resolution-list">
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`studio-resolution-item ${selectedResolution === opt.id ? 'active' : ''}`}
                  onClick={() => handleResolutionChange(opt)}
                >
                  <div className="studio-res-info">
                    <span className="studio-res-title">{opt.label}</span>
                    <span className="studio-res-desc">{opt.desc}</span>
                  </div>
                  {selectedResolution === opt.id && <Check size={16} className="studio-res-check" />}
                </button>
              ))}
            </div>
            <div className="studio-picker-header" style={{ marginTop: 12 }}>
              <span className="studio-bg-picker-label">Studio Performance (auto: {perfTier})</span>
            </div>
            <div className="studio-resolution-list">
              {[
                { id: 'high', label: 'High', desc: '1280×720 preview · full glow + shadows' },
                { id: 'balanced', label: 'Balanced', desc: '960×540 preview · reduced AI rate' },
                { id: 'performance', label: 'Speed', desc: '854×480 preview · fastest, photo stays HD' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`studio-resolution-item ${perfTier === opt.id ? 'active' : ''}`}
                  onClick={() => setPerfTier(opt.id)}
                >
                  <div className="studio-res-info">
                    <span className="studio-res-title">{opt.label}</span>
                    <span className="studio-res-desc">{opt.desc}</span>
                  </div>
                  {perfTier === opt.id && <Check size={16} className="studio-res-check" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const StudioRoom = memo(StudioRoomComponent);
