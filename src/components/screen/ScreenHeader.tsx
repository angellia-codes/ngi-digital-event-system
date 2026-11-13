'use client';
import { heartbeatState } from '@/lib/draw-ui';
import { useI18n } from '@/lib/i18n';
import { formatClock } from '@/lib/mc';
import { cacheIncomplete, screenDef, screenLabel, secondsSince, type ScreenState } from '@/lib/screens';

/** What is on the videotron now, how far into it, and whether the stage laptop is alive and has every video. */
export function ScreenHeader({ state, offset, now, offline }: { state: ScreenState | null; offset: number; now: number; offline: boolean }) {
  const { t } = useI18n();
  if (!state) return <div className="scr-head">{offline && <div className="scr-head__offline" role="status">{t('screen.offline')}</div>}</div>;

  const def = screenDef(state.screen.key);
  const info = state.screens.find((s) => s.key === state.screen.key);
  const elapsed = secondsSince(state.screen.started_at, now, offset);
  const duration = info?.duration_s ? Math.round(info.duration_s) : null;
  const link = heartbeatState(state.heartbeat_age);
  const cache = state.cache;
  const failed = (cache.failed ?? []).map((k) => t(screenLabel(k))).join(', ');

  return (
    <div className="scr-head">
      {offline && <div className="scr-head__offline" role="status">{t('screen.offline')}</div>}
      <div className="scr-head__label">{t('screen.on_air')}</div>
      <div className="scr-head__title">
        {t(screenLabel(state.screen.key))}
        {state.screen.auto && <span className="mc-badge mc-badge--green">{t('screen.auto')}</span>}
      </div>
      {def.kind === 'once' && duration ? (
        <div className="scr-progress" aria-label={`${formatClock(Math.min(elapsed, duration))} / ${formatClock(duration)}`}>
          <div className="scr-progress__bar" style={{ width: `${Math.min(100, (elapsed / duration) * 100)}%` }} />
          <span>{formatClock(Math.min(elapsed, duration))} / {formatClock(duration)}</span>
        </div>
      ) : def.kind === 'loop' ? (
        <div className="scr-head__meta">{t('screen.loop')}</div>
      ) : null}
      <div className="scr-head__status">
        <span className={`scr-dot scr-dot--${link}`} aria-hidden="true" />
        <span>{t(link === 'ok' ? 'screen.laptop_ok' : link === 'down' ? 'screen.laptop_down' : 'screen.laptop_never')}</span>
        {typeof cache.ready === 'number' && typeof cache.total === 'number' && (
          <span className={cacheIncomplete(cache) ? 'scr-head__bad' : 'scr-head__good'}>{t('screen.ready', { ready: cache.ready, total: cache.total })}</span>
        )}
      </div>
      {failed && <div className="scr-head__bad">{t('screen.failed', { names: failed })}</div>}
    </div>
  );
}
