'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './client';
import { parseManifest, syncCache, type CacheProgress, type Manifest } from './screen-cache';

const MANIFEST_MS = 60_000;

/**
 * Keeps the stage laptop's video cache in step with admin uploads: fetch the manifest on load, every 60 seconds and when
 * the tab becomes visible, then download what is missing. One sync runs at a time.
 */
export function useScreenCache(enabled: boolean) {
  const [manifest, setManifest] = useState<Manifest>({ videos: [], closing: null });
  const [progress, setProgress] = useState<CacheProgress>({ ready: 0, total: 0, failed: [] });
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const refresh = async () => {
      if (running.current) return;
      const r = await api<unknown>('/api/stage/screens');
      if (!alive || !r.ok) return;
      const m = parseManifest(r.data);
      setManifest(m);
      running.current = true;
      try {
        await syncCache(m, (p) => { if (alive) setProgress(p); });
      } finally {
        running.current = false;
      }
    };
    refresh();
    const id = setInterval(refresh, MANIFEST_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled]);

  return { manifest, progress };
}
