'use client';
import { useEffect, useRef, useState } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { Wordmark } from '@/components/Wordmark';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { PassData } from '@/lib/pass';
import { formatDateLong, formatTimeWita } from '@/lib/time';
import { MerchCard } from './MerchCard';
import { PrizeNumber } from './PrizeNumber';
import { RsvpBlock } from './RsvpBlock';
import { SaveImage } from './SaveImage';
import { TicketCard } from './TicketCard';
import '@/styles/pass.css';

export function PassView({ token, initial }: { token: string; initial: PassData }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(initial);
  const [reveal, setReveal] = useState(false);
  const wasChecked = useRef(initial.checked_in);
  const flag = `nf_seen_${token.slice(0, 8)}`;

  // First view after check-in plays the reveal once.
  useEffect(() => {
    if (!initial.checked_in) return;
    try { if (!localStorage.getItem(flag)) { setReveal(true); localStorage.setItem(flag, '1'); } } catch { /* ignore */ }
  }, [initial.checked_in, flag]);

  // Poll: quickly until checked in (so the pass flips by itself), slowly afterwards (merchandise state).
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await api<PassData>(`/api/pass/${token}`);
      if (r.ok && r.status === 'OK' && r.data) {
        setData(r.data);
        if (r.data.checked_in && !wasChecked.current) {
          wasChecked.current = true;
          setReveal(true);
          try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
        }
      }
    };
    const id = setInterval(tick, data.checked_in ? 15_000 : 6_000);
    return () => clearInterval(id);
  }, [token, data.checked_in, flag]);

  // Keep the screen awake at the door.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = async () => { try { lock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* unsupported */ } };
    ask();
    const onVis = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, []);

  const when = [formatDateLong(data.event.date, lang), data.event.venue].filter(Boolean).join(' · ');

  return (
    <main className="pass">
      <header className="pass__top"><span className="label">NOURISHFEST 2026</span><LangToggle /></header>
      {!data.checked_in ? (
        <>
          <div className="pass__hero">
            <Wordmark />
            <p className="sticker">{t('brand.tagline')}</p>
            <p className="pass__when">{when}</p>
          </div>
          <TicketCard data={data} />
          <RsvpBlock token={token} status={data.guest.rsvp_status} onChange={(s) => setData({ ...data, guest: { ...data.guest, rsvp_status: s } })} />
        </>
      ) : (
        <>
          <div className="pass__who">
            <p className="pass__name">{data.guest.full_name}</p>
            {data.checked_in_at && <span className="chip chip--ok">{t('pass.checked_in_at', { time: formatTimeWita(data.checked_in_at) })}</span>}
          </div>
          {data.prize_number !== null && <PrizeNumber n={data.prize_number} reveal={reveal} />}
          {data.merchandise && <MerchCard merch={data.merchandise} name={data.guest.full_name} reveal={reveal} />}
          {data.prize_number !== null && <SaveImage name={data.guest.full_name} outlet={data.guest.outlet} n={data.prize_number} />}
        </>
      )}
    </main>
  );
}
