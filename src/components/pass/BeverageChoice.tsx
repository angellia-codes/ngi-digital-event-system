'use client';
import { useState } from 'react';
import { QrTile } from '@/components/QrTile';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { Beverage, PassData } from '@/lib/pass';
import { payloadFor } from '@/lib/qr';
import { formatDateShort, formatTimeWita } from '@/lib/time';

const NAME = { beer: 'bev.beer', soft_drink: 'bev.soft' } as const;

/**
 * One component for the invitation scene and the pass card, so they cannot drift (spec §6.2).
 * Choose → inline confirm → saved (QR only after the server confirms) → redeemed.
 */
export function BeverageChoice({ token, data, onChange }: { token: string; data: PassData; onChange: (d: PassData) => void }) {
  const { t, lang } = useI18n();
  const [pick, setPick] = useState<Beverage | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const b = data.beverage;
  if (!b) return null;

  if (b.redeemed) {
    return (
      <section className="bev bev--claimed">
        <h2 className="bev__banner bev__banner--muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
          {t('bev.claimed')}
        </h2>
        {b.choice && <p className="bev__drink">{t(NAME[b.choice])}</p>}
        {b.redeemed_at && <p className="helper">{t('bev.claimed_at', { time: formatTimeWita(b.redeemed_at) })}</p>}
      </section>
    );
  }

  if (b.choice && b.token) {
    return (
      <section className="bev">
        <h2 className="bev__banner">{t(NAME[b.choice])}</h2>
        <QrTile payload={payloadFor('beverage', b.token)} frame="green" alt={t('bev.qr_alt', { name: data.guest.full_name })} />
        <span className="bev__once">{t('bev.once')}</span>
        <p className="helper">{t('bev.show')}</p>
        {b.source === 'auto' && <p className="caption">{t('bev.auto')}</p>}
      </section>
    );
  }

  async function save(choice: Beverage) {
    setBusy(true);
    setMsg('');
    const r = await api<PassData>(`/api/pass/${token}/beverage`, { choice });
    setBusy(false);
    setPick(null);
    if (r.ok && r.data) onChange(r.data);
    if (r.status === 'CLOSED') setMsg(t('bev.closed'));
    else if (!r.ok || !r.data) setMsg(t('bev.retry'));
  }

  const deadline = data.event.beverage_deadline;
  return (
    <section className="bev">
      <h2 className="bev__banner">{t('bev.title')}</h2>
      <p className="helper">{t('bev.one')}</p>
      {deadline && (
        <p className="caption">{t('bev.deadline', { deadline: `${formatDateShort(deadline, lang)} ${formatTimeWita(deadline)} WITA` })}</p>
      )}
      {pick ? (
        <div className="bev__confirm" role="group" aria-label={t('bev.title')}>
          <p className="bev__q">{t('bev.confirm', { drink: t(NAME[pick]) })}</p>
          <div className="bev__btns">
            <button type="button" className="bev__btn" disabled={busy} onClick={() => save(pick)}>{busy ? t('bev.saving') : t('bev.confirm_yes')}</button>
            <button type="button" className="bev__btn bev__btn--ghost" disabled={busy} onClick={() => setPick(null)}>{t('bev.confirm_no')}</button>
          </div>
        </div>
      ) : (
        <div className="bev__btns">
          <button type="button" className="bev__btn" onClick={() => setPick('beer')}>{t('bev.beer')}</button>
          <button type="button" className="bev__btn" onClick={() => setPick('soft_drink')}>{t('bev.soft')}</button>
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}
