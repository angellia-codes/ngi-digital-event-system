/**
 * The background loops the admin can put on the stage display. The keys must match `set_stage_video` in
 * `supabase/migrations/20261115000020_stage_video.sql`. The files live in the public Supabase Storage bucket
 * `stage-videos` under exactly these names (silent H.264 MP4s, no audio track).
 */
export const STAGE_VIDEO_BUCKET = 'stage-videos';

export const STAGE_VIDEOS = [
  { key: 'welcome', label: 'Welcome', file: 'nf26-welcome.mp4' },
  { key: 'synthwave_sunset', label: 'Synthwave Sunset', file: 'nf26-synthwave-sunset.mp4' },
  { key: 'retro_tv', label: 'Retro TV', file: 'nf26-retro-tv.mp4' },
  { key: 'neon_city', label: 'Neon City', file: 'nf26-neoncity.mp4' },
] as const;

export type StageVideoKey = (typeof STAGE_VIDEOS)[number]['key'];
export type StageVideo = (typeof STAGE_VIDEOS)[number];

export const STAGE_VIDEO_KEYS = STAGE_VIDEOS.map((v) => v.key) as [StageVideoKey, ...StageVideoKey[]];

export function stageVideo(key: string | null | undefined): StageVideo | undefined {
  return STAGE_VIDEOS.find((v) => v.key === key);
}

/** Public URL of one loop. `supabaseUrl` is the project URL, e.g. https://xyz.supabase.co */
export function stageVideoUrl(supabaseUrl: string, file: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${STAGE_VIDEO_BUCKET}/${encodeURIComponent(file)}`;
}
