'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StageVideo } from '@/components/stage/StageVideo';
import { StageView } from '@/components/stage/StageView';
import { translate } from '@/lib/i18n/strings';
import { slotViews } from '@/lib/stage';
import { stageVideo } from '@/lib/stage-videos';
import { fitScale } from '@/lib/stage-fit';
import { createSound } from '@/lib/stage-sound';
import { useStage, type StageConfig } from '@/lib/use-stage';
import { useStageVideos } from '@/lib/use-stage-videos';

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
  const videos = useStageVideos(cfg.url);
  const playing = row?.phase === 'video' ? stageVideo(row.payload.video) : undefined;
  const startedAt = row?.payload.started_at ?? null;
  // The Play that was already on when this page loaded (a reload mid-video) catches up; a Play seen live starts at 0.
  const atLoad = useRef<{ started: number | null } | null>(null);
  if (row && atLoad.current === null) atLoad.current = { started: row.phase === 'video' ? startedAt : null };
  const resumeFrom = startedAt !== null && atLoad.current?.started === startedAt ? startedAt : null;
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
      {playing && (
        <StageVideo
          key={`${playing.key}-${startedAt ?? ''}`}
          videoKey={playing.key}
          source={videos.source}
          once={playing.once}
          soundOn={soundOn}
          resumeFrom={resumeFrom}
        />
      )}
      <div className="stage__controls">
        {!safe && (
          <button type="button" className="stage__btn" onClick={enableSound} disabled={soundOn}>
            {translate(lang, soundOn ? 'stage.sound_on' : 'stage.sound')}
          </button>
        )}
        <button type="button" className="stage__btn" onClick={fullscreen}>{translate(lang, 'stage.fullscreen')}</button>
        <button type="button" className="stage__btn" onClick={videos.refresh} title={translate(lang, 'stage.videos_reload')}>
          {translate(lang, 'stage.videos', { ready: videos.ready, total: videos.total })}
        </button>
      </div>
      {signedOut && <div className="stage__notice" role="alert">{translate(lang, 'stage.signed_out')}</div>}
    </div>
  );
}
