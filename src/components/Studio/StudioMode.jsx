import { useDialogFocus } from '../../hooks/useDialogFocus.js';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStudioRoom } from '../../hooks/useStudioRoom.js';
import { segmentationManager } from '../../studio/segmentation/segmentationManager.js';
import { StudioEntry } from './StudioEntry.jsx';
import { StudioLobby } from './StudioLobby.jsx';
import { StudioRoom } from './StudioRoom.jsx';

/**
 * StudioMode — Top-level orchestrator for the multiplayer Studio feature.
 */
function StudioModeComponent({ isOpen, onClose, onCaptureComplete, existingStream, existingPhotoCount }) {
  const [phase, setPhase] = useState('entry');
  const [permissionError, setPermissionError] = useState('');
  const localStreamRef = useRef(null);

  const studio = useStudioRoom();

  const requestMedia = useCallback(async () => {
    setPermissionError('');
    studio.setErrorMessage?.('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia not supported');
      }
      const stream = existingStream?.getVideoTracks().some(track => track.readyState === 'live')
        ? existingStream.clone()
        : await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!active.current) {
        stream.getTracks().forEach(track => track.stop());
        return null;
      }
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.warn('Camera permission denied:', err);
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setPermissionError('Camera permission denied. Please allow camera access and try again.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setPermissionError('No camera found. Please connect a camera and try again.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setPermissionError('Camera is in use by another application. Please close other apps using the camera.');
      } else {
        setPermissionError('Camera permission is required for Studio Mode. Please allow camera access and try again.');
      }
      return null;
    }
  }, [studio, existingStream]);

  const active = useRef(true);
  const enterStudio = async (name, code = '') => {
    if (existingPhotoCount && !window.confirm('Your completed Studio strip will replace the photos currently in your editor. Continue?')) return;
    setPhase('permission');
    const stream = await requestMedia();
    if (!stream || !active.current) return;
    setPhase('connecting');
    studio.setDisplayName(name);
    const success = code ? await studio.joinRoom(code, stream, name) : await studio.createRoom(stream, name);
    if (!active.current) return;
    if (success) setPhase(code ? 'room' : 'lobby');
    else {
      setPermissionError('The studio could not connect. Check the room code and try again.');
      setPhase('permission');
    }
  };

  const handleEnterStudio = useCallback(() => {
    setPhase('room');
  }, []);

  const handleLeave = useCallback(() => {
    studio.leaveRoom();
    segmentationManager.destroy();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setPhase('entry');
  }, [studio]);

  const handleClose = useCallback(() => {
    handleLeave();
    onClose();
  }, [handleLeave, onClose]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      segmentationManager.destroy();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const selfMember = studio.roomState?.members?.find((m) => m.peerId === studio.selfPeerId);

  const dialog = useDialogFocus(isOpen, handleClose);
  if (!isOpen) return null;

  return (
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Memorie Studio">
      {phase === 'entry' && (
        <StudioEntry
          key="studio-entry"
          isOpen
          onClose={handleClose}
          onCreateRoom={name => enterStudio(name)}
          onJoinRoom={(code, name) => enterStudio(name, code)}
        />
      )}

      {phase === 'permission' && (
        <motion.div
          key="studio-permission"
          className="studio-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="studio-overlay-backdrop" />
          <motion.div
            className="studio-modal studio-permission-modal"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
          >
            <div className="studio-permission-content">
              {(studio.errorMessage || permissionError) ? (
                <>
                  <p className="studio-permission-error">{studio.errorMessage || permissionError}</p>
                  <button type="button" className="studio-join-btn" onClick={() => {
                    if (localStreamRef.current) {
                      localStreamRef.current.getTracks().forEach((t) => t.stop());
                      localStreamRef.current = null;
                    }
                    studio.leaveRoom();
                    setPermissionError('');
                    setPhase('entry');
                  }}>
                    Go Back
                  </button>
                </>
              ) : (
                <>
                  <motion.div
                    className="studio-loading-spinner"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="studio-permission-text">Preparing your camera...</p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {phase === 'connecting' && (
        <motion.div
          key="studio-connecting"
          className="studio-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="studio-overlay-backdrop" />
          <motion.div
            className="studio-modal studio-permission-modal"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
          >
            <div className="studio-permission-content">
              {studio.errorMessage ? (
                <>
                  <p className="studio-permission-error">{studio.errorMessage}</p>
                  <button
                    type="button"
                    className="studio-join-btn"
                    onClick={() => {
                      studio.leaveRoom();
                      setPhase('entry');
                    }}
                  >
                    Go Back
                  </button>
                </>
              ) : (
                <>
                  <motion.div
                    className="studio-loading-spinner"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="studio-permission-text">Finding your studio...</p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {phase === 'lobby' && (
        <motion.div
          key="studio-lobby"
          className="studio-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <StudioLobby
            roomCode={studio.roomCode}
            roomState={studio.roomState}
            participants={studio.participants}
            localStream={studio.localStream}
            displayName={studio.displayName}
            selfPeerId={studio.selfPeerId}
            onEnterStudio={handleEnterStudio}
            onLeave={handleClose}
            mirrorOn={selfMember?.mirror ?? true}
          />
        </motion.div>
      )}

      {phase === 'room' && (
        <motion.div
          key="studio-room"
          className="studio-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <StudioRoom
            isHost={studio.isHost}
            roomCode={studio.roomCode}
            connectionError={studio.errorMessage}
            roomState={studio.roomState}
            selfPeerId={studio.selfPeerId}
            participants={studio.participants}
            localStream={studio.localStream}
            displayName={studio.displayName}
            broadcast={studio.broadcast}
            onData={studio.onData}
            onLeave={handleClose}
            onCaptureComplete={onCaptureComplete}
            updateSelfParticipant={studio.updateSelfParticipant}
            updateHostSettings={studio.updateHostSettings}
            getStreamForPeer={studio.getStreamForPeer}
          />
        </motion.div>
      )}
    </div>
  );
}

export const StudioMode = memo(StudioModeComponent);
