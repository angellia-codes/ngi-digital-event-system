'use client';
import { useEffect, useRef, useState } from 'react';
import { DrawTab } from '@/components/mc/DrawTab';
import { McHeader } from '@/components/mc/McHeader';
import { PaxTab } from '@/components/mc/PaxTab';
import { RundownTab } from '@/components/mc/RundownTab';
import { VipTab } from '@/components/mc/VipTab';
import { StationShell } from '@/components/station/StationShell';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { currentSegment } from '@/lib/mc';
import { useMcState } from '@/lib/use-mc';
import { useStation } from '@/lib/use-station';
import '@/styles/operator.css';
import '@/styles/mc.css';

type Tab = 'rundown' | 'vip' | 'pax' | 'draw';
const TABS: { id: Tab; label: StringKey }[] = [
  { id: 'rundown', label: 'mc.tab_rundown' },
  { id: 'vip', label: 'mc.tab_vip' },
  { id: 'pax', label: 'mc.tab_pax' },
  { id: 'draw', label: 'mc.tab_draw' },
];

/**
 * MC cue card (spec 2026-11-09). Every tab stays mounted (hidden when not selected) so the draw keeps its state and
 * polling while the MC reads the VIP list. Any number of MC devices share one live state.
 */
export default function McStation() {
  const { me } = useStation('mc');
  const { t } = useI18n();
  const { state, offset, offline, apply } = useMcState(!!me);
  const [tab, setTab] = useState<Tab>('rundown');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // When a door-prize segment becomes current (on this device or another), jump to the Draw tab once.
  const seen = useRef<string | null>(null);
  const cur = state ? currentSegment(state) : null;
  useEffect(() => {
    const id = cur?.id ?? null;
    if (id === seen.current) return;
    seen.current = id;
    if (cur?.kind === 'door_prize') setTab('draw');
  }, [cur?.id, cur?.kind]);

  if (!me) return null;
  return (
    <StationShell title={t('mc.title')} me={me}>
      <McHeader state={state} offset={offset} now={now} offline={offline} />
      <div className="mc-body">
        <div hidden={tab !== 'rundown'}><RundownTab state={state} onState={apply} /></div>
        <div hidden={tab !== 'vip'}><VipTab /></div>
        <div hidden={tab !== 'pax'}><PaxTab /></div>
        <div hidden={tab !== 'draw'}><DrawTab state={state} /></div>
      </div>
      <nav className="mc-tabs" aria-label="MC">
        {TABS.map((x) => (
          <button key={x.id} type="button" className="mc-tabs__item" aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
            {t(x.label)}
          </button>
        ))}
      </nav>
    </StationShell>
  );
}
