import { headers } from 'next/headers';
import { ipFromHeader } from '@/lib/api';
import { loadPass } from '@/lib/pass';
import { PassMessage } from '@/components/pass/PassMessage';
import { PassView } from '@/components/pass/PassView';

export const dynamic = 'force-dynamic';

export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = ipFromHeader((await headers()).get('x-forwarded-for'));
  const r = await loadPass(token, ip);
  if (r.status === 'OK') return <PassView token={token} initial={r.data} />;
  return <PassMessage kind={r.status} />;
}
