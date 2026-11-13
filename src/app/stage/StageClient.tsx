'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClosingCard } from '@/components/stage/ClosingCard';
import { ScreenVideo } from '@/components/stage/ScreenVideo';
import { StageView } from '@/components/stage/StageView';
import { api } from '@/lib/client';
import { translate } from '@/lib/i18n/strings';
import { screenDef, screenLabel, startPosition } from '@/lib/screens';
import { slotViews } from '@/lib/stage';
import { fitScale } from '@/lib/stage-fit';
import { createSound } from '@/lib/stage-sound';
import { useScreenCache } from '@/lib/use-screen-cache';
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
  const sound = useMemo(() => createSound(), []);
  const [soundOn, setSoundOn] = useState(false);
  const { manifest, progress } = useScreenCache(true);
  const report = useRef({ ...progress, sound_on: soundOn });
  report.current = { ...progress, sound_on: soundOn };
  const { row, delays, starts, now, offset, signedOut } = useStage(cfg, () => report.current);
  const scale = useFit();
  const [active, setActive] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
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

  // The video sound needs the same one-time click, so the button shows in projector-safe mode too (spec 2026-11-13 §5.2).
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
      if (e.key === 's' || e.key === 'S') enableSound();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(hideTimer.current); };
  }, [fullscreen, enableSound]);

  // A screen that changes while this page is open starts from 0; the screen found on load resumes by the server clock.
  const firstScreenRev = useRef<number | null>(null);
  if (row && firstScreenRev.current === null) firstScreenRev.current = row.screen_rev;
  const screen = row?.screen ?? null;
  const kind = screen ? screenDef(screen.key).kind : null;
  const video = screen && (kind === 'loop' || kind === 'once') ? (manifest.videos.find((v) => v.key === screen.key) ?? null) : null;
  const start = screen && row
    ? startPosition(screen, video?.duration_s ?? null, row.screen_rev !== firstScreenRev.current, Date.now(), offset)
    : { at: 0, ended: false };
  const onEnded = useCallback((screenRev: number) => { api('/api/stage/ended', { screen_rev: screenRev }); }, []);
  const waitingForFile = (kind === 'loop' || kind === 'once') && !video;

  let board: React.ReactNode = <div className="stage__boot" />;
  if (row && screen) {
    if (kind === 'draw') board = <StageView row={row} views={views} delays={delays} />;
    else if (kind === 'card') board = <ClosingCard lang={lang} text={manifest.closing} />;
    else if (kind === 'black') board = null;
    else if (videoFailed || waitingForFile) board = <ClosingCard lang={lang} text={null} brandOnly />;
    else board = null; // the video layer is showing
  }

  const failedNames = progress.failed.map((k) => translate(lang, screenLabel(k))).join(', ');
  const classes = ['stage', active ? 'stage--active' : '', safe ? 'stage--safe' : '', reduce ? 'stage--reduce' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} onMouseMove={poke} onPointerDown={poke}>
      <ScreenVideo screenKey={screen?.key ?? 'blackout'} screenRev={row?.screen_rev ?? -1} video={video} start={start}
        soundOn={soundOn} onEnded={onEnded} onFailed={setVideoFailed} />
      <div className="stage__fit" style={{ transform: `scale(${scale})` }}>{board}</div>
      <div className="stage__controls">
        <button type="button" className="stage__btn" onClick={enableSound} disabled={soundOn}>
          {translate(lang, soundOn ? 'stage.sound_on' : 'stage.sound')}
        </button>
        <button type="button" className="stage__btn" onClick={fullscreen}>{translate(lang, 'stage.fullscreen')}</button>
        <span className={progress.failed.length ? 'stage__cache stage__cache--bad' : 'stage__cache'}>
          {translate(lang, 'stage.cache', { ready: progress.ready, total: progress.total })}
          {failedNames && ` · ${translate(lang, 'stage.cache_failed', { names: failedNames })}`}
        </span>
      </div>
      {signedOut && <div className="stage__notice" role="alert">{translate(lang, 'stage.signed_out')}</div>}
    </div>
  );
}
