import { fail, guard, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { signedDownloads } from '@/lib/screen-storage';
import { readStage } from '@/lib/stage-session';

type Video = { key: string; path: string; version: number; bytes: number; duration_s: number };

/** The stage laptop's download list: every screen with a video, a signed URL each, and the closing card text. */
export const GET = guard(async (req: Request) => {
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const r = await rpc<{ videos: Video[]; closing: unknown }>('stage_screens', { p_event: env().EVENT_ID });
  const urls = await signedDownloads(r.videos.map((v) => v.path));
  return ok('OK', { videos: r.videos.map((v) => ({ ...v, url: urls[v.path] ?? null })), closing: r.closing });
});
