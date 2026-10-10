import { NextResponse } from 'next/server';
import { clientIp, guard } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { signStage, stageCookie } from '@/lib/stage-session';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = guard(async (req: Request) => {
  const key = (new URL(req.url).searchParams.get('key') ?? '').slice(0, 80);
  const r = await rpc<{ status: string; tag?: string }>('verify_stage_key', {
    p_event: env().EVENT_ID, p_key: key, p_ip_key: clientIp(req),
  });
  if (r.status !== 'OK' || !r.tag) {
    return NextResponse.redirect(new URL(`/stage?error=${r.status.toLowerCase().replace('_', '')}`, req.url), { status: 302, headers: NO_STORE });
  }
  const res = NextResponse.redirect(new URL('/stage', req.url), { status: 302, headers: NO_STORE });
  res.cookies.set(stageCookie(await signStage(r.tag)));
  return res;
});
