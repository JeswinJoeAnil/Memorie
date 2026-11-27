/**
 * Studio Room Protocol
 * Typed messaging constants, payload schemas, and centralized message validation
 * for WebRTC data connections.
 */

export const PROTOCOL_TYPES = {
  ROOM_STATE_SYNC: 'ROOM_STATE_SYNC',
  IDENTITY: 'IDENTITY',
  PEER_LIST: 'PEER_LIST',
  PARTICIPANT_UPDATE: 'PARTICIPANT_UPDATE',
  PRINT_REQUEST: 'PRINT_REQUEST',
  PRINT_PART: 'PRINT_PART',
  SHUTTER: 'SHUTTER',
  FLASH_FIRE: 'FLASH_FIRE',
  LEAVE: 'LEAVE',
};

const VALID_TYPES = new Set(Object.values(PROTOCOL_TYPES));

/**
 * Host-only message types: only the host peer may send these.
 */
const HOST_ONLY_TYPES = new Set([
  PROTOCOL_TYPES.ROOM_STATE_SYNC,
  PROTOCOL_TYPES.SHUTTER,
  PROTOCOL_TYPES.FLASH_FIRE,
  PROTOCOL_TYPES.PRINT_PART,
  PROTOCOL_TYPES.PEER_LIST,
]);

/**
 * Maximum serialized message size (bytes). Prevents oversized payloads
 * (e.g., multi-MB custom background data URLs sent as room state).
 */
const MAX_MESSAGE_SIZE = 300 * 1024; // 300 KB

/**
 * Centralized incoming message validation pipeline.
 *
 * Validates:
 * 1. Structure — non-null object with a `type` field
 * 2. Type — must be a known PROTOCOL_TYPES value
 * 3. Sender — fromPeerId must be a non-empty string
 * 4. Authorization — host-only commands rejected if sender !== hostPeerId;
 *    PARTICIPANT_UPDATE and LEAVE must target self (targetId === fromPeerId)
 * 5. Payload bounds — string lengths, numeric ranges, array sizes
 * 6. Size limiting — reject messages whose serialized size exceeds MAX_MESSAGE_SIZE
 *
 * @param {*} data - The raw deserialized message from the data channel
 * @param {string} fromPeerId - The verified PeerJS connection peer ID
 * @param {string} hostPeerId - The current room's host peer ID
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateIncomingMessage(data, fromPeerId, hostPeerId) {
  // 1. Structure validation
  if (!data || typeof data !== 'object' || !data.type) {
    return { valid: false, reason: 'invalid_structure' };
  }

  // 2. Type whitelist
  if (!VALID_TYPES.has(data.type)) {
    return { valid: false, reason: 'unknown_type' };
  }

  // 3. Sender validation
  if (!fromPeerId || typeof fromPeerId !== 'string') {
    return { valid: false, reason: 'invalid_sender' };
  }

  // 4. Authorization
  if (HOST_ONLY_TYPES.has(data.type) && fromPeerId !== hostPeerId) {
    return { valid: false, reason: 'unauthorized_host_only' };
  }

  if (data.type === PROTOCOL_TYPES.PARTICIPANT_UPDATE) {
    if (data.peerId && data.peerId !== fromPeerId) {
      return { valid: false, reason: 'participant_update_impersonation' };
    }
  }

  if (data.type === PROTOCOL_TYPES.LEAVE) {
    // LEAVE must only target sender's own peerId
    if (data.peerId && data.peerId !== fromPeerId) {
      return { valid: false, reason: 'leave_spoofing' };
    }
  }

  if ([PROTOCOL_TYPES.PRINT_REQUEST, PROTOCOL_TYPES.PRINT_PART].includes(data.type)) {
    if (typeof data.id !== 'string' || data.id.length > 64 ||
        !Number.isInteger(data.index) || data.index < 0 || data.index >= 256) {
      return { valid: false, reason: 'invalid_print_reference' };
    }
    if (data.type === PROTOCOL_TYPES.PRINT_PART &&
        (typeof data.chunk !== 'string' || !data.chunk.length || data.chunk.length > 32768 ||
         !Number.isInteger(data.count) || data.count <= data.index || data.count > 256)) {
      return { valid: false, reason: 'invalid_print_part' };
    }
  }

  // 5. Payload bounds
  if (data.type === PROTOCOL_TYPES.IDENTITY) {
    if (typeof data.displayName === 'string' && data.displayName.length > 50) {
      return { valid: false, reason: 'display_name_too_long' };
    }
  }

  if (data.type === PROTOCOL_TYPES.SHUTTER) {
    if (data.captureTimestamps !== undefined && (!Array.isArray(data.captureTimestamps) ||
        data.captureTimestamps.length !== data.totalShots || !Number.isFinite(data.timestamp) ||
        data.captureTimestamps.some(time => !Number.isFinite(time) || Math.abs(time - data.timestamp) > 360000))) {
      return { valid: false, reason: 'invalid_capture_schedule' };
    }
    if (typeof data.totalShots === 'number' && (data.totalShots < 1 || data.totalShots > 10)) {
      return { valid: false, reason: 'invalid_shot_count' };
    }
    if (typeof data.timerSec === 'number' && (data.timerSec < 0 || data.timerSec > 30)) {
      return { valid: false, reason: 'invalid_timer' };
    }
  }

  if (data.type === PROTOCOL_TYPES.ROOM_STATE_SYNC && data.roomState) {
    // Reject room state with oversized customBgUrl (>250KB data URL)
    if (typeof data.roomState.customBgUrl === 'string' && data.roomState.customBgUrl.length > 250 * 1024) {
      return { valid: false, reason: 'custom_bg_too_large' };
    }
  }

  // 6. Size limiting (rough estimate using JSON serialization)
  try {
    const approxSize = JSON.stringify(data).length;
    if (approxSize > MAX_MESSAGE_SIZE) {
      return { valid: false, reason: 'message_too_large' };
    }
  } catch {
    return { valid: false, reason: 'unserializable' };
  }

  return { valid: true };
}

/**
 * Creates an IDENTITY message payload.
 */
