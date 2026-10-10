'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

type State<T> = { loading: boolean; status: string; data: T | null };

export function useLoad<T>(path: string, intervalMs?: number) {
  const [state, setState] = useState<State<T>>({ loading: true, status: '', data: null });

  const reload = useCallback(async () => {
    const r = await api<T>(path);
    if (r.http === 401) {
      window.location.href = '/station';
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
