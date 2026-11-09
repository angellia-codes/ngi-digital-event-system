'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';
import { clockOffset, type McState } from './mc';

/**
 * The MC's view of the rundown. Polls every 2 seconds, like the draw operator, and never depends on Realtime.
 * Keeps the last good state when the network drops. `offset` is the server clock minus this phone's clock.
 */
export function useMcState(enabled: boolean, intervalMs = 2_000) {
  const [state, setState] = useState<McState | null>(null);
  const [offset, setOffset] = useState(0);
  const [offline, setOffline] = useState(false);

  const apply = useCallback((s: McState) => {
    setState(s);
    setOffset(clockOffset(s.server_now, Date.now()));
    setOffline(false);
  }, []);

  const reload = useCallback(async () => {
    const r = await api<McState>('/api/station/mc/state');
    if (r.http === 401 || r.http === 403) {
      window.location.href = '/station';
      return;
    }
    if (r.ok && r.data) apply(r.data);
    else setOffline(true);
  }, [apply]);

  useEffect(() => {
    if (!enabled) return;
    reload();
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, reload]);

  return { state, offset, offline, reload, apply };
}
