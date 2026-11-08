'use client';
import { QrTile } from '@/components/QrTile';
import { useI18n } from '@/lib/i18n';
import { payloadFor } from '@/lib/qr';
import { formatTimeWita } from '@/lib/time';
import type { PassData } from '@/lib/pass';

export function MerchCard({ merch, size, name, reveal }: {
  merch: NonNullable<PassData['merchandise']>; size?: PassData['merch_size']; name: string; reveal: boolean;
}) {
  const { t } = useI18n();
  if (merch.claimed) {
    const given = size?.given_size;
    return (
      <section className="merch merch--claimed">
        <h2 className="merch__banner merch__banner--muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
          {t('merch.claimed')}
        </h2>
        {given && (
          <p className="merch__size">
            {size?.size && size.size !== given ? t('size.swapped', { reserved: size.size, given }) : t('size.label', { size: given })}
          </p>
        )}
        {merch.redeemed_at && <p className="helper">{t('merch.claimed_at', { time: formatTimeWita(merch.redeemed_at) })}</p>}
      </section>
    );
  }
  return (
    <section className={reveal ? 'merch merch--reveal' : 'merch'}>
      <h2 className="merch__banner">{t('merch.banner')}</h2>
      {size?.size && <p className="merch__size">{t('size.label', { size: size.size })}</p>}
      <QrTile payload={payloadFor('merch', merch.token)} frame="pink" alt={t('merch.qr_alt', { name })} />
      <span className="pill pill--pink">{t('merch.once')}</span>
      <p className="helper">{t('merch.show')}</p>
      <p className="caption caption--warn">{t('merch.warn')}</p>
    </section>
  );
}
