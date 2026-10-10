import { createServerClient } from '@supabase/ssr';
import { env } from './env';
import { rpc } from './db';
import { parseCookies } from './api';

/** Verifies the Supabase Auth session with getUser() and the admins allowlist. */
export async function getAdmin(req: Request): Promise<{ email: string } | null> {
  const header = req.headers.get('cookie');
  if (!header || !header.includes('sb-')) return null;
  const jar = parseCookies(header);
  const supabase = createServerClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: () => {}, // refreshed by middleware.ts
    },
  });
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return null;
  const allowed = await rpc<boolean>('is_admin', { p_event: env().EVENT_ID, p_email: email });
  return allowed ? { email } : null;
}
