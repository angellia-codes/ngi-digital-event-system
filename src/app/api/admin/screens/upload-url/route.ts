import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminPost } from '@/lib/routes';
import { signedUpload } from '@/lib/screen-storage';
import { hasVideo, SCREEN_KEYS, videoPath } from '@/lib/screens';

/**
 * A signed upload URL for the next version of one screen's video. The browser uploads straight to Storage (Vercel caps
 * request bodies at 4.5 MB), then records the upload with POST /api/admin/screens { key, path, bytes, duration_s }.
 */
export const POST = adminPost(z.object({ key: z.enum(SCREEN_KEYS) }), async ({ body }) => {
  if (!hasVideo(body.key)) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ screens: { key: string; video_version: number }[] }>('admin_screen_list', { p_event: env().EVENT_ID });
  const current = r.screens.find((s) => s.key === body.key)?.video_version ?? 0;
  const path = videoPath(body.key, current + 1);
  return ok('OK', { path, url: await signedUpload(path) });
});
