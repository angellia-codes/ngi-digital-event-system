'use client';
import { DrawOperator } from '@/components/station/DrawOperator';
import { StationShell } from '@/components/station/StationShell';
import { useI18n } from '@/lib/i18n';
import { useStation } from '@/lib/use-station';

export default function DrawStation() {
  const { me } = useStation('draw');
  const { t } = useI18n();
  if (!me) return null;
  return (
    <StationShell title={t('draw.title')} me={me}>
      <DrawOperator />
    </StationShell>
  );
}
