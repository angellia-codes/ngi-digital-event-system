'use client';
import { QrTile } from '@/components/QrTile';
import { useI18n } from '@/lib/i18n';
import { payloadFor } from '@/lib/qr';
import type { PassData } from '@/lib/pass';

export function TicketCard({ data }: { data: PassData }) {
  const { t } = useI18n();
  const meta = [data.guest.outlet, data.guest.department, data.guest.position].filter(Boolean).join(' · ');
  return (
    <section className="ticket">
      <div className="ticket__top">
        <span className="label">{t('pass.greeting')}</span>
        <p className="ticket__name">{data.guest.full_name}</p>
        <p className="ticket__meta">{meta}</p>
      </div>
      <div className="ticket__divider" aria-hidden="true" />
      <div className="ticket__bottom">
        <span className="pill">{t('pass.checkin_label')}</span>
        <QrTile payload={payloadFor('checkin', data.invite_token)} frame="gold" alt={`QR check-in ${data.guest.full_name}`} />
        <p className="helper">{t('pass.show_qr')}</p>
        <p className="caption">{t('pass.brightness')}</p>
      </div>
    </section>
  );
}
