import { NextResponse } from 'next/server';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase-server';

export const GET = async (req: Request) => {
  const to = (path: string) => NextResponse.redirect(`${env().APP_URL}${path}`);
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return to('/admin/login?error=failed');
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const email = data.user?.email?.toLowerCase();
    if (error || !email) return to('/admin/login?error=failed');
    const allowed = await rpc<boolean>('is_admin', { p_event: env().EVENT_ID, p_email: email });
    if (!allowed) {
      await supabase.auth.signOut();
      return to('/admin/login?error=forbidden');
    }
    await rpc('audit', { p_event: env().EVENT_ID, p_actor_type: 'admin', p_actor: email, p_action: 'admin_login', p_entity: 'admin', p_entity_id: email });
    return to('/admin');
  } catch {
    return to('/admin/login?error=failed');
  }
};
