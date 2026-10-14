'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export const THEME_SRC = '/audio/nourishfest-theme.mp3';

/**
 * Looping theme song. start() must run inside the PRESS PLAY tap (that tap unlocks audio).
 * `ready` turns true only once the file can play, so a missing song just means no mute button.
 */
export function useMusic() {
  const el = useRef<HTMLAudioElement | null>(null);
  const fader = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const start = useCallback(() => {
    if (el.current) return;
    const a = new Audio(THEME_SRC);
    a.loop = true;
    a.preload = 'none';
    a.volume = 0;
    el.current = a;
    a.addEventListener('canplay', () => { setReady(true); if (!mutedRef.current) fade(1, 600); }, { once: true });
    a.addEventListener('error', () => setReady(false));
    a.play().catch(() => { /* blocked or missing file: stay silent */ });
  }, [fade]);

  const stop = useCallback(() => {
    const a = el.current;
    if (!a) return;
    el.current = null;
    if (fader.current) clearInterval(fader.current);
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
    fade(next ? 0 : 1, 300);
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
    el.current?.pause();
    el.current = null;
  }, []);

  return { start, stop, toggle, ready, muted };
}
