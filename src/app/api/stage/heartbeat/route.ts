import { z } from 'zod';
import { fail, guard, ok, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { SCREEN_KEYS } from '@/lib/screens';
import { readStage } from '@/lib/stage-session';

// The video cache report (spec 2026-11-13 §5.1). Older displays send {}: that still counts as a heartbeat.
const cacheSchema = z.object({
  ready: z.number().int().min(0).max(99), total: z.number().int().min(0).max(99),
  failed: z.array(z.enum(SCREEN_KEYS)).max(12), sound_on: z.boolean(),
});

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const raw = await req.json().catch(() => ({}));
  const cache = cacheSchema.safeParse((raw as { cache?: unknown })?.cache);
  if (cache.success) await rpc('stage_heartbeat_report', { p_event: env().EVENT_ID, p_cache: cache.data });
  else await rpc('touch_stage_heartbeat', { p_event: env().EVENT_ID });
  return ok('OK');
});
