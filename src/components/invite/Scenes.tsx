'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { buildIcs, googleCalendarUrl, type CalInput } from '@/lib/invite/calendar';
import { BEAT_MS, SETTLE_BEATS, splitLines } from '@/lib/invite/motion';
import { countdownParts, witaDate } from '@/lib/invite/time';
import type { PassData } from '@/lib/pass';
import { formatTimeWita } from '@/lib/time';
import { Cassette, Crowd, MapPin, MapStreets } from './art';

const k = (s: string) => s as StringKey;
const pad = (n: number) => String(n).padStart(2, '0');
/** Motion delay in beats plus any extra custom properties (`--r`, `--i`, `--n`, `--dur`, `--accent`). */
const d = (beats: number, extra: Record<string, string | number> = {}) => ({ '--d': beats, ...extra }) as CSSProperties;
const STEP = 0.17; // beats between list items
const TILTS = ['-8deg', '6deg', '-4deg', '8deg', '-6deg'];
const ACCENTS = ['var(--nf-pink)', 'var(--nf-gold)', 'var(--nf-pink)', 'var(--nf-gold)'];
const STRIP = Array.from({ length: 10 }, (_, i) => <i key={i}>{i}</i>);

/**
 * One scroll scene. Plays once when its top crosses 80% of the scroller's height (spec §6.1), then
 * gets `is-settled` SETTLE_BEATS later, which switches on glass blur once nothing is moving.
 */
function Scene({ root, className = '', children }: { root: HTMLElement | null; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState('');
  useEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    if (typeof IntersectionObserver === 'undefined') { setState('is-in is-settled'); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setState('is-in');
      timer = setTimeout(() => setState('is-in is-settled'), SETTLE_BEATS * BEAT_MS);
    }, { root, rootMargin: '0px 0px -20% 0px', threshold: 0 });
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [root]);
  return <section ref={ref} className={`scene ${className} ${state}`.trim()}>{children}</section>;
}

function Chip({ n }: { n: number | 'end' }) {
  const { t } = useI18n();
  return <span className="chip-track m m-stamp">{n === 'end' ? t('invite.side_end') : t('invite.track', { n: pad(n) })}</span>;
}

function Title({ children }: { children: ReactNode }) {
  return (
    <>
      <h2 className="scene__title m m-slam" style={d(0.25)}>{children}</h2>
      <i className="scene__bar m m-bar" style={d(0.75)} aria-hidden="true" />
    </>
  );
}

function Digits({ value, label }: { value: string; label: string }) {
  return (
    <div className="lcd__group">
      <span className="sr-only">{value}</span>
      <span className="lcd__digits" aria-hidden="true">
        {value.split('').map((c, i) => (
          <span key={i} className="lcd__dg">
            <span className="lcd__strip m m-roll" style={d(1.75, { '--n': Number(c) })}>{STRIP}</span>
          </span>
        ))}
      </span>
      <small>{label}</small>
    </div>
  );
}

/** Letters of a word that slam in 0.06 beat apart, starting at beat 0.25 (About scene). */
function SlamWord({ word, start }: { word: string; start: number }) {
  return (
    <span className="mark__w">
      {word.split('').map((c, i) => <span key={i} className="m m-slam" style={d(0.25 + (start + i) * 0.06)}>{c}</span>)}
    </span>
  );
}

type Props = { data: PassData; token: string; label: string; root: HTMLElement | null; onViewPass: () => void };

