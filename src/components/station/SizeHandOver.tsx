'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { SIZES, leftFor, type Size, type SizeSummary } from '@/lib/sizes';

/**
 * Booth hand-over for a READY guest (merch size spec §4). One tap hands over the reserved size; "Ganti ukuran"
 * opens a picker with stock left per size. A size at 0 asks once, because the box count beats the system count.
 * Mount with a `key` per lookup so the picker state starts fresh for each guest.
 */
export function SizeHandOver({ size, summary, busy, onHandOver }: {
  size: Size | null; summary: SizeSummary | null; busy: boolean; onHandOver: (given: Size) => void;
}) {
  const { t } = useI18n();
  const reservedLeft = size ? leftFor(summary, size) : null;
  const out = reservedLeft !== null && reservedLeft <= 0;
  const [picking, setPicking] = useState(size === null || out);
  const [zero, setZero] = useState<Size | null>(null);

  if (zero) {
    return (
      <div className="size-hand">
        <p className="size-alert">{t('size.zero_confirm', { size: zero })}</p>
        <div className="size-hand__actions">
          <button type="button" className="btn--staff" disabled={busy} aria-disabled={busy} onClick={() => onHandOver(zero)}>{t('size.continue')}</button>
          <button type="button" className="btn--staff btn--staff-dark" onClick={() => setZero(null)}>{t('size.cancel')}</button>
        </div>
      </div>
    );
  }

  if (!picking && size) {
    return (
      <div className="size-hand">
        {reservedLeft !== null && <p className="panel__note">{t('size.left', { size, n: reservedLeft })}</p>}
        <div className="size-hand__actions">
          <button type="button" className="btn--staff" disabled={busy} aria-disabled={busy} onClick={() => onHandOver(size)}>{t('size.handover', { size })}</button>
          <button type="button" className="btn--staff btn--staff-dark" onClick={() => setPicking(true)}>{t('size.change')}</button>
        </div>
      </div>
    );
  }

  const alert = size === null || out;
  return (
    <div className="size-hand">
      <p className={alert ? 'size-alert' : 'panel__note'}>{size === null ? t('size.none') : out ? t('size.out', { size }) : t('size.pick')}</p>
      <div className="size-picks" role="group" aria-label={t('size.pick')}>
        {SIZES.map((s) => {
          const left = leftFor(summary, s);
          const empty = left !== null && left <= 0;
          return (
            <button key={s} type="button" className={empty ? 'size-pick size-pick--zero' : 'size-pick'} disabled={busy}
              onClick={() => (empty ? setZero(s) : onHandOver(s))}>
              {s}{left !== null && <small>{left}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
