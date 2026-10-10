import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { translate, type StringKey } from '@/lib/i18n/strings';
import { STAGE_COOKIE, verifyStageCookie } from '@/lib/stage-session';
import '@/styles/stage.css';
import { StageClient } from './StageClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'NourishFest Stage', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const ERRORS: Record<string, StringKey> = {
  invalid: 'stage.error_invalid',
  locked: 'stage.error_locked',
  notset: 'stage.error_notset',
};

export default async function StagePage({ searchParams }: { searchParams: Promise<{ key?: string; error?: string }> }) {
  const sp = await searchParams;
  // A server component cannot set a cookie, so the key goes to the route that can; it redirects back here without it.
  if (sp.key) redirect(`/api/stage/enter?key=${encodeURIComponent(sp.key)}`);

  let valid = false;
  let failed = false;
  try {
    valid = await verifyStageCookie((await cookies()).get(STAGE_COOKIE)?.value);
  } catch {
    failed = true; // the database did not answer; a reload will
  }
  if (valid) {
    const e = env();
    return <StageClient url={e.SUPABASE_URL} anonKey={e.SUPABASE_ANON_KEY} eventId={e.EVENT_ID} />;
  }
  const message = failed ? 'stage.error_retry' : ((sp.error && ERRORS[sp.error]) || 'stage.need_key');
  return (
    <main className="stage-gate">
      <h1>NOURISHFEST 2026</h1>
      <p role="alert">{translate('en', message)}</p>
    </main>
  );
}
