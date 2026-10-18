'use client';
import { useState, type ReactNode } from 'react';
import { QrTile } from '@/components/QrTile';
import { useI18n } from '@/lib/i18n';
import { payloadFor } from '@/lib/qr';
import { formatTimeWita } from '@/lib/time';
import type { PassData } from '@/lib/pass';

/**
 * One ticket, two sides. A-side (before check-in): the check-in QR. B-side (after): the Door Prize number, with the
 * check-in QR folded away so the merchandise QR is the only code on screen at the booth (Design Guide 8.2).
 */
export function TicketCard({ data, prize }: { data: PassData; prize?: ReactNode }) {
  const { t } = useI18n();
  const [showQr, setShowQr] = useState(false);
  const meta = [data.guest.outlet, data.guest.department, data.guest.position].filter(Boolean).join(' · ');
  const qr = (
    <>
      <span className="pill">{t('pass.checkin_label')}</span>
      <QrTile payload={payloadFor('checkin', data.invite_token)} frame="gold" alt={t('pass.qr_alt', { name: data.guest.full_name })} />
      <p className="helper">{t('pass.show_qr')}</p>
      <p className="caption">{t('pass.brightness')}</p>
    </>
  );
  return (
    <section className={data.checked_in ? 'ticket ticket--b' : 'ticket'}>
      <div className="ticket__top">
        <span className="label">{t('pass.greeting')}</span>
        <h2 className="ticket__name">{data.guest.full_name}</h2>
        <p className="ticket__meta">{meta}</p>
        {data.checked_in && data.checked_in_at && (
          <span className="chip chip--ok">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
            {t('pass.checked_in_at', { time: formatTimeWita(data.checked_in_at) })}
          </span>
        )}
      </div>
      <div className="ticket__divider" aria-hidden="true" />
      {!data.checked_in ? (
        <div className="ticket__bottom">{qr}<p className="helper ticket__hint">{t('pass.screenshot_hint')}</p></div>
      ) : (
        <>
          <div className="ticket__bottom">{prize}</div>
          <div className="ticket__divider" aria-hidden="true" />
          <div className="ticket__bottom">
            <button type="button" className="ticket__toggle" aria-expanded={showQr} aria-controls="checkin-qr" onClick={() => setShowQr((v) => !v)}>
              {t(showQr ? 'pass.hide_checkin_qr' : 'pass.show_checkin_qr')}
            </button>
            <div id="checkin-qr" className="ticket__fold" hidden={!showQr}>{showQr && qr}</div>
          </div>
        </>
      )}
    </section>
  );
}
