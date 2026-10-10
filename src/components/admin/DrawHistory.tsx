'use client';
import { useState } from 'react';
import { describeVoid, drawStatus } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';

type DrawRow = {
  id: string; prize: string; slot: number; quantity: number; number: number; name: string; outlet: string; department: string | null;
  status: string; drawn_at: string; resolved_at: string | null; resolved_by: string | null; void_reason: string | null; redraw_of: string | null;
};

export function DrawHistory() {
  const { data, loading, reload } = useLoad<{ draws: DrawRow[] }>('/api/admin/draws', 5_000);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  async function confirmVoid(id: string) {
    const r = await api(`/api/admin/draws/${id}/void`, { reason });
    if (r.status === 'OK') { setVoiding(null); setReason(''); setMsg(''); reload(); }
    else setMsg(describeVoid(r.status));
  }

  const rows = data?.draws ?? [];
  return (
    <>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Drawn</th><th>Prize</th><th>No.</th><th>Winner</th><th>Outlet</th><th>Status</th><th>Resolved by</th><th /></tr></thead>
          <tbody>
            {rows.map((d) => {
              const st = drawStatus(d.status);
              const live = d.status === 'drawn' || d.status === 'confirmed';
              return (
                <tr key={d.id} className={live ? '' : 'is-dim'}>
                  <td>{formatTimeWita(d.drawn_at)}</td>
                  <td>{d.prize} <span className="adm-muted">{d.slot}/{d.quantity}</span></td>
                  <td>{String(d.number).padStart(3, '0')}</td>
                  <td>{d.name}</td>
                  <td>{d.outlet}</td>
                  <td>
                    <span className={st.tone === 'plain' ? 'adm-badge' : `adm-badge adm-badge--${st.tone}`}>{st.label}</span>
                    {d.void_reason ? <div className="adm-muted">{d.void_reason}</div> : null}
                  </td>
                  <td>{d.resolved_by ?? ''}</td>
                  <td>
                    {live && voiding !== d.id && <button className="btn btn--danger" onClick={() => { setVoiding(d.id); setMsg(''); }}>Void</button>}
                    {voiding === d.id && (
                      <span className="adm-row" style={{ margin: 0 }}>
                        <input className="adm-input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <button className="btn btn--danger" onClick={() => confirmVoid(d.id)}>Confirm void</button>
                        <button className="btn" onClick={() => setVoiding(null)}>Cancel</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="adm-muted">No draws yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
