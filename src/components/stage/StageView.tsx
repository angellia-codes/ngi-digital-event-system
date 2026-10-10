'use client';
import { useEffect, useState } from 'react';
import { padPrize } from '@/components/pass/PrizeNumber';
import { translate, type StringKey } from '@/lib/i18n/strings';
import { bannerText, type SlotView, type StageRow } from '@/lib/stage';
import { gridColumns } from '@/lib/stage-fit';

const VOID_MS = 3_000; // the "not here" message is brief; then the prize banner returns

/** A number that spins until its parent decides it has landed. Cosmetic only: the winner is already saved. */
function Roll() {
  const [n, setN] = useState(() => 1 + Math.floor(Math.random() * 999));
  useEffect(() => {
    const id = setInterval(() => setN(1 + Math.floor(Math.random() * 999)), 70);
    return () => clearInterval(id);
  }, []);
  return <>{padPrize(n)}</>;
}

const where = (v: { outlet?: string; department?: string }) => [v.outlet, v.department].filter(Boolean).join(' · ');

function Bars() {
  return (
    <div className="eq" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
    </div>
  );
}

export function StageView({ row, views, delays }: { row: StageRow; views: SlotView[]; delays: Record<number, number> }) {
  const lang = row.options.language;
  const t = (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const prize = row.payload.prize;
  const [voidDone, setVoidDone] = useState(false);
  useEffect(() => {
    setVoidDone(false);
    if (row.phase !== 'void') return;
    const id = setTimeout(() => setVoidDone(true), VOID_MS);
    return () => clearTimeout(id);
  }, [row.rev, row.phase]);

  const phase = row.phase === 'void' && voidDone ? 'intro' : row.phase;
  const batch = !!row.payload.batch;
  const single = views[0];
  const banner = bannerText(prize);

  let body: React.ReactNode;
  let progress: string | null = null;

  if (phase === 'idle' || !prize) {
    body = (
      <>
        <h1 className="idle__mark" aria-label="NourishFest 2026"><span>NOURISH</span><span>FEST 2026</span></h1>
        <span className="idle__tag">{t('brand.tagline')}</span>
        <Bars />
        <p className="idle__text">{t('stage.idle')}</p>
      </>
    );
  } else if (phase === 'intro' || (!batch && !single)) {
    body = <span className="banner banner--xl">{banner}</span>;
  } else if (phase === 'void') {
    body = (
      <>
        <span className="banner">{banner}</span>
        <p className="void">{t('draw.no_show')}</p>
      </>
    );
  } else if (batch) {
    body = (
      <>
        <span className="banner">{banner}</span>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${gridColumns(views.length)}, 1fr)` }}>
          {views.map((v) => (
            <div key={`${v.slot}:${v.number}`} className={`tile tile--${v.kind === 'rolling' ? 'landed' : v.kind}`}
              style={{ '--d': `${delays[v.slot] ?? 0}ms` } as React.CSSProperties}>
              <div className="tile__front">
                <span className="tile__num">{v.kind === 'rolling' ? <Roll /> : padPrize(v.number)}</span>
                {v.kind === 'void' && <span className="tile__void">{t('draw.no_show')}</span>}
              </div>
              {v.kind === 'revealed' && (
                <div className="tile__back">
                  <span className="tile__name">{v.name}</span>
                  <span className="tile__where">{where(v)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
    progress = t('draw.batch_count', { n: views.length });
  } else if (single) {
    const revealed = single.kind === 'revealed';
    body = (
      <>
        <span className="banner">{banner}</span>
        <span className="label">{t('draw.landed_label')}</span>
        <p className={`num ${revealed ? 'num--small' : 'num--big'}`}>
          {single.kind === 'rolling' ? <Roll /> : padPrize(single.number)}
        </p>
        {revealed ? (
          <div className="reveal">
            <p className="name">{single.name}</p>
            <span className="where">{where(single)}</span>
          </div>
        ) : (
          <>
            {single.kind === 'landed' && <p className="waiting">{t('draw.waiting_dots')}</p>}
          </>
        )}
      </>
    );
    progress = t('draw.progress', { n: single.slot, total: prize.quantity });
  }

  return (
    <div className="board">
      <header className="board__head">
        <span className="board__title">{t('stage.header')}</span>
        <span className="live"><i />{t('stage.live')}</span>
      </header>
      <main className="board__main">{body}</main>
      <footer className="board__foot"><b>{t('brand.tagline')}</b><span>{progress}</span></footer>
    </div>
  );
}
