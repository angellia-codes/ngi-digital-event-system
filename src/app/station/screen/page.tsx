'use client';
import { useEffect, useState } from 'react';
import { ScreenGrid } from '@/components/screen/ScreenGrid';
import { ScreenHeader } from '@/components/screen/ScreenHeader';
import { StationShell } from '@/components/station/StationShell';
import { useI18n } from '@/lib/i18n';
import { useScreenState } from '@/lib/use-screen';
import { useStation } from '@/lib/use-station';
import '@/styles/mc.css';
import '@/styles/screen.css';

/** Screen Control (spec 2026-11-13): one operator puts screens live on the videotron. Any number of devices share one state. */
export default function ScreenStation() {
  const { me } = useStation('screen');
  const { t } = useI18n();
  const { state, offset, offline, apply } = useScreenState(!!me);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!me) return null;
  return (
    <StationShell title={t('screen.title')} me={me}>
      <ScreenHeader state={state} offset={offset} now={now} offline={offline} />
      {state && <ScreenGrid state={state} onState={apply} />}
    </StationShell>
  );
}
