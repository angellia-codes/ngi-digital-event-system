import { describe, expect, it } from 'vitest';
import { checkVideo, describeVideoProblems, hasAvc1, isMp4, MAX_VIDEO_BYTES } from '@/lib/mp4-check';

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const mp4Head = (withAvc1: boolean) => bytes(`\0\0\0\x20ftypisom....moov....trak${withAvc1 ? '....avc1' : '....hev1'}....`);
const meta = { bytes: 50_000_000, width: 1920, height: 1080, duration: 92.5 };

describe('mp4 check', () => {
  it('recognises the ftyp box and the H.264 sample entry', () => {
    expect(isMp4(mp4Head(true))).toBe(true);
    expect(isMp4(bytes('RIFF....AVI '))).toBe(false);
    expect(hasAvc1(mp4Head(true))).toBe(true);
    expect(hasAvc1(mp4Head(false))).toBe(false);
  });
  it('accepts a 1080p H.264 MP4', () => {
    expect(checkVideo(mp4Head(true), meta)).toEqual([]);
    expect(checkVideo(mp4Head(true), { ...meta, width: 3840, height: 2160 })).toEqual([]);
  });
  it('lists every problem', () => {
    expect(checkVideo(bytes('RIFF....AVI '), meta)).toEqual(['NOT_MP4']);
    expect(checkVideo(mp4Head(false), meta)).toEqual(['NOT_H264']);
    expect(checkVideo(mp4Head(true), { ...meta, bytes: MAX_VIDEO_BYTES + 1 })).toEqual(['TOO_BIG']);
    expect(checkVideo(mp4Head(true), { ...meta, width: 1080, height: 1920 })).toEqual(['NOT_16_9']);
    expect(checkVideo(mp4Head(true), { ...meta, duration: NaN })).toEqual(['NO_DURATION']);
  });
  it('allows 1% ratio tolerance only', () => {
    expect(checkVideo(mp4Head(true), { ...meta, width: 1920, height: 1088 })).toEqual([]);
    expect(checkVideo(mp4Head(true), { ...meta, width: 1920, height: 1200 })).toEqual(['NOT_16_9']);
  });
  it('describes problems with the actual values', () => {
    expect(describeVideoProblems(['NOT_16_9', 'TOO_BIG'], { ...meta, width: 1080, height: 1920, bytes: 400 * 1024 * 1024 }))
      .toBe('Not 16:9 (1080 × 1920). Larger than 300 MB (400 MB).');
  });
});
