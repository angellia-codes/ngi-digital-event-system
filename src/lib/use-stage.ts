'use client';
import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';
import { acceptRow, noteRolls, parseRow, revealDelays, type StageRow } from './stage';

export type StageConfig = { url: string; anonKey: string; eventId: string };

const HEARTBEAT_MS = 5_000;
const POLL_AFTER_MS = 5_000; // Realtime must be down this long before polling starts
const POLL_MS = 3_000;
const RECONCILE_MS = 30_000; // slow safety net even while Realtime says it is fine

/**
 * Keeps one `StageRow` up to date. Three sources feed the same `apply()`: the first fetch, Realtime, and polling.
 * `apply()` keeps a row only if its `rev` is higher, so late or duplicate deliveries change nothing.
 */
export function useStage(cfg: StageConfig) {
  const [row, setRow] = useState<StageRow | null>(null);
  const [delays, setDelays] = useState<Record<number, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [realtimeUp, setRealtimeUp] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const current = useRef<StageRow | null>(null);
  const starts = useRef(new Map<string, number>());
  const sawFirst = useRef(false);

  const apply = useCallback((incoming: StageRow) => {
    const prev = current.current;
    const next = acceptRow(prev, incoming);
    if (next === prev) return;
    const live = sawFirst.current; // the very first row after a load counts as already landed / already revealed
    noteRolls(starts.current, next, Date.now(), live);
    setDelays(live ? revealDelays(prev, next) : {});
    sawFirst.current = true;
    current.current = next;
    setNow(Date.now());
    setRow(next);
  }, []);

  const poll = useCallback(async () => {
    const r = await api<unknown>('/api/stage/state');
    if (r.http === 401) { setSignedOut(true); return; }
    const parsed = r.ok ? parseRow(r.data) : null;
    if (parsed) apply(parsed);
  }, [apply]);

  // First fetch, a slow reconcile, and a refetch whenever the tab becomes visible again.
  useEffect(() => {
    poll();
    const id = setInterval(poll, RECONCILE_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  // Realtime on the single stage_state row (the only table the anon key may read).
  useEffect(() => {
    const sb = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const channel = sb
      .channel('stage')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_state', filter: `event_id=eq.${cfg.eventId}` }, (p) => {
        const parsed = parseRow(p.new);
        if (parsed) apply(parsed);
      })
      .subscribe((status) => setRealtimeUp(status === 'SUBSCRIBED'));
    return () => { sb.removeChannel(channel); };
  }, [cfg.url, cfg.anonKey, cfg.eventId, apply]);

  // Polling fallback: only after Realtime has been down for 5 seconds.
  useEffect(() => {
    if (realtimeUp) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => { poll(); interval = setInterval(poll, POLL_MS); }, POLL_AFTER_MS);
    return () => { clearTimeout(start); if (interval) clearInterval(interval); };
  }, [realtimeUp, poll]);

  // Heartbeat: tells the operator's phone this display is alive.
  useEffect(() => {
    const beat = async () => {
      const r = await api('/api/stage/heartbeat', {});
      if (r.http === 401) setSignedOut(true);
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  // Keep the projector awake.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const take = async () => {
      try { lock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* not allowed here: ignore */ }
    };
    take();
    const onVisible = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}); };
  }, []);

  // A clock that ticks only while a number is rolling, so the roll can end on its own.
  const rolling = !!row?.payload.slots?.some((s) => s.state === 'rolling');
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [rolling]);

  return { row, delays, starts: starts.current, now, link: realtimeUp ? ('live' as const) : ('polling' as const), signedOut };
}
