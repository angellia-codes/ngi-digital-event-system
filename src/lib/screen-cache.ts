/**
 * The stage laptop's local copy of the videotron videos (spec 2026-11-13 §5.1). Videos are fetched once into Cache Storage
 * and played from there, so playback never depends on the venue network. Cache entries are keyed by storage path, and a
 * new upload has a new path ('<key>/v<n>.mp4'), so a replaced video is simply a new entry.
 */
import type { ScreenKey } from './screens';

export type ManifestVideo = { key: ScreenKey; path: string; version: number; bytes: number; duration_s: number; url: string | null };
export type ClosingText = { id: [string, string]; en: [string, string] } | null;
export type Manifest = { videos: ManifestVideo[]; closing: ClosingText };
export type CacheProgress = { ready: number; total: number; failed: ScreenKey[] };

export const CACHE_NAME = 'nf-screens';
const PREFIX = '/__nf-screens/';

/** Same-origin URL used only as a Cache Storage key (never fetched). */
export const cacheKey = (path: string): string => `${PREFIX}${path}`;
export const pathFromKey = (url: string): string | null => {
  const i = url.indexOf(PREFIX);
  return i < 0 ? null : url.slice(i + PREFIX.length);
};

/** Which manifest paths to download (smallest first, so most screens are ready soonest) and which cached paths to drop. */
export function planCache(videos: Pick<ManifestVideo, 'path' | 'bytes'>[], cachedPaths: string[]): { download: string[]; remove: string[] } {
  const want = new Set(videos.map((v) => v.path));
  const have = new Set(cachedPaths);
  return {
    download: [...videos].sort((a, b) => a.bytes - b.bytes).map((v) => v.path).filter((p) => !have.has(p)),
    remove: cachedPaths.filter((p) => !want.has(p)),
  };
}

/** Normalises the manifest from /api/stage/screens. */
export function parseManifest(raw: unknown): Manifest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { videos?: unknown; closing?: unknown };
  const videos = Array.isArray(r.videos)
    ? (r.videos as ManifestVideo[]).filter((v) => v && typeof v.path === 'string' && typeof v.key === 'string')
    : [];
  const c = r.closing as { id?: unknown; en?: unknown } | null;
  const two = (x: unknown): x is [string, string] => Array.isArray(x) && x.length === 2 && x.every((s) => typeof s === 'string');
  return { videos, closing: c && two(c.id) && two(c.en) ? { id: c.id, en: c.en } : null };
}

/** Downloads what is missing, drops what is no longer listed, and reports progress after each file. Never throws. */
export async function syncCache(m: Manifest, onProgress: (p: CacheProgress) => void): Promise<CacheProgress> {
  const total = m.videos.length;
  const failed: ScreenKey[] = [];
  let cache: Cache;
  try {
    await navigator.storage?.persist?.().catch(() => false);
    cache = await caches.open(CACHE_NAME);
  } catch {
    const p = { ready: 0, total, failed: m.videos.map((v) => v.key) };
    onProgress(p);
    return p;
  }
  const cached = (await cache.keys()).map((r) => pathFromKey(r.url)).filter((p): p is string => !!p);
  const plan = planCache(m.videos, cached);
  await Promise.all(plan.remove.map((p) => cache.delete(cacheKey(p)).catch(() => false)));

  let ready = total - plan.download.length;
  onProgress({ ready, total, failed: [] });
  for (const path of plan.download) {
    const v = m.videos.find((x) => x.path === path)!;
    try {
      if (!v.url) throw new Error('no_url');
      const res = await fetch(v.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`http_${res.status}`);
      await cache.put(cacheKey(path), res);
      ready += 1;
    } catch {
      failed.push(v.key);
    }
    onProgress({ ready, total, failed: [...failed] });
  }
  return { ready, total, failed };
}

/** A playable URL for one video: a blob URL from the local copy, else the signed URL (streams), else null. */
export async function videoSource(v: ManifestVideo): Promise<{ src: string; release: () => void } | null> {
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(cacheKey(v.path));
    if (hit) {
      const src = URL.createObjectURL(await hit.blob());
      return { src, release: () => URL.revokeObjectURL(src) };
    }
  } catch {
    // Cache Storage not available here: fall through to streaming.
  }
  return v.url ? { src: v.url, release: () => {} } : null;
}