export function createIdentityMessage(peerId, displayName, role = 'guest') {
  return {
    type: PROTOCOL_TYPES.IDENTITY,
    peerId,
    displayName: displayName || (role === 'host' ? 'Host' : 'Guest'),
    role,
    timestamp: Date.now(),
  };
}

/**
 * Creates a PEER_LIST message payload.
 */
export function createPeerListMessage(peers) {
  return {
    type: PROTOCOL_TYPES.PEER_LIST,
    peers: peers.map((p) => ({
      peerId: p.peerId,
      displayName: p.displayName || 'Guest',
    })),
    timestamp: Date.now(),
  };
}

/**
 * Creates a ROOM_STATE_SYNC message payload.
 */
export function createRoomStateSyncMessage(roomState) {
  return {
    type: PROTOCOL_TYPES.ROOM_STATE_SYNC,
    roomState,
    timestamp: Date.now(),
  };
}

/**
 * Creates a PARTICIPANT_UPDATE message payload.
 */
export function createParticipantUpdateMessage(peerId, patch) {
  return {
    type: PROTOCOL_TYPES.PARTICIPANT_UPDATE,
    peerId,
    patch,
    timestamp: Date.now(),
  };
}

/**
 * Creates a SHUTTER message payload.
 */
export function createShutterMessage({ totalShots, timerSec, captureTimestamps }) {
  return {
    type: PROTOCOL_TYPES.SHUTTER,
    totalShots,
    timerSec,
    captureTimestamps,
    timestamp: Date.now(),
  };
}

/**
 * Creates a FLASH_FIRE message payload.
 */
export function createFlashFireMessage() {
  return {
    type: PROTOCOL_TYPES.FLASH_FIRE,
    timestamp: Date.now(),
  };
}

/**
 * Creates a LEAVE message payload.
 */
export function createLeaveMessage(peerId) {
  return {
    type: PROTOCOL_TYPES.LEAVE,
    peerId,
    timestamp: Date.now(),
  };
}
