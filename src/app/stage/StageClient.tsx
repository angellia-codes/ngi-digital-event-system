'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StageView } from '@/components/stage/StageView';
import { translate } from '@/lib/i18n/strings';
import { slotViews } from '@/lib/stage';
import { fitScale } from '@/lib/stage-fit';
import { createSound } from '@/lib/stage-sound';
import { useStage, type StageConfig } from '@/lib/use-stage';

function useFit(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(fitScale(window.innerWidth, window.innerHeight));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

export function StageClient(cfg: StageConfig) {
  const { row, delays, starts, now, signedOut } = useStage(cfg);
  const scale = useFit();
  const sound = useMemo(() => createSound(), []);
  const [soundOn, setSoundOn] = useState(false);
  const [active, setActive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lang = row?.options.language ?? 'en';
  const safe = !!row?.options.safe_mode;
  const reduce = !!row?.options.reduce_effects;
  const views = row ? slotViews(row, starts, now) : [];

  // Sound cues (never in projector-safe mode, never before the first tap).
  const landed = views.filter((v) => v.kind === 'landed').length;
  const revealed = views.filter((v) => v.kind === 'revealed').length;
  const isVoid = row?.phase === 'void';
  const prev = useRef<{ landed: number; revealed: number; isVoid: boolean } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { landed, revealed, isVoid };
    if (!p || !soundOn || safe) return; // the first state after a load is not an event
    if (isVoid && !p.isVoid) sound.play('void');
    else if (revealed > p.revealed) sound.play('revealed');
    else if (landed > p.landed) sound.play('landed');
  }, [landed, revealed, isVoid, soundOn, safe, sound]);

  const enableSound = useCallback(async () => { if (await sound.enable()) setSoundOn(true); }, [sound]);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // The controls and the cursor appear when the pointer moves and fade after 3 seconds. F = full screen, S = sound.
  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 3_000);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') fullscreen();
      if ((e.key === 's' || e.key === 'S') && !safe) enableSound();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(hideTimer.current); };
  }, [fullscreen, enableSound, safe]);

  const classes = ['stage', active ? 'stage--active' : '', safe ? 'stage--safe' : '', reduce ? 'stage--reduce' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} onMouseMove={poke} onPointerDown={poke}>
      <div className="stage__fit" style={{ transform: `scale(${scale})` }}>
        {row ? <StageView row={row} views={views} delays={delays} /> : <div className="stage__boot" />}
      </div>
      <div className="stage__controls">
        {!safe && (
          <button type="button" className="stage__btn" onClick={enableSound} disabled={soundOn}>
            {translate(lang, soundOn ? 'stage.sound_on' : 'stage.sound')}
          </button>
        )}
        <button type="button" className="stage__btn" onClick={fullscreen}>{translate(lang, 'stage.fullscreen')}</button>
      </div>
      {signedOut && <div className="stage__notice" role="alert">{translate(lang, 'stage.signed_out')}</div>}
    </div>
  );
}
