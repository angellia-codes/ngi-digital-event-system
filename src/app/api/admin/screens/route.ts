import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';
import { signedDownloads } from '@/lib/screen-storage';
import { SCREEN_KEYS, usbName, type ScreenKey } from '@/lib/screens';

type Row = { key: ScreenKey; video_path: string | null };

/** Every screen with its settings, plus a preview URL and a named download URL (USB fallback) for each video. */
export const GET = adminGet(async () => {
  const r = await rpc<{ screens: Row[] }>('admin_screen_list', { p_event: env().EVENT_ID });
  const paths = r.screens.map((s) => s.video_path).filter((p): p is string => !!p);
  const keyOf = new Map(r.screens.map((s) => [s.video_path, s.key]));
  const [preview, download] = await Promise.all([
    signedDownloads(paths),
    signedDownloads(paths, (p) => usbName(keyOf.get(p)!)),
  ]);
  return ok('OK', {
    screens: r.screens.map((s) => ({
      ...s, preview_url: s.video_path ? (preview[s.video_path] ?? null) : null, download_url: s.video_path ? (download[s.video_path] ?? null) : null,
    })),
  });
});

const line = z.string().max(60);
const pair = z.tuple([line, line]);
const schema = z.union([
  // A finished upload (path from /api/admin/screens/upload-url).
  z.object({ key: z.enum(SCREEN_KEYS), path: z.string().max(80), bytes: z.number().int().positive(), duration_s: z.number().positive() }),
  // Settings: end action (one-off videos) or closing text.
  z.object({
    key: z.enum(SCREEN_KEYS),
    end_action: z.enum(['hold', 'goto']).optional(),
    end_target: z.enum(SCREEN_KEYS).nullable().optional(),
    card_text: z.object({ id: pair, en: pair }).optional(),
  }),
]);

export const POST = adminPost(schema, async ({ actor, body }) => {
  if ('path' in body) {
    const r = await rpc<{ status: string }>('admin_set_screen_video', {
      p_event: env().EVENT_ID, p_key: body.key, p_path: body.path, p_bytes: body.bytes, p_duration: body.duration_s, p_actor: actorId(actor),
    });
    return ok(r.status, r);
  }
  const { key, ...data } = body;
  const r = await rpc<{ status: string }>('admin_save_screen', { p_event: env().EVENT_ID, p_key: key, p_data: data, p_actor: actorId(actor) });
  return ok(r.status, r);
});
