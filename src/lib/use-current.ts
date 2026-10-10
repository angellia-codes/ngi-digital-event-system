'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';
import type { Current } from './draw-ui';

/**
 * The operator's view of the draw. It polls the server every 2 seconds and never depends on Realtime or on the
 * projector being connected. A lost session sends the phone back to the PIN screen.
 */
export function useCurrent(enabled: boolean, intervalMs = 2_000) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [offline, setOffline] = useState(false);

  const reload = useCallback(async () => {
    const r = await api<Current>('/api/station/draw/current');
    if (r.http === 401 || r.http === 403) {
      window.location.href = '/station';
      return;
    }
    if (r.ok && r.data) { setCurrent(r.data); setOffline(false); }
    else setOffline(true); // keep showing the last good answer
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, reload]);

  return { current, offline, reload };
}
