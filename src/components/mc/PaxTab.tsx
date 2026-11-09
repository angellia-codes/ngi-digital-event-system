'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { groupPax, pct, type PaxRow } from '@/lib/mc';
import { useLoad } from '@/lib/use-load';

/** Live attendance: total on top, outlets by most present; tap an outlet for its departments. */
export function PaxTab() {
  const { t } = useI18n();
  const { data } = useLoad<{ rows: PaxRow[] }>('/api/station/mc/pax', 10_000);
  const [openOutlet, setOpenOutlet] = useState<string | null>(null);
  const { total, outlets } = groupPax(data?.rows ?? []);
  const line = (c: { invited: number; checked_in: number }) =>
    t('mc.pax_line', { in: c.checked_in, of: c.invited, pct: pct(c.checked_in, c.invited) });

  return (
    <div className="mc-tab">
      <div className="mc-total">
        <b>{t('mc.pax_total')}</b>
        <span>{line(total)}</span>
      </div>
      {outlets.length === 0 ? (
        <p className="op__muted">{t('mc.pax_empty')}</p>
      ) : (
        <ul className="mc-list">
          {outlets.map((o) => (
            <li key={o.outlet} className="mc-pax">
              <button type="button" className="mc-pax__row" aria-expanded={openOutlet === o.outlet}
                onClick={() => setOpenOutlet(openOutlet === o.outlet ? null : o.outlet)}>
                <span className="mc-pax__name">{o.outlet}</span>
                <span className="mc-pax__num">{line(o)}</span>
              </button>
              {openOutlet === o.outlet && (
                <ul className="mc-pax__depts">
                  {o.departments.map((d) => (
                    <li key={d.department ?? '-'}>
                      <span>{d.department ?? t('mc.pax_no_dept')}</span>
                      <span>{line(d)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
