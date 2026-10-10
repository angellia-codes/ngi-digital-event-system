import { redirect } from 'next/navigation';
import { rpc } from './db';
import { env } from './env';
import { supabaseServer } from './supabase-server';

/** For admin server components: returns the signed-in allow-listed admin or redirects to the login page. */
export async function requireAdminPage(): Promise<{ email: string }> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) redirect('/admin/login');
  const allowed = await rpc<boolean>('is_admin', { p_event: env().EVENT_ID, p_email: email }).catch(() => null);
  if (allowed === null) redirect('/admin/login?error=failed');
  if (!allowed) redirect('/admin/login?error=forbidden');
  return { email };
}
