import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRow } from '@/lib/stage';
import { STAGE_VIDEOS, STAGE_VIDEO_KEYS, stageVideo, stageVideoUrl } from '@/lib/stage-videos';

describe('stage videos', () => {
  it('lists the four loops with unique keys and files', () => {
    expect(STAGE_VIDEO_KEYS).toEqual(['welcome', 'synthwave_sunset', 'retro_tv', 'neon_city']);
    expect(new Set(STAGE_VIDEOS.map((v) => v.file)).size).toBe(4);
  });
  it('matches the keys the database accepts', () => {
    const sql = readFileSync('supabase/migrations/20261115000020_stage_video.sql', 'utf8');
    const list = sql.match(/p_key not in \(([^)]*)\)/)?.[1] ?? '';
    expect(list.split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual(STAGE_VIDEO_KEYS);
  });
  it('builds the public storage URL', () => {
    expect(stageVideoUrl('https://x.supabase.co/', 'nf26-neoncity.mp4'))
      .toBe('https://x.supabase.co/storage/v1/object/public/stage-videos/nf26-neoncity.mp4');
  });
  it('finds a loop by key and ignores unknown keys', () => {
    expect(stageVideo('retro_tv')?.label).toBe('Retro TV');
    expect(stageVideo('karaoke')).toBeUndefined();
    expect(stageVideo(undefined)).toBeUndefined();
  });
  it('accepts a video row from the stage', () => {
    const r = parseRow({ rev: 3, phase: 'video', payload: { video: 'welcome' }, options: {} });
    expect(r?.phase).toBe('video');
    expect(r?.payload.video).toBe('welcome');
  });
});
