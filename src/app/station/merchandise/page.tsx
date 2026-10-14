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

export default function MerchandiseStation() {
  const { me } = useStation('merchandise');
  const [tab, setTab] = useState<Tab>('scan');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [counter, setCounter] = useState('– / –');

  const refreshCounter = useCallback(async () => {
    const r = await api<{ redeemed: number; checked_in: number }>('/api/station/merchandise/count');
    if (r.ok && r.data) setCounter(`${r.data.redeemed} / ${r.data.checked_in}`);
  }, []);
  useEffect(() => {
    if (!me) return;
    refreshCounter();
    const id = setInterval(refreshCounter, 10_000);
    return () => clearInterval(id);
  }, [me, refreshCounter]);

  const asResult = (r: Awaited<ReturnType<typeof api<Result>>>): Result =>
    r.ok ? { ...(r.data ?? {}), status: r.status } : { status: 'RETRYABLE_ERROR' };

  const doLookup = useCallback(async (body: { code: string } | { guest_id: string }) => {
    setBusy(true);
    setResult(asResult(await api<Result>('/api/station/merchandise/lookup', body)));
    setBusy(false);
  }, []);

  // The redemption is recorded only when the "hand over" button is tapped.
  const handOver = useCallback(async () => {
    if (!result?.guest?.id) return;
    setBusy(true);
    const r = await api<Result>('/api/station/merchandise/redeem', { guest_id: result.guest.id });
    setBusy(false);
    setResult(asResult(r));
    if (r.status === 'REDEEMED') refreshCounter();
  }, [result, refreshCounter]);

  if (!me) return null;
  const problem = result ? !['green', 'neutral'].includes(panelFor('merchandise', result.status).tone) : false;
  return (
    <StationShell title="MERCHANDISE" me={me}>
      {tab === 'scan' && <Scanner onCode={(code) => doLookup({ code })} paused={busy || !!result} problem={problem} onManual={() => { setResult(null); setTab('manual'); }} />}
      {result ? (
        <ResultPanel context="merchandise" result={result} busy={busy} onNext={() => setResult(null)} onHandOver={handOver} />
      ) : tab === 'manual' ? (
        <ManualSearch onPick={(g: Found) => doLookup({ guest_id: g.id })} />
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <TabBar tab={tab} onTab={(t) => { setResult(null); setTab(t); }} counter={counter} />
    </StationShell>
  );
}
