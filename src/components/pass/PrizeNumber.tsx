'use client';
import { useI18n } from '@/lib/i18n';

export const padPrize = (n: number) => String(n).padStart(3, '0');

export function PrizeNumber({ n, reveal }: { n: number; reveal: boolean }) {
  const { t } = useI18n();
  return (
    <section className={reveal ? 'prize prize--reveal' : 'prize'}>
      <span className="label">{t('pass.prize_number')}</span>
      <p className="prize__number" aria-label={String(n)}>{padPrize(n)}</p>
      <p className="helper">{t('pass.prize_hint')}</p>
    </section>
  );
}
