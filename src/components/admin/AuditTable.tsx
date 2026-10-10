'use client';
import { useCallback, useEffect, useState } from 'react';
import { auditSummary, formatStampWita } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';

type AuditRow = { id: number; at: string; actor_type: string; actor: string; action: string; entity: string | null; entity_id: string | null; details: unknown };
const PAGE = 100;

export function AuditTable() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (before?: number) => {
    setBusy(true);
    const r = await api<{ rows: AuditRow[] }>(`/api/admin/audit?limit=${PAGE}${before ? `&before=${before}` : ''}`);
    setBusy(false);
    if (r.http === 401) { window.location.href = '/station'; return; }
    if (!r.ok || !r.data) { setMsg('Could not load the audit log.'); return; }
    setMsg('');
    const got = r.data.rows;
    setRows((prev) => (before ? [...prev, ...got] : got));
    setMore(got.length === PAGE);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="adm-row">
        <button className="btn" onClick={() => load()} disabled={busy}>Refresh</button>
        {msg && <span className="adm-msg adm-msg--error">{msg}</span>}
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Time (WITA)</th><th>Who</th><th>Action</th><th>About</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatStampWita(r.at)}</td>
                <td>{r.actor_type}: {r.actor}</td>
                <td>{r.action.replaceAll('_', ' ')}</td>
                <td>{r.entity}{r.entity_id ? ` ${r.entity_id.slice(0, 8)}` : ''}</td>
                <td className="adm-muted">{auditSummary(r.details)}</td>
              </tr>
            ))}
            {!busy && rows.length === 0 && <tr><td colSpan={5} className="adm-muted">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <div className="adm-row" style={{ marginTop: 14 }}><button className="btn" disabled={busy} onClick={() => load(rows[rows.length - 1]?.id)}>Load older</button></div>}
    </>
  );
}
