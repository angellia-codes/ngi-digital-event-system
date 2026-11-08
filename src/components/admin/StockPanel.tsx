'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { SIZES, type Size, type SizeSummary } from '@/lib/sizes';
import { useLoad } from '@/lib/use-load';

/** Received stock per size and what is left (merch size spec §5.4). Amber where more guests still need a size than are left. */
export function StockPanel() {
  const { data, loading, reload } = useLoad<SizeSummary>('/api/admin/merch-stock', 15_000);
  const [draft, setDraft] = useState<Record<Size, string> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (loading) return <p className="adm-muted">Loading…</p>;
  if (!data) return <p className="adm-msg adm-msg--error">Could not load stock.</p>;

  const rows = data.sizes;
  const values = draft ?? (Object.fromEntries(rows.map((r) => [r.size, String(r.received)])) as Record<Size, string>);

  async function save() {
    const stock = {} as Record<Size, number>;
    for (const s of SIZES) {
      const n = Number(values[s]);
      if (values[s].trim() === '' || !Number.isInteger(n) || n < 0) {
        setMsg({ ok: false, text: `${s}: enter a whole number, 0 or more.` });
        return;
      }
      stock[s] = n;
    }
    const r = await api('/api/admin/merch-stock', { stock });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Stock saved.' }); setDraft(null); reload(); }
    else setMsg({ ok: false, text: 'Could not save. Try again.' });
  }

  return (
    <>
      <h2 className="adm-sub">Stock</h2>
      <p className="adm-muted">Enter what the vendor delivered per size; after a second delivery, enter the new total. Left = received − handed over. Amber: more guests still to claim that size than shirts left.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th />{rows.map((r) => <th key={r.size}>{r.size}</th>)}</tr></thead>
          <tbody>
            <tr>
              <th scope="row">Received</th>
              {rows.map((r) => (
                <td key={r.size}>
                  <input className="adm-input" style={{ width: 72 }} type="number" min={0} inputMode="numeric" aria-label={`Received ${r.size}`}
                    value={values[r.size]} onChange={(e) => setDraft({ ...values, [r.size]: e.target.value })} />
                </td>
              ))}
            </tr>
            <tr><th scope="row">Handed over</th>{rows.map((r) => <td key={r.size}>{r.given}</td>)}</tr>
            <tr><th scope="row">Left</th>{rows.map((r) => <td key={r.size}>{r.left}</td>)}</tr>
            <tr>
              <th scope="row">Still to claim</th>
              {rows.map((r) => <td key={r.size} className={data.stock_set && r.to_claim > r.left ? 'is-warn' : undefined}>{r.to_claim}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="adm-row"><button className="btn btn--gold" onClick={save}>Save stock</button></div>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
    </>
  );
}
