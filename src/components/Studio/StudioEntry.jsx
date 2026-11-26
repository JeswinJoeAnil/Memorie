import React, { memo, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Copy, Sparkles, Users, X, Check } from 'lucide-react';
import { isValidRoomCode, normalizeRoomCode } from '../../utils/roomCode.js';

/**
 * StudioEntry — The Studio Mode entry point.
 *
 * Displays a premium modal with two options:
 * - CREATE A STUDIO (generates room code, transitions to lobby)
 * - JOIN A STUDIO (enter room code from a friend)
 */
function StudioEntryComponent({ isOpen, onClose, onCreateRoom, onJoinRoom }) {
  const [view, setView] = useState('choice'); /* choice | join */
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleCreate = useCallback(() => {
    onCreateRoom(displayName || 'Host');
  }, [displayName, onCreateRoom]);

  const handleJoin = useCallback(() => {
    const code = normalizeRoomCode(joinCode);
    if (!isValidRoomCode(code)) {
      setJoinError('Enter a valid 6-character studio code.');
      return;
    }
    setJoinError('');
    onJoinRoom(code, displayName || 'Guest');
  }, [joinCode, displayName, onJoinRoom]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleJoin();
  }, [handleJoin]);

  const handleBack = useCallback(() => {
    setView('choice');
    setJoinCode('');
    setJoinError('');
  }, []);

  const handleClose = useCallback(() => {
    setView('choice');
    setJoinCode('');
    setJoinError('');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="studio-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="studio-overlay-backdrop" onClick={handleClose} role="presentation" />
        <motion.div
          className="studio-modal"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <button type="button" className="studio-modal-close" onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>

          <div className="studio-modal-header">
            <div className="studio-brand-mark">
              <Sparkles size={16} />
              <span>MEMORIE STUDIO</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {view === 'choice' ? (
              <motion.div
                key="choice"
                className="studio-modal-body"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <p className="studio-tagline">Take a photo together, even when you're apart.</p>

                <div className="studio-name-field">
                  <label htmlFor="studio-display-name">Your Name</label>
                  <input
                    id="studio-display-name"
                    type="text"
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 16))}
                    maxLength={16}
                    autoComplete="off"
                  />
                </div>

                <div className="studio-actions-stack">
                  <motion.button
                    type="button"
                    className="studio-action-card studio-action-create"
                    onClick={handleCreate}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="studio-action-icon"><Sparkles size={20} /></div>
                    <div className="studio-action-text">
                      <strong>Create a Studio</strong>
                      <span>Start a new shared photo session</span>
                    </div>
                  </motion.button>

                  <motion.button
                    type="button"
                    className="studio-action-card studio-action-join"
                    onClick={() => setView('join')}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="studio-action-icon"><Users size={20} /></div>
                    <div className="studio-action-text">
                      <strong>Join a Studio</strong>
                      <span>Enter a friend's studio code</span>
                    </div>
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="join"
                className="studio-modal-body"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <button type="button" className="studio-back-btn" onClick={handleBack}>
                  <ArrowLeft size={16} /> Back
                </button>
                <p className="studio-tagline">Enter the studio code shared by your friend.</p>

                <div className="studio-name-field">
                  <label htmlFor="studio-join-name">Your Name</label>
                  <input
                    id="studio-join-name"
                    type="text"
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 16))}
                    maxLength={16}
                    autoComplete="off"
                  />
                </div>

                <div className="studio-code-input-group">
                  <label htmlFor="studio-join-code">Studio Code</label>
                  <input
                    id="studio-join-code"
                    type="text"
                    className="studio-code-input"
                    placeholder="M7K2QX"
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(normalizeRoomCode(e.target.value));
                      setJoinError('');
                    }}
                    onKeyDown={handleKeyDown}
                    maxLength={6}
                    autoComplete="off"
                    autoFocus
                  />
                  {joinError && <span className="studio-input-error">{joinError}</span>}
                </div>

                <motion.button
                  type="button"
                  className="studio-join-btn"
                  onClick={handleJoin}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={joinCode.length < 6}
                >
                  Join Studio
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export const StudioEntry = memo(StudioEntryComponent);
