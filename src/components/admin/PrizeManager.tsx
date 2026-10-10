'use client';
import { useState } from 'react';
import { describePrize } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';
import type { PrizeRow } from '@/lib/prizes';
import { useLoad } from '@/lib/use-load';

type Draft = { name: string; tier: string; quantity: string; sort_order: string; draw_as_batch: boolean };
const EMPTY: Draft = { name: '', tier: '', quantity: '1', sort_order: '', draw_as_batch: false };
const toDraft = (p: PrizeRow): Draft => ({
  name: p.name, tier: p.tier ?? '', quantity: String(p.quantity), sort_order: String(p.sort_order), draw_as_batch: p.draw_as_batch,
});

function Fields({ d, set, batchLocked }: { d: Draft; set: (d: Draft) => void; batchLocked?: boolean }) {
  return (
    <>
      <input className="adm-input" placeholder="Prize name" aria-label="Prize name" value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} />
      <input className="adm-input adm-narrow" placeholder="Tier (optional)" aria-label="Tier" value={d.tier} onChange={(e) => set({ ...d, tier: e.target.value })} />
      <input className="adm-input adm-narrow" type="number" min={1} max={500} aria-label="Quantity" value={d.quantity} onChange={(e) => set({ ...d, quantity: e.target.value })} />
      <input className="adm-input adm-narrow" type="number" min={0} placeholder="Order" aria-label="Order" value={d.sort_order} onChange={(e) => set({ ...d, sort_order: e.target.value })} />
      <label className="adm-check">
        <input type="checkbox" checked={d.draw_as_batch} disabled={batchLocked} onChange={(e) => set({ ...d, draw_as_batch: e.target.checked })} />
        Draw all at once
      </label>
    </>
  );
}

export function PrizeManager() {
  const { data, loading, reload } = useLoad<{ prizes: PrizeRow[] }>('/api/admin/prizes', 10_000);
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(id: string | null, d: Draft): Promise<boolean> {
    const quantity = Number(d.quantity);
    if (!d.name.trim() || !Number.isInteger(quantity) || quantity < 1) { setMsg({ ok: false, text: describePrize('INVALID') }); return false; }
    const body = {
      ...(id ? { id } : {}),
      name: d.name.trim(),
      tier: d.tier.trim() || null,
      quantity,
      draw_as_batch: d.draw_as_batch,
      ...(d.sort_order.trim() !== '' ? { sort_order: Number(d.sort_order) } : {}),
    };
    const r = await api('/api/admin/prizes', body);
    if (r.status === 'OK') { setMsg({ ok: true, text: id ? 'Saved.' : 'Prize added.' }); reload(); return true; }
    setMsg({ ok: false, text: describePrize(r.status) });
    return false;
  }

  async function remove(id: string) {
    const r = await api(`/api/admin/prizes/${id}/delete`, {});
    setDeleting(null);
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Prize deleted.' }); reload(); }
    else setMsg({ ok: false, text: describePrize(r.status) });
  }

  const rows = data?.prizes ?? [];
  return (
    <>
      <div className="adm-card">
        <h2 className="adm-sub" style={{ marginTop: 0 }}>Add a prize</h2>
        <div className="adm-row">
          <Fields d={adding} set={setAdding} />
          <button className="btn btn--gold" onClick={async () => { if (await save(null, adding)) setAdding(EMPTY); }}>Add prize</button>
        </div>
        <p className="adm-muted">Quantity is the number of winners for this prize. &ldquo;Draw all at once&rdquo; is for voucher-style prizes: the MC draws every free slot in one tap and confirms them together or one by one.</p>
      </div>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Order</th><th>Prize</th><th>Slots</th><th>Mode</th><th>Confirmed</th><th>Waiting</th><th>Not here</th><th>Left</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const isEditing = editing?.id === p.id;
              if (isEditing && editing) {
                return (
                  <tr key={p.id}>
                    <td colSpan={8}>
                      <span className="adm-row" style={{ margin: 0 }}>
                        <Fields d={editing.draft} set={(draft) => setEditing({ id: p.id, draft })} batchLocked={p.has_draws} />
                      </span>
                    </td>
                    <td>
                      <span className="adm-row" style={{ margin: 0 }}>
                        <button className="btn btn--gold" onClick={async () => { if (await save(p.id, editing.draft)) setEditing(null); }}>Save</button>
                        <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                      </span>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={p.id}>
                  <td>{p.sort_order}</td>
                  <td><b>{p.name}</b>{p.tier ? <> <span className="adm-badge adm-badge--gold">{p.tier}</span></> : null}</td>
                  <td>{p.quantity}</td>
                  <td>{p.draw_as_batch ? 'all at once' : 'one by one'}</td>
                  <td>{p.confirmed}</td>
                  <td>{p.pending}</td>
                  <td>{p.no_shows}</td>
                  <td>{p.remaining}</td>
                  <td>
                    <span className="adm-row" style={{ margin: 0 }}>
                      <button className="btn" onClick={() => { setEditing({ id: p.id, draft: toDraft(p) }); setMsg(null); }}>Edit</button>
                      {deleting === p.id ? (
                        <>
                          <button className="btn btn--danger" onClick={() => remove(p.id)}>Confirm delete</button>
                          <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn--danger" disabled={p.has_draws} title={p.has_draws ? 'This prize has been drawn' : undefined} onClick={() => setDeleting(p.id)}>Delete</button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="adm-muted">No prizes yet. Add the first one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
