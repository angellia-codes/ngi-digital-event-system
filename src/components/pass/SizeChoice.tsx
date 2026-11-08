'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { PassData } from '@/lib/pass';
import { SIZES, hasChart, type Size } from '@/lib/sizes';
import { formatDateShort, formatTimeWita } from '@/lib/time';
import { SizeGuide } from './SizeGuide';

/**
 * One component for the invitation scene and the pass card, so they cannot drift (merch size spec §3).
 * Choose → inline confirm → saved (shown only after the server confirms). Final after the first confirmed tap.
 */
export function SizeChoice({ token, data, onChange }: { token: string; data: PassData; onChange: (d: PassData) => void }) {
  const { t, lang } = useI18n();
  const [pick, setPick] = useState<Size | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [guide, setGuide] = useState(false);
  const s = data.merch_size;
  if (!s) return null;

  if (s.size) {
    return (
      <section className="size">
        <h2 className="size__banner">{t('size.banner')}</h2>
        <p className="size__big">{s.size}</p>
        <p className="helper">{t('size.saved')}</p>
        {s.source === 'auto' && <p className="caption">{t('size.auto')}</p>}
      </section>
    );
  }

  async function save(size: Size) {
    setBusy(true);
    setMsg('');
    const r = await api<PassData>(`/api/pass/${token}/merch-size`, { size });
    setBusy(false);
    setPick(null);
    if (r.ok && r.data) onChange(r.data);
    if (r.status === 'CLOSED') setMsg(t('size.closed'));
    else if (!r.ok || !r.data) setMsg(t('size.retry'));
  }

  const ev = data.event;
  const chart = hasChart(ev.merch_size_chart) ? ev.merch_size_chart : null;
  const deadline = ev.merch_size_deadline;
  return (
    <section className="size">
      <h2 className="size__banner">{t('size.title')}</h2>
      {ev.merch_fit_note !== false && <p className="helper">{t('size.fit')}</p>}
      {deadline && (
        <p className="caption">{t('size.deadline', { deadline: `${formatDateShort(deadline, lang)} ${formatTimeWita(deadline)} WITA` })}</p>
      )}
      {chart && (
        <button type="button" className="size__guide-btn" aria-expanded={guide} onClick={() => setGuide(!guide)}>
          {guide ? t('size.guide_hide') : t('size.guide')}
        </button>
      )}
      {chart && guide && <SizeGuide chart={chart} />}
      {pick ? (
        <div className="size__confirm" role="group" aria-label={t('size.title')}>
          <p className="size__q">
            {chart
              ? t('size.confirm', { size: pick, chest: chart[pick].chest, length: chart[pick].length })
              : t('size.confirm_plain', { size: pick })}
          </p>
          <div className="size__row">
            <button type="button" className="size__btn" disabled={busy} onClick={() => save(pick)}>{busy ? t('bev.saving') : t('bev.confirm_yes')}</button>
            <button type="button" className="size__btn size__btn--ghost" disabled={busy} onClick={() => setPick(null)}>{t('bev.confirm_no')}</button>
          </div>
        </div>
      ) : (
        <div className="size__btns">
          {SIZES.map((sz) => (
            <button key={sz} type="button" className="size__btn" onClick={() => setPick(sz)}>{sz}</button>
          ))}
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}
