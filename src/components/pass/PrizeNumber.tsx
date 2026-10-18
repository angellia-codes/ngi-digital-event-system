'use client';
import { useI18n } from '@/lib/i18n';

export const padPrize = (n: number) => String(n).padStart(3, '0');

/**
 * `sealed`: the guest was checked in while the phone faced the scanner, so the number waits for their own tap.
 * `reveal`: plays the rise once. `static`: already seen.
 */
export function PrizeNumber({ n, state, onReveal }: { n: number; state: 'static' | 'sealed' | 'reveal'; onReveal?: () => void }) {
  const { t } = useI18n();
  return (
    <section className={state === 'reveal' ? 'prize prize--reveal' : 'prize'}>
      <h3 className="label prize__label">{t('pass.prize_number')}</h3>
      {state === 'sealed' ? (
        <button type="button" className="prize__seal" onClick={onReveal} aria-label={t('pass.reveal_label')}>
          <span>{t('pass.reveal_tap')}</span>
        </button>
      ) : (
        <p className="prize__number">{padPrize(n)}</p>
      )}
      <p className="helper">{t('pass.prize_hint')}</p>
    </section>
  );
}
