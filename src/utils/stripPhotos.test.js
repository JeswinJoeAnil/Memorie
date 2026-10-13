import { describe, expect, it } from 'vitest';
import { getPreviewPhotos, getStripPhotos, isStripComplete, missingPhotoCount } from './stripPhotos.js';

describe('strip photo truthfulness (P0.1)', () => {
  it('never includes filler in strip photos', () => {
    expect(getStripPhotos(['a'], 4)).toEqual(['a']);
    expect(getStripPhotos([], 4)).toEqual([]);
    expect(getStripPhotos(['a', 'b', 'c', 'd', 'e'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preview may include filler but strip must not', () => {
    const preview = getPreviewPhotos(['a'], 4);
    expect(preview).toHaveLength(4);
    expect(preview[0]).toBe('a');
    // filler slots are bundled samples, strip stays truthful
    expect(getStripPhotos(['a'], 4)).toHaveLength(1);
  });

  it('completeness helpers', () => {
    expect(isStripComplete(['a', 'b'], 2)).toBe(true);
    expect(isStripComplete(['a'], 2)).toBe(false);
    expect(missingPhotoCount(['a'], 4)).toBe(3);
    expect(missingPhotoCount([], 4)).toBe(4);
  });
});
