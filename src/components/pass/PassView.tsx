'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { Wordmark } from '@/components/Wordmark';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { PassData } from '@/lib/pass';
import { isMapsUrl } from '@/lib/invite/maps';
import { decideStart, readSeen } from '@/lib/invite/play';
import { witaDate } from '@/lib/invite/time';
import { formatDateShort, formatTimeWita } from '@/lib/time';
import { BeverageChoice } from './BeverageChoice';
import { MerchCard } from './MerchCard';
import { PrizeNumber, padPrize } from './PrizeNumber';
import { SaveImage } from './SaveImage';
import { TicketCard } from './TicketCard';
import '@/styles/pass.css';

// Own chunk: only downloaded when the invitation actually plays. The cover keeps the screen black meanwhile.
const Invitation = dynamic(() => import('@/components/invite/Invitation').then((m) => m.Invitation), {
  ssr: false, loading: () => <div className="inv-cover" />,
});

type Reveal = 'static' | 'sealed' | 'reveal';

export function PassView({ token, initial, mayInvite }: { token: string; initial: PassData; mayInvite: boolean }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(initial);
  const [view, setView] = useState<'pass' | 'invitation'>('pass');
  const [decided, setDecided] = useState(!mayInvite);
  const [replay, setReplay] = useState(false);
  const [entered, setEntered] = useState(false);
  const [reveal, setReveal] = useState<Reveal>('static');
  const [riseMerch, setRiseMerch] = useState(false);
  const [offline, setOffline] = useState(false);
  const [said, setSaid] = useState('');
  const wasChecked = useRef(initial.checked_in);
  const offset = useRef(0);
  const flag = `nf_seen_${token.slice(0, 8)}`;

  // The server already rendered the pass. Before event day the invitation may still cover it on a first open.
  useEffect(() => {
    const serverNow = Date.parse(initial.server_now);
    offset.current = Number.isNaN(serverNow) ? 0 : serverNow - Date.now();
    if (mayInvite) {
      const { seen, storageOk } = readSeen(token);
      setView(decideStart({
        checkedIn: initial.checked_in, todayWita: witaDate(Date.now() + offset.current),
        eventDate: initial.event.date, seen, storageOk,
      }));
    }
    setDecided(true);
  }, [token, initial, mayInvite]);
  // Runs after the invitation cover has painted, so the pass never flashes underneath it.
  useEffect(() => { if (decided) document.documentElement.removeAttribute('data-nf-inv'); }, [decided, view]);

  // A guest who opens the pass after check-in sees the number rise once.
  useEffect(() => {
    if (!initial.checked_in) return;
    try {
      if (!localStorage.getItem(flag)) { setReveal('reveal'); setRiseMerch(true); localStorage.setItem(flag, '1'); }
    } catch { /* storage blocked: show the number without the moment */ }
  }, [initial.checked_in, flag]);

  // Checked in while the phone faced the scanner: buzz, announce, and keep the number sealed for the guest's own tap.
  useEffect(() => {
    if (reveal !== 'sealed') return;
    let hidden = false;
    const open = () => setReveal('reveal');
    const onVis = () => { if (document.visibilityState === 'hidden') hidden = true; else if (hidden) open(); };
    window.addEventListener('pointerdown', open, { once: true });
    window.addEventListener('keydown', open, { once: true });
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointerdown', open);
      window.removeEventListener('keydown', open);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reveal]);

  const bevDone = !data.beverage || data.beverage.redeemed;
  // Poll so the pass flips by itself at the door. Check-in can't happen before event day outside rehearsals, so it
  // polls slowly then; after check-in only the merchandise and drink states can change, and once both are done nothing can.
  useEffect(() => {
    let fails = 0;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await api<PassData>(`/api/pass/${token}`);
      if (r.ok && r.status === 'OK' && r.data) {
        fails = 0; setOffline(false);
        setData(r.data);
        if (r.data.checked_in && !wasChecked.current) {
          wasChecked.current = true;
          setReveal('sealed');
          try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
          try { navigator.vibrate?.([80, 60, 160]); } catch { /* unsupported */ }
          if (r.data.prize_number !== null) setSaid(t('pass.checked_in_live', { n: padPrize(r.data.prize_number) }));
        }
      } else if (r.status === 'RETRYABLE_ERROR' && ++fails >= 2) {
        setOffline(true);
      }
    };
    const onOffline = () => setOffline(true);
    const onOnline = () => { void tick(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    const preEvent = witaDate(Date.now() + offset.current) < data.event.date;
    const settled = data.merchandise?.claimed && bevDone;
    const every = !data.checked_in ? (preEvent ? 30_000 : 6_000) : settled ? 60_000 : 15_000;
    const id = setInterval(tick, every);
    return () => { clearInterval(id); window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, [token, data.checked_in, data.merchandise?.claimed, bevDone, data.event.date, flag, t]);

  // Keep the screen awake at the door.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = async () => { try { lock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* unsupported */ } };
    ask();
    const onVis = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, []);

  if (view === 'invitation') {
    return <Invitation data={data} token={token} replay={replay} onBeverage={setData} onDone={() => { setReplay(false); setView('pass'); setEntered(true); }} />;
  }

  const ev = data.event;
  const maps = ev.maps_url && isMapsUrl(ev.maps_url) ? ev.maps_url : null;
  return (
    <div className={data.checked_in ? 'pass-bg pass-bg--after' : 'pass-bg'}>
    <main className={entered && reveal !== 'reveal' ? 'pass pass--enter' : 'pass'}>
      <header className="pass__top"><span className="label">NOURISH GROUP INDONESIA</span><LangToggle /></header>
      {offline && (
        <p className="pass__offline" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.5-1.9M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 11.2 5M12 20h.01" /></svg>
          {t('pass.offline')}
        </p>
      )}
      <div className="pass__hero">
        <Wordmark />
        <p className="pass__when">{formatDateShort(ev.date, lang)}</p>
      </div>
      <TicketCard
        data={data}
        prize={data.prize_number !== null && <PrizeNumber n={data.prize_number} state={reveal} onReveal={() => setReveal('reveal')} />}
      />
      {data.checked_in && data.merchandise && <MerchCard merch={data.merchandise} name={data.guest.full_name} reveal={riseMerch} />}
      <BeverageChoice token={token} data={data} onChange={setData} />
      {(!data.checked_in || data.prize_number !== null) && <SaveImage kind={data.checked_in ? 'number' : 'ticket'} data={data} />}
      <section className="pass__details">
        {ev.doors_at && <p className="pass__gates">{t('invite.doors', { doors: formatTimeWita(ev.doors_at) })}</p>}
        {ev.venue && <p className="pass__venue">{ev.venue}</p>}
        {maps && <a className="link" href={maps} target="_blank" rel="noopener noreferrer">{t('invite.maps')}</a>}
        {!ev.doors_at && !ev.venue && <p className="pass__venue">{t('invite.tba')}</p>}
      </section>
      <button type="button" className="pass__replay" onClick={() => { setReplay(true); setView('invitation'); }}>{t('invite.replay')}</button>
      <div className="sr-only" role="status" aria-live="polite">{said}</div>
    </main>
    </div>
  );
}
