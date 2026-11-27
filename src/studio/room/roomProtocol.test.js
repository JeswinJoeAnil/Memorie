import { describe, it, expect } from 'vitest';
import { validateIncomingMessage, PROTOCOL_TYPES } from './roomProtocol.js';

const HOST = 'host-1';
const GUEST = 'guest-1';

describe('validateIncomingMessage', () => {
  it('rejects invalid structure', () => {
    expect(validateIncomingMessage(null, GUEST, HOST).valid).toBe(false);
    expect(validateIncomingMessage({}, GUEST, HOST).reason).toBe('invalid_structure');
  });
  it('rejects unknown type', () => {
    expect(validateIncomingMessage({ type: 'EVIL' }, GUEST, HOST).reason).toBe('unknown_type');
  });
  it('rejects invalid sender', () => {
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.IDENTITY }, '', HOST).reason).toBe('invalid_sender');
  });
  it('rejects host-only from guest', () => {
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.SHUTTER, totalShots: 2, timerSec: 3 }, GUEST, HOST).reason).toBe('unauthorized_host_only');
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.SHUTTER, totalShots: 2, timerSec: 3 }, HOST, HOST).valid).toBe(true);
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.ROOM_STATE_SYNC, roomState: {} }, GUEST, HOST).reason).toBe('unauthorized_host_only');
  });
  it('rejects impersonation', () => {
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.PARTICIPANT_UPDATE, peerId: 'other', patch: {} }, GUEST, HOST).reason).toBe('participant_update_impersonation');
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.LEAVE, peerId: 'other' }, GUEST, HOST).reason).toBe('leave_spoofing');
    // self-target is ok
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.PARTICIPANT_UPDATE, peerId: GUEST, patch: {} }, GUEST, HOST).valid).toBe(true);
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.LEAVE, peerId: GUEST }, GUEST, HOST).valid).toBe(true);
  });
  it('rejects payload bounds', () => {
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.IDENTITY, displayName: 'x'.repeat(51) }, GUEST, HOST).reason).toBe('display_name_too_long');
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.SHUTTER, totalShots: 0, timerSec: 3 }, HOST, HOST).reason).toBe('invalid_shot_count');
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.SHUTTER, totalShots: 11, timerSec: 3 }, HOST, HOST).reason).toBe('invalid_shot_count');
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.SHUTTER, totalShots: 2, timerSec: 31 }, HOST, HOST).reason).toBe('invalid_timer');
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.ROOM_STATE_SYNC, roomState: { customBgUrl: 'x'.repeat(260*1024) } }, HOST, HOST).reason).toBe('custom_bg_too_large');
  });
  it('accepts bounded print requests and restricts print data to the host', () => {
    const request = { type: PROTOCOL_TYPES.PRINT_REQUEST, id: 'round', index: 0 };
    const part = { ...request, type: PROTOCOL_TYPES.PRINT_PART, chunk: 'abc', count: 1 };
    expect(validateIncomingMessage(request, GUEST, HOST).valid).toBe(true);
    expect(validateIncomingMessage(part, HOST, HOST).valid).toBe(true);
    expect(validateIncomingMessage(part, GUEST, HOST).valid).toBe(false);
    expect(validateIncomingMessage({ ...part, index: 1 }, HOST, HOST).valid).toBe(false);
    expect(validateIncomingMessage({ ...part, chunk: 'a'.repeat(32769) }, HOST, HOST).valid).toBe(false);
  });
  it('rejects oversized message', () => {
    const big = { type: PROTOCOL_TYPES.IDENTITY, displayName: 'a', extra: 'x'.repeat(310*1024) };
    expect(validateIncomingMessage(big, GUEST, HOST).reason).toBe('message_too_large');
  });
  it('allows minimal valid LEAVE without peerId (fromPeerId only)', () => {
    expect(validateIncomingMessage({ type: PROTOCOL_TYPES.LEAVE }, GUEST, HOST).valid).toBe(true);
  });
});