export function Scenes({ data, token, label, root, onViewPass }: Props) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(Date.parse(data.server_now) - Date.now());
  const ev = data.event;

  // Countdown ticks every 30 s, but only while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 30_000);
    return () => clearInterval(id);
  }, []);

  const first = data.guest.full_name.trim().split(/\s+/)[0] ?? '';
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

  const tba = (beats: number) => <p className="tba m m-settle" style={d(beats)}>{t('invite.tba')}</p>;
  const digitIndex = (s: string, i: number) => s.slice(0, i).replace(/\D/g, '').length;

  return (
    <div className="scenes">
      {/* 2 · Polaroid (spec §5) */}
      <Scene root={root} className="scene--invited">
        <p className="yo m m-settle">{t('invite.yo', { firstname: first })}</p>
        <div className="cam">
          <i className="cam__slot" aria-hidden="true" />
          <div className="cam__clip">
            <div className="polaroid m m-print" style={d(1.5)}>
              <div className="polaroid__photo">
                <Crowd />
                <i className="polaroid__amber m m-develop" style={d(5, { '--dur': 2.5 })} aria-hidden="true" />
                <i className="polaroid__dark m m-develop" style={d(3.5, { '--dur': 3 })} aria-hidden="true" />
              </div>
              <div className="polaroid__strip m m-settle" style={d(3.75)}>
                <p className="polaroid__name">{data.guest.full_name}</p>
                <p className="polaroid__meta">{data.guest.outlet}</p>
              </div>
            </div>
          </div>
        </div>
        <i className="cam__flash" aria-hidden="true" />
      </Scene>

      {/* 3 · About */}
      <Scene root={root}>
        <Chip n={2} />
        <h2 className="mark" aria-label="NourishFest 2026">
          <SlamWord word="NOURISHFEST" start={0} /> <SlamWord word="2026" start={11} />
        </h2>
        <p className="about">
          {splitLines(t('invite.about')).map((line, i) => (
            <span key={i} className="about__line m m-settle" style={d(1.25 + i * 0.25)}>{line} </span>
          ))}
        </p>
        <p className="sticker-inv m m-stamp" style={d(2, { '--r': '-3deg' })}>{t('brand.tagline')}</p>
      </Scene>

      {/* 4 · Save the date */}
      <Scene root={root}>
        <Chip n={3} />
        <Title>{t('invite.save_date')}</Title>
        <div className="persp">
          <div className="calcard glass m m-hinge" style={d(0.5)} aria-label="December 2026">
            <p className="calcard__month">DESEMBER 2026</p>
            <div className="calcard__grid">
              {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((day, i) => <b key={i}>{day}</b>)}
              <span />
              {Array.from({ length: 31 }, (_, i) => (
                <span key={i} className={i === 9 ? 'is-day' : undefined}>
                  {i + 1}
                  {i === 9 && (
                    <svg className="calcard__circle m m-stamp" style={d(1, { '--r': '-8deg' })} viewBox="0 0 40 40" aria-hidden="true">
                      <ellipse cx="20" cy="20" rx="17" ry="16" />
                    </svg>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
        {cd ? (
          <div className="lcd glass m m-settle" style={d(1.5)} role="timer" aria-live="off">
            {cd.done || isToday ? <b className="lcd__today">{t('invite.today')}</b> : (
              <>
                <Digits value={pad(cd.days)} label={t('invite.cd_days')} />:
                <Digits value={pad(cd.hours)} label={t('invite.cd_hrs')} />:
                <Digits value={pad(cd.mins)} label={t('invite.cd_mins')} />
              </>
            )}
          </div>
        ) : tba(1.5)}
        {cal && (
          <div className="btns">
            <a className="inv-btn inv-btn--gold m m-settle" style={d(2.25)} href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer">{t('invite.add_google')}</a>
            <button type="button" className="inv-btn inv-btn--gold m m-settle" style={d(2.4)} onClick={saveIcs}>{t('invite.add_ics')}</button>
            <p className="inv-hint">{t('invite.ics_hint')}</p>
          </div>
        )}
      </Scene>

      {/* 5 · What time */}
      <Scene root={root}>
        <Chip n={4} />
        <Title>{t('invite.time_title')}</Title>
        {doors ? (
          <>
            <p className="flip" aria-label={doors}>
              {doors.split('').map((c, i) => (c === ':'
                ? <em key={i} className="flip__colon" aria-hidden="true">:</em>
                : <b key={i} className="glass m m-flip" style={d(0.75 + 0.25 * digitIndex(doors, i))} aria-hidden="true">{c}</b>))}
            </p>
            <p className="big m m-settle" style={d(2)}>{t('invite.doors', { doors })}</p>
            {starts && <p className="m m-settle" style={d(2)}>{t('invite.starts', { start: starts })}</p>}
            <p className="inv-hint m m-settle" style={d(2.25)}>{t('invite.early')}</p>
          </>
        ) : tba(0.75)}
      </Scene>

      {/* 6 · Where */}
      <Scene root={root}>
        <Chip n={5} />
        <Title>{t('invite.where_title')}</Title>
        <div className="mapcard m m-settle" style={d(0.5)}>
          <MapStreets />
          <i className="mapcard__ripple m m-ripple" style={d(1.6)} aria-hidden="true" />
          <i className="mapcard__shadow m m-shadow" style={d(1.15)} aria-hidden="true" />
          <MapPin className="mapcard__pin m m-drop" style={d(1)} />
        </div>
        {ev.venue ? <p className="big m m-settle" style={d(1.75)}>{ev.venue}</p> : tba(1.75)}
        {ev.maps_url && (
          <a className="inv-btn inv-btn--green m m-settle" style={d(2)} href={ev.maps_url} target="_blank" rel="noopener noreferrer">{t('invite.maps')}</a>
        )}
      </Scene>

      {/* 7 · Tracklist */}
      <Scene root={root}>
        <Chip n={6} />
        <Title>{t('invite.tracks_title')}</Title>
        <div className="jcard-wrap m m-unfold" style={d(0.5)}>
          <i className="jcard__head m m-play" style={d(1.25)} aria-hidden="true" />
          <ol className="jcard">
            {[1, 2, 3, 4, 5, 6].map((n, i) => (
              <li key={n} className="m m-slide-l" style={d(1.25 + i * STEP)}><b>0{n}</b>{t(k(`invite.track${n}`))}</li>
            ))}
          </ol>
        </div>
      </Scene>

      {/* 8 · Dress code (glass) */}
      <Scene root={root}>
        <Chip n={7} />
        <Title>{t('invite.dress_title')}</Title>
        <div className="cards m m-settle" style={d(0.5)}>
          {[1, 2, 3, 4].map((n, i) => (
            <div key={n} className="outfit glass m m-deal" style={{ ...d(1 + i * 0.25, { '--i': i, '--r': TILTS[i], '--accent': ACCENTS[i] }), zIndex: 5 - i }}>
              <h3>{t(k(`invite.dress${n}_t`))}</h3>
              <p>{t(k(`invite.dress${n}`))}</p>
            </div>
          ))}
          <div className="outfit outfit--skip glass m m-deal" style={{ ...d(2, { '--i': 4, '--r': TILTS[4] }), zIndex: 1 }}>
            <h3>{t('invite.dress_skip_t')}</h3>
            <p>{t('invite.dress_skip')}</p>
            <span className="outfit__x m m-stamp" style={d(2.5, { '--r': '-12deg' })} aria-hidden="true">✖</span>
          </div>
        </div>
      </Scene>

      {/* 9 · Do's & Don'ts (glass) */}
      <Scene root={root}>
        <Chip n={8} />
        <Title>{t('invite.dos_title')}</Title>
        <div className="rules">
          <div className="rules__panel glass m m-slide-l" style={d(0.5, { '--accent': 'var(--nf-gold)' })}>
            <p className="rules__hd">{t('invite.do_hd')}</p>
            <ul>
              {[1, 2, 3, 4, 5].map((n, i) => (
                <li key={n}>
                  <span className="rules__ic m m-stamp" style={d(1.25 + i * STEP)} aria-hidden="true">✔</span>
                  <span className="m m-settle" style={d(1.25 + i * STEP)}>{t(k(`invite.do${n}`), { doors: doors ?? '17:00' })}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rules__panel glass m m-slide-r" style={d(0.75, { '--accent': 'var(--nf-pink)' })}>
            <p className="rules__hd">{t('invite.dont_hd')}</p>
            <ul>
              {[1, 2, 3, 4, 5].map((n, i) => (
                <li key={n}>
                  <span className="rules__ic m m-stamp" style={d(1.5 + i * STEP)} aria-hidden="true">✖</span>
                  <span className="m m-settle" style={d(1.5 + i * STEP)}>{t(k(`invite.dont${n}`))}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Scene>

      {/* 10 · Outro */}
      <Scene root={root} className="scene--outro">
        <Chip n="end" />
        <div className="outro-tape m m-eject" style={d(0.25)}><Cassette label={label} /></div>
        <p className="big m m-slam" style={d(1)}>{t('invite.outro')}</p>
        <button type="button" className="inv-btn inv-btn--pink outro-btn" onClick={onViewPass}>{t('invite.view_pass')}</button>
      </Scene>
    </div>
  );
}
