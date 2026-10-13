import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from './draftStorage.js';

describe('draft storage (refresh safety)', () => {
  it('fails gracefully without IndexedDB (jsdom)', async () => {
    // jsdom has no indexedDB — app must keep working in memory
    await expect(saveDraft({ captured: [] })).rejects.toThrow();
    await expect(loadDraft()).rejects.toThrow();
  });
});
