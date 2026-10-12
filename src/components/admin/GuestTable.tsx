'use client';
import { useEffect, useState } from 'react';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';
import { GuestEditor, type AdminGuest } from './GuestEditor';

export function GuestTable() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [outlet, setOutlet] = useState('');
  const [outlets, setOutlets] = useState<string[]>([]);
  const [editing, setEditing] = useState<AdminGuest | null>(null);
  const { data, loading, reload } = useLoad<{ guests: AdminGuest[] }>(
    `/api/admin/guests?q=${encodeURIComponent(dq)}&outlet=${encodeURIComponent(outlet)}`,
  );

  useEffect(() => {
    const id = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (data && !dq && !outlet) setOutlets([...new Set(data.guests.map((g) => g.outlet))].sort());
  }, [data, dq, outlet]);

  const guests = data?.guests ?? [];
  return (
    <>
      <div className="adm-row">
        <input className="adm-input" placeholder="Search name or employee ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="adm-select" value={outlet} onChange={(e) => setOutlet(e.target.value)} aria-label="Outlet">
          <option value="">All outlets</option>
          {outlets.map((o) => <option key={o}>{o}</option>)}
        </select>
        <span className="adm-muted">{loading ? 'Loading…' : `${guests.length} shown`}</span>
      </div>
      {editing && <GuestEditor guest={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Outlet</th><th>Opened</th><th>Checked in</th><th>Prize no.</th><th>Merch</th><th>Notes</th><th /></tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} className={g.active ? '' : 'is-dim'}>
                <td>{g.employee_id}</td>
                <td>{g.full_name}</td>
                <td>{g.outlet}</td>
                <td>{g.opened ? 'yes' : '–'}</td>
                <td>{g.checked_in_at ? formatTimeWita(g.checked_in_at) : '–'}</td>
                <td>{g.prize_number ?? '–'}</td>
                <td>{g.merch === 'redeemed' ? 'taken' : '–'}</td>
                <td>
                  {g.flagged_missing && <span className="adm-badge adm-badge--pink">missing from file</span>}{' '}
                  {g.is_walk_in && <span className="adm-badge">walk-in</span>}{' '}
                  {!g.active && <span className="adm-badge">inactive</span>}
                </td>
                <td><button className="btn" onClick={() => setEditing(g)}>Edit</button></td>
              </tr>
            ))}
            {!loading && guests.length === 0 && <tr><td colSpan={9} className="adm-muted">No employees yet. Import the CSV above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
