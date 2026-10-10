import { z } from 'zod';
import { ok } from './api';
import { logAttempt } from './db';
import { parseCode } from './qr';

export const codeInput = z
  .object({ code: z.string().min(1).max(200).optional(), guest_id: z.string().uuid().optional() })
  .refine((b) => !!b.code !== !!b.guest_id, { message: 'exactly one of code or guest_id' });
export type CodeInput = z.infer<typeof codeInput>;

/** Returns the token to look up (null for a manual guest id), or a ready response for a wrong or unknown code. */
export async function resolveCode(
  body: CodeInput,
  expected: 'checkin' | 'merch',
  kind: 'checkin' | 'merchandise',
  actor: string,
): Promise<{ token: string | null } | { response: Response }> {
  if (!body.code) return { token: null };
  const parsed = parseCode(body.code);
  if (parsed.kind === expected) return { token: parsed.token };
  if (parsed.kind === 'unknown') {
    await logAttempt(kind, body.code, 'INVALID', actor);
    return { response: ok('INVALID') };
  }
  await logAttempt(kind, parsed.token, 'WRONG_CODE_TYPE', actor); // answered before any guest lookup
  return { response: ok('WRONG_CODE_TYPE') };
}
