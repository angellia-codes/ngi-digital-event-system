'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { musicDropDelay } from '@/lib/invite/motion';

export const THEME_SRC = '/audio/nourishfest-theme.mp3';

/**
 * Looping theme song. start() must run inside the PRESS PLAY tap: that tap unlocks audio, so the song
 * starts there muted and is rewound and unmuted at `dropAtMs` (the tape click, motion spec §4.3).
 * `ready` turns true only once the file can play, so a missing song just means no mute button.
 * iOS ignores `volume`, so mute and the drop also use the `muted` property.
 */
export function useMusic() {
  const el = useRef<HTMLAudioElement | null>(null);
  const fader = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);

  const fade = useCallback((to: number, ms: number, done?: () => void) => {
    const a = el.current;
    if (!a) return;
    if (fader.current) clearInterval(fader.current);
    const from = a.volume;
    const t0 = performance.now();
    fader.current = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = from + (to - from) * k;
      if (k === 1) { if (fader.current) clearInterval(fader.current); done?.(); }
    }, 50);
  }, []);

  const start = useCallback((dropAtMs: number = Date.now()) => {
    if (el.current) return;
    const a = new Audio(THEME_SRC);
    a.loop = true;
    a.preload = 'none';
    a.volume = 0;
    a.muted = true;
    el.current = a;
    a.addEventListener('canplay', () => {
      setReady(true);
      const drop = () => {
        if (el.current !== a) return;
        a.currentTime = 0;
        a.muted = mutedRef.current;
        a.play().catch(() => { /* blocked: stay silent */ });
        if (!mutedRef.current) fade(1, 600);
      };
      const wait = musicDropDelay(Date.now(), dropAtMs);
      if (wait > 0) dropTimer.current = setTimeout(drop, wait);
      else drop();
    }, { once: true });
    a.addEventListener('error', () => setReady(false));
    a.play().catch(() => { /* blocked or missing file: stay silent */ });
  }, [fade]);

  const stop = useCallback(() => {
    const a = el.current;
    if (!a) return;
    el.current = null;
    if (fader.current) clearInterval(fader.current);
    if (dropTimer.current) clearTimeout(dropTimer.current);
    const from = a.volume;
    const t0 = performance.now();
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 800);
      a.volume = from * (1 - k);
      if (k === 1) { clearInterval(id); a.pause(); a.removeAttribute('src'); a.load(); }
    }, 50);
    setReady(false);
  }, []);

  const toggle = useCallback(() => {
    const a = el.current;
    if (!a) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      fade(0, 300, () => { a.muted = true; });
    } else {
      a.muted = false;
      fade(1, 300);
    }
  }, [fade]);

  // Pause when the tab is hidden, resume from the same point when it comes back.
  useEffect(() => {
    const onVis = () => {
      const a = el.current;
      if (!a) return;
      if (document.visibilityState === 'hidden') a.pause();
      else if (!mutedRef.current) a.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Release on unmount.
  useEffect(() => () => {
    if (fader.current) clearInterval(fader.current);
    if (dropTimer.current) clearTimeout(dropTimer.current);
    el.current?.pause();
    el.current = null;
  }, []);

  return { start, stop, toggle, ready, muted };
}
