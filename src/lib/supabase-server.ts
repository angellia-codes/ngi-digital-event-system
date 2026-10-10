import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';

/** Cookie-bound client using the anon key. Used only for Google sign-in, sign-out and page-level session checks. */
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // called from a server component: middleware refreshes the session instead
        }
      },
    },
  });
}
