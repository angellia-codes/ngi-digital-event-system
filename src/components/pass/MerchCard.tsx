'use client';
import { QrTile } from '@/components/QrTile';
import { useI18n } from '@/lib/i18n';
import { payloadFor } from '@/lib/qr';
import { formatTimeWita } from '@/lib/time';
import type { PassData } from '@/lib/pass';

export function MerchCard({ merch, name, reveal }: { merch: NonNullable<PassData['merchandise']>; name: string; reveal: boolean }) {
  const { t } = useI18n();
  if (merch.claimed) {
    return (
      <section className="merch merch--claimed">
        <div className="merch__banner merch__banner--muted">{t('merch.claimed')}</div>
        {merch.redeemed_at && <p className="helper">{t('merch.claimed_at', { time: formatTimeWita(merch.redeemed_at) })}</p>}
      </section>
    );
  }
  return (
    <section className={reveal ? 'merch merch--reveal' : 'merch'}>
      <div className="merch__banner">{t('merch.banner')}</div>
      <span className="pill pill--pink">{t('merch.once')}</span>
      <QrTile payload={payloadFor('merch', merch.token)} frame="pink" alt={`QR merchandise ${name}`} />
      <p className="helper">{t('merch.show')}</p>
      <p className="caption caption--warn">{t('merch.warn')}</p>
    </section>
  );
}
