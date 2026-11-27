/**
 * Studio Canonical Room State
 * Authoritative state management with strictly monotonic versioning.
 */

import {
  getDefaultParticipantTransform,
  MAX_STUDIO_PARTICIPANTS,
} from '../compositor/participantLayout.js';

export { MAX_STUDIO_PARTICIPANTS };

/**
 * Creates a standard participant member object.
 */
export function createMember({
  peerId,
  displayName,
  role = 'guest',
  joinedAt = Date.now(),
  mirror = true,
  flash = true,
  transform = null,
}) {
  return {
    peerId,
    displayName: displayName || (role === 'host' ? 'Host' : 'Guest'),
    role,
    joinedAt,
    connectionState: 'connected',
    mediaState: 'loading',
    mirror,
    flash,
    transform,
  };
}

/**
 * Creates the initial room state for a new studio.
 */
export function createInitialRoomState({
  hostPeerId,
  hostName = 'Host',
  backgroundId = 'wine-velvet',
  timer = 3,
  shots = 3,
}) {
  const hostMember = createMember({
    peerId: hostPeerId,
    displayName: hostName,
    role: 'host',
    joinedAt: Date.now(),
  });
  hostMember.mediaState = 'ready';

  return {
    version: 1,
    hostPeerId,
    backgroundId,
    customBgUrl: null,
    timer,
    shots,
    capturePhase: 'idle',
    captureTimestamps: [],
    members: applyDefaultTransforms([hostMember]),
  };
}

/**
 * Sorts members by join order (stable left-to-right ordering).
 */
export function sortMembersByJoinOrder(members) {
  if (!Array.isArray(members)) return [];
  return [...members].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

/**
 * Returns active members currently in the room (excludes left/disconnected).
 */
export function activeMembers(members) {
  if (!Array.isArray(members)) return [];
  return sortMembersByJoinOrder(
    members.filter((m) => m && m.connectionState !== 'left')
  );
}

/**
 * Ensures all active members have stable normalized transforms.
 * Preserves manual transforms if the user dragged themselves (isManual: true).
 */
export function applyDefaultTransforms(members) {
  if (!Array.isArray(members)) return [];
  const active = activeMembers(members);
  const total = active.length;

  return members.map((m) => {
    if (m.connectionState === 'left') return m;
    const joinIndex = active.findIndex((a) => a.peerId === m.peerId);
    if (joinIndex < 0) return m;

    if (m.transform && m.transform.isManual) {
      return m;
    }

    return {
      ...m,
      transform: getDefaultParticipantTransform(joinIndex, total),
    };
  });
}

/**
 * Increments room state version and applies patch.
 */
export function bumpRoomState(state, patch) {
  if (!state) return patch;
  const next = {
    ...state,
    ...patch,
    version: (state.version || 0) + 1,
  };

  if (patch.members) {
    next.members = applyDefaultTransforms(patch.members);
  } else if (state.members) {
    next.members = applyDefaultTransforms(state.members);
  }

  return next;
}

/**
 * Merges incoming remote room state if its version is strictly newer.
 */
export function mergeRoomState(local, incoming) {
  if (!incoming) return local;
  if (!local) {
    return {
      ...incoming,
      members: applyDefaultTransforms(incoming.members || []),
    };
  }

  // Strictly ignore stale or equal versions
  if ((incoming.version ?? 0) <= (local.version ?? 0)) {
    return local;
  }

  return {
    ...incoming,
    members: applyDefaultTransforms(incoming.members || []),
  };
}

/**
 * Updates a specific member in the members array by peerId.
 */
export function updateMember(members, peerId, patch) {
  if (!Array.isArray(members)) return [];
  return members.map((m) => (m.peerId === peerId ? { ...m, ...patch } : m));
}

/**
 * Marks a member as left.
 */
export function removeMember(members, peerId) {
  if (!Array.isArray(members)) return [];
  return members.map((m) =>
    m.peerId === peerId
      ? { ...m, connectionState: 'left', mediaState: 'unavailable' }
      : m
  );
}

/**
 * Adds or updates a member in the room state.
 */
export function addOrUpdateMember(members, member) {
  if (!Array.isArray(members)) return [member];
  const idx = members.findIndex((m) => m.peerId === member.peerId);

  if (idx >= 0) {
    const updated = [...members];
    updated[idx] = { ...updated[idx], ...member, connectionState: 'connected' };
    return applyDefaultTransforms(updated);
  }

  if (activeMembers(members).length >= MAX_STUDIO_PARTICIPANTS) {
    return members;
  }

  return applyDefaultTransforms([...members, member]);
}
