'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { buildIcs, googleCalendarUrl, type CalInput } from '@/lib/invite/calendar';
import { markSeen } from '@/lib/invite/play';
import { countdownParts, witaDate } from '@/lib/invite/time';
import type { PassData } from '@/lib/pass';
import { formatTimeWita } from '@/lib/time';
import { Boombox, Cassette, Equalizer, MapPin } from './art';
import { useMusic } from './useMusic';
import '@/styles/invite.css';

const OPENING_MS = 8000;
const k = (s: string) => s as StringKey;

/** Adds `is-in` once the scene is scrolled into view; CSS animations start from that class. */
function Scene({ id, className = '', children }: { id: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <section ref={ref} id={id} className={`scene ${className} ${seen ? 'is-in' : ''}`}>{children}</section>;
}

export function Invitation({ data, token, replay, onDone }: { data: PassData; token: string; replay: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const music = useMusic();
  const [phase, setPhase] = useState<'gate' | 'opening' | 'scroll'>('gate');
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(Date.parse(data.server_now) - Date.now());
  const ev = data.event;

  // Countdown ticks every 30 s, but only while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase !== 'opening') return;
    const id = setTimeout(() => setPhase('scroll'), OPENING_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const finish = () => {
    if (!replay) markSeen(token);
    music.stop();
    onDone();
  };

  const play = () => {
    music.start();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setPhase(reduced ? 'scroll' : 'opening');
  };

  const first = data.guest.full_name.trim().split(/\s+/)[0] ?? '';
  const label = data.guest.full_name.length > 22 ? `${data.guest.full_name.slice(0, 21)}…` : data.guest.full_name;
  const doors = ev.doors_at ? formatTimeWita(ev.doors_at) : null;
  const starts = ev.starts_at ? formatTimeWita(ev.starts_at) : null;
  const serverNow = now + offset.current;
  const isToday = witaDate(serverNow) >= ev.date;
  const cd = ev.doors_at ? countdownParts(Date.parse(ev.doors_at), serverNow) : null;

  const cal = useMemo<CalInput | null>(() => {
    if (!ev.doors_at) return null;
    const startMs = Date.parse(ev.doors_at);
    const endMs = ev.ends_at ? Date.parse(ev.ends_at) : Date.parse(`${ev.date}T23:00:00+08:00`);
    const link = `${window.location.origin}/pass/${token}`;
    return {
      title: 'NourishFest 2026', startMs, endMs, location: ev.venue ?? '',
      details: `${t('invite.doors', { doors: formatTimeWita(ev.doors_at) })}\n${t('invite.dress_title')}\n${link}`,
      uid: `${token.slice(0, 8)}@nourishfest`,
    };
  }, [ev, token, t]);

  function saveIcs() {
    if (!cal) return;
    const url = URL.createObjectURL(new Blob([buildIcs(cal)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'nourishfest-2026.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const tba = <p className="tba">{t('invite.tba')}</p>;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (phase === 'gate') {
    return (
      <div className="inv inv--gate">
        <Cassette label={t('invite.gate_label', { name: label })} spin />
        <button type="button" className="inv-btn inv-btn--pink" onClick={play}>{t('invite.press_play')}</button>
        <p className="inv-hint">{t('invite.sound_hint')}</p>
        <button type="button" className="inv-skip inv-skip--gate" onClick={finish}>{t('invite.skip')}</button>
      </div>
    );
  }

  return (
    <div className="inv">
      <div className="inv-bar">
        {music.ready && (
          <button type="button" className="inv-ctl" onClick={music.toggle} aria-pressed={music.muted}>
            {music.muted ? t('invite.unmute') : t('invite.mute')}
          </button>
        )}
        <LangToggle />
        <button type="button" className="inv-ctl" onClick={finish}>{t('invite.skip')}</button>
      </div>

      {phase === 'opening' && (
        <div className="open" aria-hidden="true">
          <div className="open__tape"><Cassette label={t('invite.gate_label', { name: label })} spin /></div>
          <Boombox playing />
          <Equalizer />
          <h1 className="open__mark"><span>NOURISH</span><span>FEST</span></h1>
          <p className="open__sticker">{t('brand.tagline')}</p>
        </div>
      )}

      {phase === 'scroll' && (
        <div className="scenes">
          <Scene id="invited" className="scene--invited">
            <p className="yo">{t('invite.yo', { firstname: first })}</p>
            <div className="polaroid">
              <div className="polaroid__photo"><span>NF</span></div>
              <p className="polaroid__name">{data.guest.full_name}</p>
              <p className="polaroid__meta">{data.guest.outlet}</p>
            </div>
          </Scene>

          <Scene id="about">
            <h2 className="mark">NOURISHFEST 2026</h2>
            <p className="typed">{t('invite.about')}</p>
            <p className="sticker-inv">{t('brand.tagline')}</p>
          </Scene>

          <Scene id="date">
            <h2 className="scene__title">{t('invite.save_date')}</h2>
            <div className="calcard" aria-label="December 2026">
              <p className="calcard__month">DESEMBER 2026</p>
              <div className="calcard__grid">
                {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((d, i) => <b key={i}>{d}</b>)}
                <span />
                {Array.from({ length: 31 }, (_, i) => (
                  <span key={i} className={i === 9 ? 'is-day' : undefined}>{i + 1}{i === 9 && <svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="20" rx="17" ry="16" /></svg>}</span>
                ))}
              </div>
            </div>
            {cd ? (
              <div className="lcd" role="timer" aria-live="off">
                {cd.done || isToday ? <b className="lcd__today">{t('invite.today')}</b> : (
                  <>
                    <div><b>{pad(cd.days)}</b><small>{t('invite.cd_days')}</small></div>:
                    <div><b>{pad(cd.hours)}</b><small>{t('invite.cd_hrs')}</small></div>:
                    <div><b>{pad(cd.mins)}</b><small>{t('invite.cd_mins')}</small></div>
                  </>
                )}
              </div>
            ) : tba}
            {cal && (
              <div className="btns">
                <a className="inv-btn inv-btn--gold" href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer">{t('invite.add_google')}</a>
                <button type="button" className="inv-btn inv-btn--gold" onClick={saveIcs}>{t('invite.add_ics')}</button>
                <p className="inv-hint">{t('invite.ics_hint')}</p>
              </div>
            )}
          </Scene>

          <Scene id="time">
            <h2 className="scene__title">{t('invite.time_title')}</h2>
            {doors ? (
              <>
                <p className="flip">{doors.split('').map((c, i) => <b key={i} style={{ animationDelay: `${i * 120}ms` }}>{c}</b>)}</p>
                <p className="big">{t('invite.doors', { doors })}</p>
                {starts && <p>{t('invite.starts', { start: starts })}</p>}
                <p className="inv-hint">{t('invite.early')}</p>
              </>
            ) : tba}
          </Scene>

          <Scene id="where">
            <h2 className="scene__title">{t('invite.where_title')}</h2>
            <MapPin />
            {ev.venue ? <p className="big">{ev.venue}</p> : tba}
            {ev.maps_url && <a className="inv-btn inv-btn--green" href={ev.maps_url} target="_blank" rel="noopener noreferrer">{t('invite.maps')}</a>}
          </Scene>

          <Scene id="tracks">
            <h2 className="scene__title">{t('invite.tracks_title')}</h2>
            <ol className="jcard">
              {[1, 2, 3, 4, 5, 6].map((n, i) => (
                <li key={n} style={{ animationDelay: `${i * 90}ms` }}><b>0{n}</b> {t(k(`invite.track${n}`))}</li>
              ))}
            </ol>
          </Scene>

          <Scene id="dress">
            <h2 className="scene__title">{t('invite.dress_title')}</h2>
            <div className="cards">
              {[1, 2, 3, 4].map((n, i) => (
                <div key={n} className="outfit" style={{ animationDelay: `${i * 110}ms` }}>
                  <h3>{t(k(`invite.dress${n}_t`))}</h3><p>{t(k(`invite.dress${n}`))}</p>
                </div>
              ))}
              <div className="outfit outfit--skip" style={{ animationDelay: '440ms' }}>
                <h3><span aria-hidden="true">✖ </span>{t('invite.dress_skip_t')}</h3><p>{t('invite.dress_skip')}</p>
              </div>
            </div>
          </Scene>

          <Scene id="rules">
            <h2 className="scene__title">{t('invite.dos_title')}</h2>
            <div className="rules">
              <ul className="rules__do">
                {[1, 2, 3, 4, 5].map((n) => <li key={n}><span aria-hidden="true">✔</span> {t(k(`invite.do${n}`), { doors: doors ?? '17:00' })}</li>)}
              </ul>
              <ul className="rules__dont">
                {[1, 2, 3, 4, 5].map((n) => <li key={n}><span aria-hidden="true">✖</span> {t(k(`invite.dont${n}`))}</li>)}
              </ul>
            </div>
          </Scene>

          <Scene id="outro" className="scene--outro">
            <Cassette label={t('invite.gate_label', { name: label })} spin />
            <p className="big">{t('invite.outro')}</p>
            <button type="button" className="inv-btn inv-btn--pink" onClick={finish}>{t('invite.view_pass')}</button>
          </Scene>
        </div>
      )}
    </div>
  );
}
