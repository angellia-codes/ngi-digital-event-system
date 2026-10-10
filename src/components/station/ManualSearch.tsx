'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';

export type Found = { id: string; full_name: string; outlet: string; employee_id: string; checked_in: boolean };

export function ManualSearch({ onPick }: { onPick: (g: Found) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Found[] | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setRows(null); return; }
    const id = setTimeout(async () => {
      const r = await api<{ guests: Found[] }>(`/api/station/guests?q=${encodeURIComponent(q.trim())}`);
      if (r.ok && r.data) setRows(r.data.guests);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="search">
      <input className="field field--text" type="search" inputMode="search" autoComplete="off" autoFocus
        placeholder={t('staff.search_placeholder')} aria-label={t('staff.search_placeholder')}
        value={q} onChange={(e) => setQ(e.target.value)} />
      {rows?.length === 0 && <p className="search__empty">{t('staff.search_empty')}</p>}
      {rows?.map((g) => (
        <button key={g.id} type="button" className="search__row" onClick={() => onPick(g)}>
          <b>{g.full_name}</b>
          <span>{g.outlet} · {g.employee_id}{g.checked_in ? ` · ${t('staff.already_in')}` : ''}</span>
        </button>
      ))}
    </div>
  );
}
