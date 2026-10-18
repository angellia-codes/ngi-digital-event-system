'use client';
import { useState } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import { BEAT_MS, DROP_BEATS } from '@/lib/invite/motion';
import { markSeen } from '@/lib/invite/play';
import type { PassData } from '@/lib/pass';
import { Scenes } from './Scenes';
import { Stage } from './Stage';
import { useMusic } from './useMusic';
import '@/styles/invite.css';

type Phase = 'gate' | 'opening' | 'scroll';
type Leaving = null | 'slow' | 'fast';

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Controller for the invitation layer (motion spec 2026-10-19): gate → opening → scroll scenes → exit to the pass.
 * The exit animates the whole layer and calls onDone on its `inv-leave` animationend.
 */
export function Invitation({ data, token, replay, onDone }: { data: PassData; token: string; replay: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const music = useMusic();
  const [phase, setPhase] = useState<Phase>('gate');
  const [leaving, setLeaving] = useState<Leaving>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const name = data.guest.full_name;
  const label = t('invite.gate_label', { name: name.length > 22 ? `${name.slice(0, 21)}…` : name });

  const play = () => {
    music.start(Date.now() + DROP_BEATS * BEAT_MS);
    setPhase(prefersReduced() ? 'scroll' : 'opening');
  };

  const leave = (speed: 'slow' | 'fast') => {
    if (leaving) return;
    if (!replay) markSeen(token);
    music.stop();
    if (prefersReduced()) { onDone(); return; }
    setLeaving(speed);
  };

  const skipFromGate = () => {
    if (!replay) markSeen(token);
    onDone();
  };

  const className = ['inv', `inv--${phase}`, leaving === 'slow' && 'inv--leave', leaving === 'fast' && 'inv--leave-fast']
    .filter(Boolean).join(' ');

  return (
    <div
      ref={setScroller}
      className={className}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && e.animationName === 'inv-leave') onDone(); }}
    >
      {phase !== 'gate' && (
        <div className="inv-bar">
          {music.ready && (
            <button type="button" className="inv-ctl" onClick={music.toggle} aria-pressed={music.muted}>
              {music.muted ? t('invite.unmute') : t('invite.mute')}
            </button>
          )}
          <LangToggle />
          <button type="button" className="inv-ctl" onClick={() => leave('fast')}>{t('invite.skip')}</button>
          <i className="inv-progress" aria-hidden="true" />
        </div>
      )}
      {phase === 'scroll'
        ? <Scenes data={data} token={token} label={label} root={scroller} onViewPass={() => leave('slow')} />
        : <Stage phase={phase} label={label} onPlay={play} onSkip={skipFromGate} onEnd={() => setPhase('scroll')} />}
    </div>
  );
}
