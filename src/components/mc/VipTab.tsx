'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { vipGroups, vipName, type VipRow } from '@/lib/mc';
import { useLoad } from '@/lib/use-load';

function Group({ label, rows }: { label: string; rows: VipRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  return (
    <section>
      <h2>{label}</h2>
      <ul className="mc-list">
        {rows.map((r) => (
          <li key={r.id} className={r.arrived ? 'mc-vip' : 'mc-vip mc-vip--waiting'}>
            <div className="mc-vip__name">{vipName(r)}</div>
            {r.phonetic && <div className="mc-vip__say">“{r.phonetic}”</div>}
            <div className="mc-vip__meta">{[r.position, r.outlet].filter(Boolean).join(' · ')}</div>
            <span className={r.arrived ? 'mc-badge mc-badge--green' : 'mc-badge'}>{r.arrived ? t('mc.vip_arrived') : t('mc.vip_waiting')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** BOD then HOD, in protocol order. "Present only" is on by default so the MC can read straight down the list. */
export function VipTab() {
  const { t } = useI18n();
  const { data } = useLoad<{ vips: VipRow[] }>('/api/station/mc/vip', 10_000);
  const [presentOnly, setPresentOnly] = useState(true);
  const rows = data?.vips ?? [];
  const g = vipGroups(rows, presentOnly);

  return (
    <div className="mc-tab">
      <label className="mc-toggle">
        <input type="checkbox" checked={presentOnly} onChange={(e) => setPresentOnly(e.target.checked)} />
        {t('mc.vip_present_only')}
      </label>
      {rows.length === 0 ? (
        <p className="op__muted">{t('mc.vip_empty')}</p>
      ) : g.BOD.length + g.HOD.length === 0 ? (
        <p className="op__muted">{t('mc.vip_none_present')}</p>
      ) : (
        <>
          <Group label={t('mc.vip_bod')} rows={g.BOD} />
          <Group label={t('mc.vip_hod')} rows={g.HOD} />
        </>
      )}
    </div>
  );
}
