'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';

type Red = {
  id: string; status: 'redeemed' | 'voided'; redeemed_at: string; station_label: string | null; void_reason: string | null;
  guest: { employee_id: string; full_name: string; outlet: string } | null;
};

export function RedemptionList() {
  const { data, loading, reload } = useLoad<{ redemptions: Red[] }>('/api/admin/redemptions', 15_000);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  async function confirmVoid(id: string) {
    const r = await api(`/api/admin/redemptions/${id}/void`, { reason });
    if (r.status === 'OK') { setVoiding(null); setReason(''); setMsg(''); reload(); }
    else setMsg(r.status === 'REASON_REQUIRED' ? 'Give a reason of at least 5 characters.' : 'Could not void. Refresh and try again.');
  }

  const rows = data?.redemptions ?? [];
  return (
    <>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Time</th><th>Employee</th><th>Outlet</th><th>Booth</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'voided' ? 'is-dim' : ''}>
                <td>{formatTimeWita(r.redeemed_at)}</td>
                <td>{r.guest ? `${r.guest.employee_id} — ${r.guest.full_name}` : '?'}</td>
                <td>{r.guest?.outlet}</td>
                <td>{r.station_label}</td>
                <td>{r.status === 'voided' ? `voided: ${r.void_reason}` : 'handed over'}</td>
                <td>
                  {r.status === 'redeemed' && voiding !== r.id && <button className="btn btn--danger" onClick={() => { setVoiding(r.id); setMsg(''); }}>Void</button>}
                  {voiding === r.id && (
                    <span className="adm-row" style={{ margin: 0 }}>
                      <input className="adm-input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                      <button className="btn btn--danger" onClick={() => confirmVoid(r.id)}>Confirm void</button>
                      <button className="btn" onClick={() => setVoiding(null)}>Cancel</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="adm-muted">No merchandise handed over yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
