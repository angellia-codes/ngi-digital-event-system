'use client';
import { useI18n } from '@/lib/i18n';
import { currentSegment, driftMinutes, elapsedSeconds, formatClock, formatDrift, type McState } from '@/lib/mc';

/** Shown on every tab: the current segment, its clock against the plan, and how late it started. */
export function McHeader({ state, offset, now, offline }: { state: McState | null; offset: number; now: number; offline: boolean }) {
  const { t } = useI18n();
  const seg = state ? currentSegment(state) : null;
  const elapsed = state?.current_started_at ? elapsedSeconds(state.current_started_at, now, offset) : 0;
  const over = !!seg && elapsed > seg.duration_min * 60;
  const drift = seg?.started_at ? driftMinutes(seg.planned_start, seg.started_at) : 0;

  return (
    <div className="mc-head">
      {offline && <div className="mc-head__offline" role="status">{t('mc.offline')}</div>}
      {!state || state.phase === 'not_started' ? (
        <div className="mc-head__title">{t('mc.not_started')}</div>
      ) : state.phase === 'ended' || !seg ? (
        <div className="mc-head__title">{t('mc.ended')}</div>
      ) : (
        <>
          <div className="mc-head__title">▶ {seg.title}</div>
          <div className="mc-head__meta">
            <span className={over ? 'mc-head__clock mc-head__clock--over' : 'mc-head__clock'}>
              {t('mc.clock', { elapsed: formatClock(elapsed), planned: seg.duration_min })}
            </span>
            <span className={drift > 0 ? 'mc-head__drift mc-head__drift--late' : 'mc-head__drift'}>
              {t('mc.segment_drift', { drift: formatDrift(drift) })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
