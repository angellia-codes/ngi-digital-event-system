import { describe, expect, it } from 'vitest';
import { cacheKey, parseManifest, pathFromKey, planCache } from '@/lib/screen-cache';

describe('screen cache', () => {
  it('maps paths to cache keys and back', () => {
    expect(cacheKey('welcome/v2.mp4')).toBe('/__nf-screens/welcome/v2.mp4');
    expect(pathFromKey('https://nf.example/__nf-screens/welcome/v2.mp4')).toBe('welcome/v2.mp4');
    expect(pathFromKey('https://nf.example/other')).toBeNull();
  });
  it('downloads what is missing, smallest first, and drops old versions', () => {
    const videos = [{ path: 'welcome/v2.mp4', bytes: 90 }, { path: 'ambient_dinner/v1.mp4', bytes: 10 }, { path: 'nominees/v1.mp4', bytes: 50 }];
    expect(planCache(videos, ['welcome/v1.mp4', 'nominees/v1.mp4'])).toEqual({
      download: ['ambient_dinner/v1.mp4', 'welcome/v2.mp4'],
      remove: ['welcome/v1.mp4'],
    });
    expect(planCache([], ['x/v1.mp4'])).toEqual({ download: [], remove: ['x/v1.mp4'] });
  });
  it('reads the manifest defensively', () => {
    expect(parseManifest(null)).toEqual({ videos: [], closing: null });
    const m = parseManifest({
      videos: [{ key: 'welcome', path: 'welcome/v1.mp4', version: 1, bytes: 5, duration_s: 9, url: 'u' }, { nope: 1 }],
      closing: { id: ['A', 'B'], en: ['C', 'D'] },
    });
    expect(m.videos).toHaveLength(1);
    expect(m.closing?.en[0]).toBe('C');
    expect(parseManifest({ videos: [], closing: { id: ['A'], en: ['C', 'D'] } }).closing).toBeNull();
  });
});
