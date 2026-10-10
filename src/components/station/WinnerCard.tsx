'use client';
import type { ReactNode } from 'react';
import { padPrize } from '@/components/pass/PrizeNumber';
import { useI18n } from '@/lib/i18n';
import '@/styles/operator.css';

export type WinnerInfo = { number: number; name: string; outlet: string; department: string | null };
type Tone = 'gold' | 'green' | 'pink';

/**
 * Number, name and outlet in large type. With `onConfirm` / `onNoShow` it also shows the two big buttons, 16 px apart,
 * black text on green and pink. The same card serves the MC screen and the Prize Verification screen.
 */
export function WinnerCard(props: {
  winner: WinnerInfo;
  tone?: Tone;
  tag?: string;
  prizeLine?: string;
  compact?: boolean;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm?: () => void;
  onNoShow?: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const { winner, tone = 'gold', tag, prizeLine, compact, busy, confirmLabel, onConfirm, onNoShow, children } = props;
  return (
    <section className={`winner winner--${tone}${compact ? ' winner--compact' : ''}`}>
      {tag && <span className={`winner__tag winner__tag--${tone}`}>{tag}</span>}
      {prizeLine && <span className="winner__prize">{prizeLine}</span>}
      <p className="winner__number" aria-label={String(winner.number)}>{padPrize(winner.number)}</p>
      <p className="winner__name">{winner.name}</p>
      <p className="winner__meta">{[winner.outlet, winner.department].filter(Boolean).join(' · ')}</p>
      {children}
      {(onConfirm || onNoShow) && (
        <div className="actions">
          {onConfirm && <button type="button" className="btn-confirm" disabled={busy} onClick={onConfirm}>{confirmLabel ?? t('draw.confirm')}</button>}
          {onNoShow && <button type="button" className="btn-noshow" disabled={busy} onClick={onNoShow}>{t('draw.not_here')}</button>}
        </div>
      )}
    </section>
  );
}
