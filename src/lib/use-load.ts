'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

type State<T> = { loading: boolean; status: string; data: T | null };

/** GETs an admin endpoint, optionally on an interval. A 401 sends the browser to the login page. */
export function useLoad<T>(path: string, intervalMs?: number) {
  const [state, setState] = useState<State<T>>({ loading: true, status: '', data: null });

  const reload = useCallback(async () => {
    const r = await api<T>(path);
    if (r.http === 401) {
      window.location.href = '/admin/login';
      return;
    }
    setState((prev) => ({ loading: false, status: r.status, data: r.ok ? r.data : prev.data }));
  }, [path]);

  useEffect(() => {
    reload();
    if (!intervalMs) return;
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [reload, intervalMs]);

  return { ...state, reload };
}
