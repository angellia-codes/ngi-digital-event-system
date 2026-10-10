'use client';
import { useCallback, useEffect, useState } from 'react';
import { ManualSearch, type Found } from '@/components/station/ManualSearch';
import { ResultPanel, type Result } from '@/components/station/ResultPanel';
import { Scanner } from '@/components/station/Scanner';
import { StationShell } from '@/components/station/StationShell';
import { TabBar, type Tab } from '@/components/station/TabBar';
import { api } from '@/lib/client';
import { panelFor } from '@/lib/result-panel';
import { useStation } from '@/lib/use-station';

export default function CheckInStation() {
  const { me } = useStation('checkin');
  const [tab, setTab] = useState<Tab>('scan');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [counter, setCounter] = useState('– / –');

  const refreshCounter = useCallback(async () => {
    const r = await api<{ checked_in: number; total: number }>('/api/station/stats');
    if (r.ok && r.data) setCounter(`${r.data.checked_in} / ${r.data.total}`);
  }, []);
  useEffect(() => {
    if (!me) return;
    refreshCounter();
    const id = setInterval(refreshCounter, 10_000);
    return () => clearInterval(id);
  }, [me, refreshCounter]);

  const submit = useCallback(async (body: { code: string } | { guest_id: string }) => {
    setBusy(true);
    const r = await api<Result>('/api/station/check-in', body);
    setBusy(false);
    setResult(r.ok ? { ...(r.data ?? {}), status: r.status } : { status: 'RETRYABLE_ERROR' });
    if (r.status === 'CHECKED_IN') refreshCounter();
  }, [refreshCounter]);

  if (!me) return null;
  const problem = result ? panelFor('checkin', result.status).tone !== 'green' : false;
  return (
    <StationShell title="CHECK-IN" me={me}>
      {tab === 'scan' && <Scanner onCode={(code) => submit({ code })} paused={busy || !!result} problem={problem} />}
      {result ? (
        <ResultPanel context="checkin" result={result} busy={busy} onNext={() => setResult(null)} />
      ) : tab === 'manual' ? (
        <ManualSearch onPick={(g: Found) => submit({ guest_id: g.id })} />
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <TabBar tab={tab} onTab={(t) => { setResult(null); setTab(t); }} counter={counter} />
    </StationShell>
  );
}
