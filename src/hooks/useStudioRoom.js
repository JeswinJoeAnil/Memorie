import { useCallback, useEffect, useRef, useState } from 'react';
import { generateRoomCode } from '../utils/roomCode.js';
import {
  activeMembers,
  addOrUpdateMember,
  bumpRoomState,
  createInitialRoomState,
  createMember,
  MAX_STUDIO_PARTICIPANTS,
  mergeRoomState,
  removeMember,
  sortMembersByJoinOrder,
  updateMember,
} from '../studio/room/roomState.js';
import {
  createIdentityMessage,
  createPeerListMessage,
  createRoomStateSyncMessage,
  PROTOCOL_TYPES,
  validateIncomingMessage,
} from '../studio/room/roomProtocol.js';
import { hostPeerIdForCode, StudioMediaManager } from '../studio/media/studioMediaManager.js';

export function useStudioRoom() {
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [connectionState, setConnectionState] = useState('idle');
  const [roomState, setRoomState] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selfPeerId, setSelfPeerId] = useState(null);
  const [streamVersion, setStreamVersion] = useState(0);

  const mediaManagerRef = useRef(null);
  const roomStateRef = useRef(null);
  const isHostRef = useRef(false);
  const selfPeerIdRef = useRef(null);
  const displayNameRef = useRef('');
  const dataHandlersRef = useRef([]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  const onData = useCallback((handler) => {
    dataHandlersRef.current.push(handler);
    return () => {
      dataHandlersRef.current = dataHandlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  const sendTo = useCallback((peerId, message) => mediaManagerRef.current?.sendTo(peerId, message), []);

  const broadcast = useCallback((message) => {
    mediaManagerRef.current?.broadcast(message);
  }, []);

  const broadcastRoomState = useCallback(
    (nextState) => {
      if (!nextState) return;
      roomStateRef.current = nextState;
      setRoomState(nextState);
      mediaManagerRef.current?.broadcast(createRoomStateSyncMessage(nextState));
    },
    []
  );

  const sendPeerList = useCallback((targetPeerId = null) => {
    if (!isHostRef.current || !roomStateRef.current) return;
    const members = activeMembers(roomStateRef.current.members);
    const peerListMsg = createPeerListMessage(members);

    if (targetPeerId) {
      mediaManagerRef.current?.sendTo(targetPeerId, peerListMsg);
    } else {
      mediaManagerRef.current?.broadcast(peerListMsg);
    }
  }, []);

  const handleDataChannelOpened = useCallback(
    (remotePeerId, dataConn) => {
      if (isHostRef.current) {
        // Host sends latest room state and active peer list to the new connection
        if (roomStateRef.current) {
          try {
            dataConn.send(createRoomStateSyncMessage(roomStateRef.current));
            const members = activeMembers(roomStateRef.current.members);
            dataConn.send(createPeerListMessage(members));
          } catch {}
        }
      } else {
        // Guest sends its identity to host/peers
        const identityMsg = createIdentityMessage(
          selfPeerIdRef.current,
          displayNameRef.current || 'Guest',
          'guest'
        );
        try {
          dataConn.send(identityMsg);
        } catch {}
      }
    },
    []
  );

  const handleProtocolMessage = useCallback(
    (data, fromPeerId) => {
      if (!data?.type) return;

      // Centralized message validation gate
      const hostId = roomStateRef.current?.hostPeerId || null;
      const validation = validateIncomingMessage(data, fromPeerId, hostId);
      if (!validation.valid) {
        if (import.meta.env.DEV) {
          console.warn(`[Protocol] Rejected message from ${fromPeerId}: ${validation.reason}`, data.type);
        }
        return;
      }

      // Dispatch to custom listeners (e.g. SHUTTER, FLASH_FIRE)
      dataHandlersRef.current.forEach((handler) => handler(data, fromPeerId));

      switch (data.type) {
        case PROTOCOL_TYPES.IDENTITY: {
          if (isHostRef.current && roomStateRef.current) {
            const member = createMember({
              peerId: fromPeerId,
              displayName: data.displayName || 'Guest',
              role: 'guest',
              joinedAt: Date.now(),
            });
            const next = bumpRoomState(roomStateRef.current, {
              members: addOrUpdateMember(roomStateRef.current.members, member),
            });
            broadcastRoomState(next);
            sendPeerList();
          }
          break;
        }

        case PROTOCOL_TYPES.PEER_LIST: {
          if (!isHostRef.current && Array.isArray(data.peers)) {
            data.peers.forEach((peerInfo) => {
              if (peerInfo.peerId !== selfPeerIdRef.current) {
                mediaManagerRef.current?.scheduleMeshConnect(peerInfo.peerId, peerInfo.displayName);
              }
            });
          }
          break;
        }

        case PROTOCOL_TYPES.ROOM_STATE_SYNC: {
          if (!isHostRef.current && data.roomState) {
            setRoomState((prev) => {
              const next = mergeRoomState(prev, data.roomState);
              roomStateRef.current = next;
              return next;
            });
          }
          break;
        }

        case PROTOCOL_TYPES.PARTICIPANT_UPDATE: {
          if (isHostRef.current && roomStateRef.current) {
            const { peerId: targetId, patch } = data;
            if (targetId && targetId === fromPeerId) {
              const next = bumpRoomState(roomStateRef.current, {
                members: updateMember(roomStateRef.current.members, targetId, patch),
              });
              broadcastRoomState(next);
            }
          }
          break;
        }

        case PROTOCOL_TYPES.LEAVE: {
          if (isHostRef.current && roomStateRef.current) {
            // Always use the verified fromPeerId — never trust data.peerId
            const leaveId = fromPeerId;
            const next = bumpRoomState(roomStateRef.current, {
              members: removeMember(roomStateRef.current.members, leaveId),
            });
            broadcastRoomState(next);
            sendPeerList();
          }
          break;
        }

        default:
          break;
      }
    },
    [broadcastRoomState, sendPeerList]
  );

  const handleStreamAdded = useCallback(
    (peerId, stream) => {
      setStreamVersion((v) => v + 1);

      setRoomState((prev) => {
        if (!prev) return prev;
        const exists = prev.members.some((m) => m.peerId === peerId);
        let members;
        if (!exists) {
          const newMember = createMember({
            peerId,
            displayName: 'Guest',
            role: 'guest',
            joinedAt: Date.now(),
          });
          newMember.mediaState = 'ready';
          members = addOrUpdateMember(prev.members, newMember);
        } else {
          members = updateMember(prev.members, peerId, {
            mediaState: 'ready',
            connectionState: 'connected',
          });
        }
        const next = { ...prev, members };
        roomStateRef.current = next;
        return next;
      });

      if (isHostRef.current && roomStateRef.current) {
        const exists = roomStateRef.current.members.some((m) => m.peerId === peerId);
        let next;
        if (!exists) {
          const newMember = createMember({
            peerId,
            displayName: 'Guest',
            role: 'guest',
            joinedAt: Date.now(),
          });
          newMember.mediaState = 'ready';
          next = bumpRoomState(roomStateRef.current, {
            members: addOrUpdateMember(roomStateRef.current.members, newMember),
          });
        } else {
          next = bumpRoomState(roomStateRef.current, {
            members: updateMember(roomStateRef.current.members, peerId, {
              mediaState: 'ready',
              connectionState: 'connected',
            }),
          });
        }
        broadcastRoomState(next);
        sendPeerList();
      }
    },
    [broadcastRoomState, sendPeerList]
  );

  const handleStreamRemoved = useCallback(
    (peerId) => {
      setStreamVersion((v) => v + 1);

      setRoomState((prev) => {
        if (!prev) return prev;
        const members = updateMember(prev.members, peerId, {
          mediaState: 'loading',
          connectionState: 'reconnecting',
        });
        const next = { ...prev, members };
        roomStateRef.current = next;
        return next;
      });
    },
    []
  );

  const createRoom = useCallback(
    async (stream, name) => {
      setErrorMessage('');
      const code = generateRoomCode();
      setRoomCode(code);
      setIsHost(true);
      isHostRef.current = true;
      setDisplayName(name || 'Host');
      setLocalStream(stream);

      const manager = new StudioMediaManager({
        onMessage: handleProtocolMessage,
        onStreamAdded: handleStreamAdded,
        onStreamRemoved: handleStreamRemoved,
        onDataChannelOpened: handleDataChannelOpened,
        onConnectionStateChange: setConnectionState,
        onError: setErrorMessage,
      });
      mediaManagerRef.current = manager;

      try {
        const hostId = await manager.createHost(code, stream, name || 'Host');
        setSelfPeerId(hostId);
        selfPeerIdRef.current = hostId;

        const initialState = createInitialRoomState({
          hostPeerId: hostId,
          hostName: name || 'Host',
        });
        roomStateRef.current = initialState;
        setRoomState(initialState);
        return code;
      } catch (err) {
        console.error('Failed to create studio room:', err);
        return null;
      }
    },
    [handleDataChannelOpened, handleProtocolMessage, handleStreamAdded, handleStreamRemoved]
  );

  const joinRoom = useCallback(
    async (code, stream, name) => {
      setErrorMessage('');
      const cleanCode = (code || '').trim().toUpperCase();
      setRoomCode(cleanCode);
      setIsHost(false);
      isHostRef.current = false;
      setDisplayName(name || 'Guest');
      setLocalStream(stream);

      const hostId = hostPeerIdForCode(cleanCode);
      const optimisticSelf = createMember({
        peerId: 'guest-pending',
        displayName: name || 'Guest',
        role: 'guest',
        joinedAt: Date.now(),
      });
      optimisticSelf.mediaState = 'ready';

      const optimisticHost = createMember({
        peerId: hostId,
        displayName: 'Host',
        role: 'host',
        joinedAt: Date.now() - 1000,
      });

      const initialGuestState = {
        version: 0,
        hostPeerId: hostId,
        backgroundId: 'wine-velvet',
        customBgUrl: null,
        timer: 3,
        shots: 3,
        capturePhase: 'idle',
        captureTimestamps: [],
        members: [optimisticHost, optimisticSelf],
      };
      roomStateRef.current = initialGuestState;
      setRoomState(initialGuestState);

      const manager = new StudioMediaManager({
        onMessage: handleProtocolMessage,
        onStreamAdded: handleStreamAdded,
        onStreamRemoved: handleStreamRemoved,
        onDataChannelOpened: handleDataChannelOpened,
        onConnectionStateChange: setConnectionState,
        onError: setErrorMessage,
      });
      mediaManagerRef.current = manager;

      try {
        const guestId = await manager.joinGuest(cleanCode, stream, name || 'Guest');
        setSelfPeerId(guestId);
        selfPeerIdRef.current = guestId;

        // Update self member id in optimistic state
        setRoomState((prev) => {
          if (!prev) return prev;
          const members = prev.members.map((m) =>
            m.peerId === 'guest-pending' ? { ...m, peerId: guestId } : m
          );
          const next = { ...prev, members };
          roomStateRef.current = next;
          return next;
        });

        // Broadcast identity to host
        manager.broadcast(createIdentityMessage(guestId, name || 'Guest', 'guest'));
        return true;
      } catch (err) {
        console.error('Failed to join studio room:', err);
        return false;
      }
    },
    [handleDataChannelOpened, handleProtocolMessage, handleStreamAdded, handleStreamRemoved]
  );

  const updateSelfParticipant = useCallback(
    (patch) => {
      const peerId = selfPeerIdRef.current;
      if (!peerId || !roomStateRef.current) return;

      if (isHostRef.current) {
        const next = bumpRoomState(roomStateRef.current, {
          members: updateMember(roomStateRef.current.members, peerId, patch),
        });
        broadcastRoomState(next);
      } else {
        mediaManagerRef.current?.broadcast({
          type: PROTOCOL_TYPES.PARTICIPANT_UPDATE,
          peerId,
          patch,
        });
        setRoomState((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            members: updateMember(prev.members, peerId, patch),
          };
          roomStateRef.current = next;
          return next;
        });
      }
    },
    [broadcastRoomState]
  );

  const updateHostSettings = useCallback(
    (patch) => {
      if (!isHostRef.current || !roomStateRef.current) return;
      const next = bumpRoomState(roomStateRef.current, patch);
      broadcastRoomState(next);
    },
    [broadcastRoomState]
  );

  const leaveRoom = useCallback(() => {
    if (selfPeerIdRef.current) {
      mediaManagerRef.current?.broadcast({
        type: PROTOCOL_TYPES.LEAVE,
        peerId: selfPeerIdRef.current,
      });
    }

    mediaManagerRef.current?.destroy();
    mediaManagerRef.current = null;

    setRoomCode(null);
    setIsHost(false);
    isHostRef.current = false;
    setSelfPeerId(null);
    selfPeerIdRef.current = null;
    setConnectionState('idle');
    setRoomState(null);
    roomStateRef.current = null;
    setLocalStream(null);
    setErrorMessage('');
    dataHandlersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      mediaManagerRef.current?.destroy();
      mediaManagerRef.current = null;
    };
  }, []);

  const participants = (roomState?.members ? activeMembers(roomState.members) : [])
    .filter((m) => m.peerId !== selfPeerIdRef.current)
    .map((m) => ({
      peerId: m.peerId,
      name: m.displayName,
      stream: mediaManagerRef.current?.getStream(m.peerId) || null,
      isHost: m.role === 'host',
      mirror: m.mirror,
      flash: m.flash,
      transform: m.transform,
      connectionState: m.connectionState,
      mediaState: m.mediaState,
      joinedAt: m.joinedAt,
    }));

  void streamVersion; // Trigger re-derivation when streams update

  const getStreamForPeer = useCallback((peerId) => {
    if (peerId === selfPeerIdRef.current) return localStream;
    return mediaManagerRef.current?.getStream(peerId) || null;
  }, [localStream]);

  return {
    roomCode,
    isHost,
    connectionState,
    roomState,
    participants,
    selfPeerId,
    localStream,
    displayName,
    errorMessage,
    setErrorMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcast,
    sendTo,
    onData,
    setDisplayName,
    updateSelfParticipant,
    updateHostSettings,
    getStreamForPeer,
  };
}
