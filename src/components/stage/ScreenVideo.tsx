'use client';
import { useEffect, useRef, useState } from 'react';
import { videoSource, type ManifestVideo } from '@/lib/screen-cache';
import { screenDef, type ScreenKey } from '@/lib/screens';

const START_TIMEOUT_MS = 8_000;

type Props = {
  /** The live screen's key and screen_rev; a new screen_rev (re)starts playback. */
  screenKey: ScreenKey;
  screenRev: number;
  /** The file for the live screen, or null when the live screen is not a video screen. */
  video: ManifestVideo | null;
  start: { at: number; ended: boolean };
  soundOn: boolean;
  /** A one-off video reached its end (the server decides between hold and go to). */
  onEnded: (screenRev: number) => void;
  /** The live video screen could not be played: the stage shows the brand card instead of black. */
  onFailed: (failed: boolean) => void;
};

function waitFor(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('video_error')); };
    const timer = setTimeout(fail, START_TIMEOUT_MS);
    const cleanup = () => { clearTimeout(timer); el.removeEventListener(event, done); el.removeEventListener('error', fail); };
    el.addEventListener(event, done, { once: true });
    el.addEventListener('error', fail, { once: true });
  });
}

/**
 * Two stacked <video> layers. A new screen loads into the hidden layer and is shown only once it is actually playing
 * (or, for a finished one-off video after a reload, once it has seeked to its last frame), so a switch is a hard cut
 * with no black frame. Loops are always muted; one-off videos have sound once the stage sound is on.
 */
export function ScreenVideo({ screenKey, screenRev, video, start, soundOn, onEnded, onFailed }: Props) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [front, setFront] = useState<0 | 1 | null>(null);
  const frontRef = useRef<0 | 1 | null>(null);
  const releases = useRef<[() => void, () => void]>([() => {}, () => {}]);
  const seq = useRef(0);
  const live = useRef({ screenRev, kind: screenDef(screenKey).kind, audio: screenDef(screenKey).audio, soundOn });
  live.current = { screenRev, kind: screenDef(screenKey).kind, audio: screenDef(screenKey).audio, soundOn };

  const path = video?.path ?? null;
  useEffect(() => {
    const els = [a.current, b.current] as const;
    const token = ++seq.current;
    if (!video || !els[0] || !els[1]) {
      els.forEach((el) => el?.pause());
      frontRef.current = null;
      setFront(null);
      onFailed(false);
      return;
    }
    const back: 0 | 1 = frontRef.current === 0 ? 1 : 0;
    const el = els[back]!;
    const { kind, audio } = live.current;
    (async () => {
      const source = await videoSource(video);
      if (token !== seq.current) { source?.release(); return; }
      if (!source) throw new Error('no_source');
      releases.current[back]();
      releases.current[back] = source.release;
      el.loop = kind === 'loop';
      el.muted = !(audio && live.current.soundOn);
      el.src = source.src;
      await waitFor(el, 'loadedmetadata');
      if (token !== seq.current) return;
      el.currentTime = start.at;
      if (start.ended) {
        el.pause();
        await waitFor(el, 'seeked');
      } else {
        const playing = waitFor(el, 'playing');
        await el.play().catch(async () => {
          // Unmuted autoplay can be refused before the sound button was clicked: play muted instead.
          el.muted = true;
          await el.play();
        });
        await playing;
      }
      if (token !== seq.current) return;
      const old = els[back === 0 ? 1 : 0]!;
      old.pause();
      frontRef.current = back;
      setFront(back);
      onFailed(false);
    })().catch(() => {
      if (token !== seq.current) return;
      els.forEach((x) => x?.pause());
      frontRef.current = null;
      setFront(null);
      onFailed(true);
    });
    // start is read only when the screen changes: it must not restart a playing video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenRev, path]);

  // The sound button can be pressed while a one-off video plays.
  useEffect(() => {
    const el = frontRef.current === null ? null : [a.current, b.current][frontRef.current];
    if (el && live.current.kind === 'once' && live.current.audio) el.muted = !soundOn;
  }, [soundOn, front]);

  useEffect(() => {
    const r = releases.current;
    return () => { r[0](); r[1](); };
  }, []);

  const ended = (i: 0 | 1) => () => {
    if (frontRef.current === i && live.current.kind === 'once') onEnded(live.current.screenRev);
  };

  return (
    <div className="scr-stage" aria-hidden="true">
      <video ref={a} className={front === 0 ? 'scr-video scr-video--front' : 'scr-video'} playsInline preload="auto" disablePictureInPicture onEnded={ended(0)} />
      <video ref={b} className={front === 1 ? 'scr-video scr-video--front' : 'scr-video'} playsInline preload="auto" disablePictureInPicture onEnded={ended(1)} />
    </div>
  );
}
