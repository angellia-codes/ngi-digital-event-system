'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import { OPENING_BACKUP_MS, stageScale, tickVisible } from '@/lib/invite/motion';
import { Boombox, Cassette } from './art';

type Props = {
  phase: 'gate' | 'opening';
  /** Translated cassette label, e.g. "MIXTAPE UNTUK Kadek Ayu". */
  label: string;
  /** Called inside the PRESS PLAY tap, so audio can start there. */
  onPlay: () => void;
  onSkip: () => void;
  /** Called once when the opening has finished. */
  onEnd: () => void;
};

const letters = (word: string) =>
  word.split('').map((c, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{c}</span>);

/**
 * Gate and opening on one fixed 360 x 640 set (motion spec §4). The cassette stays mounted across the tap,
 * so the gate hands over to the opening without a jump. The opening ends on the cast's `inv-stage-out`
 * animationend, with a backup after OPENING_BACKUP_MS of visible time.
 */
export function Stage({ phase, label, onPlay, onSkip, onEnd }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const onEndRef = useRef(onEnd);
  const ended = useRef(false);

  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    onEndRef.current();
  }, []);

  useEffect(() => {
    const fit = () => { const el = box.current; if (el) setK(stageScale(el.clientWidth, el.clientHeight)); };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (phase !== 'opening') return;
    let seen = 0;
    const id = setInterval(() => {
      seen = tickVisible(seen, 250, document.visibilityState === 'visible');
      if (seen >= OPENING_BACKUP_MS) end();
    }, 250);
    return () => clearInterval(id);
  }, [phase, end]);

  return (
    <div ref={box} className="stage">
      {phase === 'gate' && <div className="stage__gatebar"><LangToggle /></div>}
      <div className="stage-set" style={{ '--k': k } as CSSProperties}>
        <div
          className="stage-cast"
          onAnimationEnd={(e) => { if (e.target === e.currentTarget && e.animationName === 'inv-stage-out') end(); }}
        >
          <div className="stage-bb"><Boombox /></div>
          <div className="stage-tapew"><div className="stage-tape"><Cassette label={label} /></div></div>
          <div className="stage-eq" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
          </div>
          <h1 className="stage-wm" aria-label="NourishFest">
            <span className="stage-wm__a" aria-hidden="true">{letters('NOURISH')}</span>
            <span className="stage-wm__b" aria-hidden="true">{letters('FEST')}</span>
          </h1>
          <p className="stage-stk">{t('brand.tagline')}</p>
          <p className="stage-vcr" aria-hidden="true">
            <span className="stage-vcr__rw">{t('invite.osd_rewind')}</span>
            <span className="stage-vcr__play">{t('invite.osd_play')}</span>
          </p>
          <i className="stage-band" aria-hidden="true" />
        </div>
        <div className="stage-cta">
          <button type="button" className="inv-btn inv-btn--pink stage-press" onClick={onPlay} disabled={phase !== 'gate'}>
            {t('invite.press_play')}
          </button>
          <p className="inv-hint">{t('invite.sound_hint')}</p>
          <button type="button" className="inv-skip" onClick={onSkip} disabled={phase !== 'gate'}>{t('invite.skip')}</button>
        </div>
      </div>
    </div>
  );
}
