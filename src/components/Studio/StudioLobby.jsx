import { InviteButton } from './StudioReview.jsx';
import React, { memo, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Sparkles, Users } from 'lucide-react';

/**
 * StudioLobby — Waiting room displayed after creating a studio.
 *
 * Shows the room code prominently, a copy button, canonical participant count
 * from roomState (host-authoritative, not stream-derived), and an "Enter Studio" button.
 */
function StudioLobbyComponent({
  roomCode,
  roomState,
  participants,
  localStream,
  displayName,
  selfPeerId,
  onEnterStudio,
  onLeave,
  mirrorOn = true,
}) {
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard API unavailable — select the text instead */
      const el = document.getElementById('studio-room-code-display');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [roomCode]);

  /* Canonical member count from room state (host-authoritative).
     Falls back to stream-derived count before first ROOM_STATE_SYNC arrives. */
  const canonicalMembers = (roomState?.members ?? []).filter(
    (m) => m.connectionState !== 'left'
  );
  const totalParticipants = canonicalMembers.length || 1 + participants.length;

  /* Stream-derived list still used to show live video thumbnails */
  const remoteParticipants = participants;

  return (
    <motion.div
      className="studio-lobby"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
    >
      <div className="studio-lobby-header">
        <div className="studio-brand-mark">
          <Sparkles size={16} />
          <span>MEMORIE STUDIO</span>
        </div>
      </div>

      <div className="studio-lobby-code-section">
        <span className="studio-lobby-code-label">Your Studio Code</span>
        <div className="studio-lobby-code" id="studio-room-code-display">
          {roomCode.split('').map((char, i) => (
            <motion.span
              key={i}
              className="studio-code-char"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              {char}
            </motion.span>
          ))}
        </div>
        <p className="studio-lobby-hint">Invite a friend by link or share the room code.</p>
        <InviteButton code={roomCode} />
        <motion.button
          type="button"
          className="studio-copy-btn"
          onClick={copyCode}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
        >
          {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Code</>}
        </motion.button>
      </div>

      <div className="studio-lobby-divider" />

      <div className="studio-lobby-participants">
        <div className="studio-lobby-participants-header">
          {totalParticipants <= 1 ? (
            <motion.span
              className="studio-waiting-text"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Waiting for friends...
            </motion.span>
          ) : (
            <span className="studio-connected-text">
              <Users size={16} /> {totalParticipants} in studio
            </span>
          )}
        </div>

        <div className="studio-lobby-avatars">
          {/* Self */}
          <div className="studio-lobby-avatar studio-lobby-avatar-self">
            <div className="studio-lobby-avatar-video">
              {localStream && (
                <video
                  autoPlay
                  playsInline
                  muted
                  style={{ transform: mirrorOn ? 'scaleX(-1)' : 'none' }}
                  ref={(el) => { if (el && el.srcObject !== localStream) el.srcObject = localStream; }}
                />
              )}
            </div>
            <span className="studio-lobby-avatar-name">{displayName || 'YOU'}</span>
            {/* Role badge from canonical room state */}
            {(() => {
              const selfMember = canonicalMembers.find((m) => m.peerId === selfPeerId);
              const role = selfMember?.role || 'host';
              return (
                <span className="studio-lobby-avatar-badge">
                  {role === 'host' ? 'Host' : 'Guest'}
                </span>
              );
            })()}
          </div>

          {/* Remote participants — show canonical members (even without streams yet) */}
          {canonicalMembers
            .filter((m) => m.peerId !== selfPeerId)
            .map((member) => {
              const liveParticipant = remoteParticipants.find((p) => p.peerId === member.peerId);
              return (
                <motion.div
                  key={member.peerId}
                  className="studio-lobby-avatar"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring' }}
                >
                  <div className="studio-lobby-avatar-video">
                    {liveParticipant?.stream ? (
                      <video
                        autoPlay
                        playsInline
                        muted
                        ref={(el) => {
                          if (el && el.srcObject !== liveParticipant.stream) {
                            el.srcObject = liveParticipant.stream;
                          }
                        }}
                      />
                    ) : (
                      /* Member in room state but stream not yet ready */
                      <motion.div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: '50%',
                          fontSize: 22,
                        }}
                        animate={{ opacity: [0.4, 0.9, 0.4] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                      >
                        👤
                      </motion.div>
                    )}
                  </div>
                  <span className="studio-lobby-avatar-name">{member.displayName || 'Guest'}</span>
                  {member.role === 'host' && (
                    <span className="studio-lobby-avatar-badge">Host</span>
                  )}
                </motion.div>
              );
            })}

          {/* Empty invite slots — based on canonical count to avoid flicker */}
          {Array.from(
            { length: Math.max(0, 3 - (canonicalMembers.length - 1)) },
            (_, i) => (
              <div key={`empty-${i}`} className="studio-lobby-avatar studio-lobby-avatar-empty">
                <div className="studio-lobby-avatar-video studio-lobby-avatar-invite">
                  <span>+</span>
                </div>
                <span className="studio-lobby-avatar-name">Invite</span>
              </div>
            )
          )}
        </div>
      </div>

      <div className="studio-lobby-divider" />

      <div className="studio-lobby-actions">
        <motion.button
          type="button"
          className="studio-enter-btn"
          onClick={onEnterStudio}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <Sparkles size={18} /> Enter Studio
        </motion.button>
        <button type="button" className="studio-leave-btn" onClick={onLeave}>
          Leave
        </button>
      </div>
    </motion.div>
  );
}

export const StudioLobby = memo(StudioLobbyComponent);
