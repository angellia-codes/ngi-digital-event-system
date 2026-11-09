'use client';
import { DrawOperator } from '@/components/station/DrawOperator';
import { useI18n } from '@/lib/i18n';
import { currentSegment, type McState } from '@/lib/mc';
import { prizeLabel } from '@/lib/prizes';

/** The existing draw controls, limited to the current door-prize segment's prizes, with that segment's progress above. */
export function DrawTab({ state }: { state: McState | null }) {
  const { t } = useI18n();
  const seg = state ? currentSegment(state) : null;
  const inDraw = seg?.kind === 'door_prize' && seg.prizes.length > 0;

  return (
    <>
      {inDraw ? (
        <div className="mc-tab mc-tab--tight">
          <h2>{t('mc.draw_segment_prizes')}</h2>
          <ul className="mc-list">
            {seg.prizes.map((p) => (
              <li key={p.id} className={p.remaining <= 0 ? 'mc-prize mc-prize--done' : 'mc-prize'}>
                <span className="mc-prize__name">{prizeLabel(p)}</span>
                <span className={p.remaining <= 0 ? 'mc-badge mc-badge--green' : 'mc-badge'}>
                  {p.remaining <= 0 ? t('mc.prize_done') : t('mc.prize_open', { n: p.remaining })}
                </span>
                {p.winners.length > 0 && <div className="mc-prize__winners">{p.winners.join(', ')}</div>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mc-notice">{t('mc.draw_not_segment')}</p>
      )}
      <DrawOperator prizeFilter={inDraw ? seg.prizes.map((p) => p.id) : null} />
    </>
  );
}
