'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STAGE_VIDEOS, stageVideo, stageVideoUrl, type StageVideoKey } from './stage-videos';

/** Bump to make every display download the loops again (e.g. after a file was replaced under the same name). */
const CACHE = 'nf-stage-videos-v1';
const RETRY_MS = 60_000;

export type VideoStatus = 'loading' | 'ready' | 'failed';

async function openCache(): Promise<Cache | null> {
  try { return typeof caches === 'undefined' ? null : await caches.open(CACHE); } catch { return null; }
}

/** Downloads one loop into the browser's cache unless it is already there. True when it is stored. */
async function ensureCached(url: string): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  if (await cache.match(url)) return true;
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('video/')) return false;
  await cache.put(url, res);
  return true;
}

/**
 * Keeps the four loops on the stage laptop, so a video plays from the laptop itself and a slow or dropped
 * connection at the venue cannot interrupt it. Downloads start when the stage page opens; failures retry every minute.
 * `source(key)` returns a local object URL when the file is cached, otherwise the network URL (still playable online).
 */
export function useStageVideos(supabaseUrl: string) {
  const [status, setStatus] = useState<Record<string, VideoStatus>>(() =>
    Object.fromEntries(STAGE_VIDEOS.map((v) => [v.key, 'loading' as VideoStatus])));
  const busy = useRef(false);
  const latest = useRef(status);
  latest.current = status;

  const fill = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (const v of STAGE_VIDEOS) { // one at a time, so the first loop is ready as soon as possible
        let ok = false;
        try { ok = await ensureCached(stageVideoUrl(supabaseUrl, v.file)); } catch { ok = false; }
        setStatus((s) => ({ ...s, [v.key]: ok ? 'ready' : 'failed' }));
      }
    } finally {
      busy.current = false;
    }
  }, [supabaseUrl]);

  useEffect(() => {
    fill();
    const id = setInterval(() => {
      if (Object.values(latest.current).some((x) => x === 'failed')) fill();
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [fill]);

  /** Forget the stored copies and download all four again. */
  const refresh = useCallback(async () => {
    try { if (typeof caches !== 'undefined') await caches.delete(CACHE); } catch { /* ignore */ }
    setStatus(Object.fromEntries(STAGE_VIDEOS.map((v) => [v.key, 'loading' as VideoStatus])));
    await fill();
  }, [fill]);

  const source = useCallback(async (key: StageVideoKey): Promise<{ src: string; local: boolean } | null> => {
    const v = stageVideo(key);
    if (!v) return null;
    const url = stageVideoUrl(supabaseUrl, v.file);
    try {
      const hit = await (await openCache())?.match(url);
      if (hit) return { src: URL.createObjectURL(await hit.blob()), local: true };
    } catch { /* fall through to the network */ }
    return { src: url, local: false };
  }, [supabaseUrl]);

  const ready = STAGE_VIDEOS.filter((v) => status[v.key] === 'ready').length;
  return { status, ready, total: STAGE_VIDEOS.length, source, refresh };
}
