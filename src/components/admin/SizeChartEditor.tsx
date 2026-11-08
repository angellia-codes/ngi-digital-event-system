'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { MEASURES, SIZES, hasChart, type FullChart, type Measure, type Size, type SizeChart } from '@/lib/sizes';

const LABEL: Record<Measure, string> = { chest: 'Chest (flat)', bottom: 'Bottom (flat)', length: 'Length', sleeve: 'Sleeve' };
type Grid = Record<Size, Record<Measure, string>>;
const toGrid = (c: SizeChart | undefined): Grid =>
  Object.fromEntries(SIZES.map((s) => [s, Object.fromEntries(MEASURES.map((m) => [m, hasChart(c) ? String(c[s][m]) : '']))])) as Grid;

/** Size guide shown to guests (merch size spec §2, §5.2). All 20 values in cm, or clear it to hide the guide. */
export function SizeChartEditor({ chart, fitNote, reload }: { chart?: SizeChart; fitNote?: boolean; reload: () => void }) {
  const [grid, setGrid] = useState<Grid>(() => toGrid(chart));
  const [fit, setFit] = useState(fitNote ?? true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(merch_size_chart: FullChart | Record<string, never>) {
    const r = await api('/api/admin/settings/event', { merch_size_chart, merch_fit_note: fit });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Saved.' }); reload(); }
    else setMsg({ ok: false, text: 'Could not save. Every cell needs a whole number above 0, or clear the whole chart.' });
  }

  function save() {
    const out = {} as FullChart;
    for (const s of SIZES) {
      out[s] = {} as Record<Measure, number>;
      for (const m of MEASURES) {
        const n = Number(grid[s][m]);
        if (grid[s][m].trim() === '' || !Number.isInteger(n) || n <= 0) {
          setMsg({ ok: false, text: `${s} ${LABEL[m]}: enter a whole number above 0.` });
          return;
        }
        out[s][m] = n;
      }
    }
    void send(out);
  }

  function clear() {
    setGrid(toGrid({}));
    void send({});
  }

  const setCell = (s: Size, m: Measure, v: string) => setGrid({ ...grid, [s]: { ...grid[s], [m]: v } });
  return (
    <>
      <h2 className="adm-sub">T-shirt size guide</h2>
      <p className="adm-muted">Vendor chart in cm, measured flat. Guests see it under “Panduan ukuran” and in the confirm step. Clear it to hide the guide.</p>
      <div className="adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Size</th>{MEASURES.map((m) => <th key={m}>{LABEL[m]}</th>)}</tr></thead>
            <tbody>
              {SIZES.map((s) => (
                <tr key={s}>
                  <th scope="row">{s}</th>
                  {MEASURES.map((m) => (
                    <td key={m}>
                      <input className="adm-input" style={{ width: 72 }} type="number" min={1} inputMode="numeric"
                        aria-label={`${s} ${LABEL[m]}`} value={grid[s][m]} onChange={(e) => setCell(s, m, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="adm-row"><input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /> Show “Oversized fit — pick your usual size”</label>
        <div className="adm-row">
          <button className="btn btn--gold" onClick={save}>Save size guide</button>
          <button className="btn" onClick={clear}>Clear chart</button>
        </div>
        {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      </div>
    </>
  );
}
