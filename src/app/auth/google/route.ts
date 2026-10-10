import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase-server';

export const GET = async () => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${env().APP_URL}/auth/callback`, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) return NextResponse.redirect(`${env().APP_URL}/admin/login?error=failed`);
  return NextResponse.redirect(data.url);
};
