import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | undefined;
export function db(): SupabaseClient {
  client ??= createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export class RetryableError extends Error {}

/** Calls a SQL function. Business outcomes come back as data; any database error becomes RetryableError. */
export async function rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    console.error('rpc_failed', fn, error.code, error.message.slice(0, 120)); // never log arguments (tokens, PINs)
    throw new RetryableError(fn);
  }
  return data as T;
}

export async function logAttempt(kind: string, raw: string, result: string, actor: string): Promise<void> {
  await rpc('log_attempt', { p_event: env().EVENT_ID, p_kind: kind, p_token: raw, p_result: result, p_actor: actor });
}
