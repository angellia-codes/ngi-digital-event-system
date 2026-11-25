'use client';
import { useEffect, useRef, useState } from 'react';
import type { StageVideoKey } from '@/lib/stage-videos';

type Source = (key: StageVideoKey) => Promise<{ src: string; local: boolean } | null>;

type Props = {
  videoKey: StageVideoKey;
  source: Source;
  /** Play one time and then hide (the draw board shows). Otherwise repeat silently until the stage changes. */
  once: boolean;
  /** Sound was switched on at this laptop (S key). Only a `once` video uses it. */
  soundOn: boolean;
  /** Set only when the page loaded while this video was already on: the server time (ms) it started, to catch up. */
  resumeFrom: number | null;
};

/**
 * One video, full window (not the 16:9 board), never cropped: a 1520 × 640 loop fills the LED wall, a 16:9 film
 * fills the projector. If the file cannot play, or a `once` video has finished, the element hides itself and the
 * draw board underneath shows instead.
 */
export function StageVideo({ videoKey, source, once, soundOn, resumeFrom }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const wantSound = once && soundOn;

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    source(videoKey).then((r) => {
      if (cancelled || !r) { if (r?.local) URL.revokeObjectURL(r.src); return; }
      if (r.local) made = r.src;
      setSrc(r.src);
    });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [videoKey, source]);

  // Sound switched on (or off) while the film is running.
  useEffect(() => { if (ref.current) ref.current.muted = !wantSound; }, [wantSound]);

  function start() {
    const v = ref.current;
    if (!v) return;
    if (resumeFrom !== null && Number.isFinite(v.duration)) {
      const elapsed = (Date.now() - resumeFrom) / 1000;
      if (once && elapsed >= v.duration - 1) { setGone(true); return; } // it already finished before the reload
      if (elapsed > 3) v.currentTime = once ? elapsed : elapsed % v.duration;
    }
    v.muted = !wantSound;
    // A browser that still refuses sound (S not pressed on this page) gets the film silent rather than not at all.
    v.play().catch(() => { v.muted = true; v.play().catch(() => setGone(true)); });
  }

  if (gone) return null;
  if (!src) return <div className="stage__video" />; // black for the moment it takes to read the file
  return (
    <video
      ref={ref}
      className="stage__video"
      src={src}
      muted
      loop={!once}
      playsInline
      disablePictureInPicture
      preload="auto"
      onLoadedMetadata={start}
      onEnded={() => setGone(true)}
      onError={() => setGone(true)}
    />
  );
}
