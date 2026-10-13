import { describe, expect, it } from 'vitest';
import { burstConfirmMessage, fullStripMessage, isStripFull, needsBurstConfirm } from './captureGuards.js';

describe('capture guards (P0.2)', () => {
  it('detects full strip', () => {
    expect(isStripFull(4, 4)).toBe(true);
    expect(isStripFull(5, 4)).toBe(true);
    expect(isStripFull(3, 4)).toBe(false);
    expect(isStripFull(0, 4)).toBe(false);
  });

  it('asks confirm only when there is something to lose', () => {
    expect(needsBurstConfirm(0)).toBe(false);
    expect(needsBurstConfirm(2)).toBe(true);
  });

  it('messages mention counts', () => {
    expect(burstConfirmMessage(2, 4)).toContain('2');
    expect(fullStripMessage(4)).toContain('4');
  });
});
