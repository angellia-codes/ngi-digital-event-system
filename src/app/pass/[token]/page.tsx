import { headers } from 'next/headers';
import { ipFromHeader } from '@/lib/api';
import { witaDate } from '@/lib/invite/time';
import { loadPass } from '@/lib/pass';
import { PassMessage } from '@/components/pass/PassMessage';
import { PassView } from '@/components/pass/PassView';

export const dynamic = 'force-dynamic';

export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = ipFromHeader((await headers()).get('x-forwarded-for'));
  const r = await loadPass(token, ip);
  if (r.status !== 'OK') return <PassMessage kind={r.status} />;

  // The pass is always server-rendered so the QR shows without JavaScript. Only before event day, for a guest who
  // is not checked in, can the invitation still play; whether it does depends on this phone's storage.
  const d = r.data;
  const serverNow = Date.parse(d.server_now);
  const mayInvite = !d.checked_in && witaDate(Number.isNaN(serverNow) ? Date.now() : serverNow) < d.event.date;
  // Hides the pass before first paint when the invitation is about to cover it, so it doesn't flash. Without
  // JavaScript this never runs and the pass stays visible; the timeout un-hides it if the invitation never loads.
  const preflight = mayInvite
    ? `try{var s=localStorage.getItem(${JSON.stringify(`nf_invite_seen_${token.slice(0, 8)}`)})==='1'}catch(e){s=false}`
      + `if(!s){var h=document.documentElement;h.setAttribute('data-nf-inv','pending');setTimeout(function(){h.removeAttribute('data-nf-inv')},8000)}`
    : null;

  return (
    <>
      {preflight && <script dangerouslySetInnerHTML={{ __html: preflight.replace(/</g, '\\u003c') }} />}
      <PassView token={token} initial={d} mayInvite={mayInvite} />
    </>
  );
}
