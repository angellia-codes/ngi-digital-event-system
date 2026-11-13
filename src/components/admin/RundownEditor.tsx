'use client';
import { useState } from 'react';
import { describeRundown, parseTime } from '@/lib/admin-mc-text';
import { api } from '@/lib/client';
import { segmentStatus, type McState, type Segment } from '@/lib/mc';
import { prizeLabel, type PrizeRow } from '@/lib/prizes';
import { SCREENS, screenLabel, type ScreenKey } from '@/lib/screens';
import { STRINGS } from '@/lib/i18n/strings';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';

type Draft = {
  title: string; planned_time: string; duration_min: string; sort_order: string; pic: string; script: string;
  kind: 'normal' | 'door_prize'; prize_ids: string[];
};
const EMPTY: Draft = { title: '', planned_time: '', duration_min: '10', sort_order: '', pic: '', script: '', kind: 'normal', prize_ids: [] };
const toDraft = (s: Segment): Draft => ({
  title: s.title, planned_time: formatTimeWita(s.planned_start), duration_min: String(s.duration_min), sort_order: String(s.sort_order),
  pic: s.pic ?? '', script: s.script ?? '', kind: s.kind, prize_ids: s.prizes.map((p) => p.id),
});

function Fields({ d, set, prizes, takenBy }: {
  d: Draft; set: (d: Draft) => void; prizes: PrizeRow[]; takenBy: Map<string, string>;
}) {
  const toggle = (id: string) =>
    set({ ...d, prize_ids: d.prize_ids.includes(id) ? d.prize_ids.filter((x) => x !== id) : [...d.prize_ids, id] });
  return (
    <div className="adm-card">
      <div className="adm-row">
        <input className="adm-input adm-narrow" placeholder="17:00" aria-label="Start time (WITA)" value={d.planned_time}
          onChange={(e) => set({ ...d, planned_time: e.target.value })} />
        <input className="adm-input" placeholder="Segment title" aria-label="Title" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} />
        <input className="adm-input adm-narrow" type="number" min={1} max={600} aria-label="Duration (minutes)" value={d.duration_min}
          onChange={(e) => set({ ...d, duration_min: e.target.value })} />
        <input className="adm-input adm-narrow" type="number" min={0} placeholder="Order" aria-label="Order" value={d.sort_order}
          onChange={(e) => set({ ...d, sort_order: e.target.value })} />
        <input className="adm-input" placeholder="PIC (optional)" aria-label="PIC" value={d.pic} onChange={(e) => set({ ...d, pic: e.target.value })} />
        <select className="adm-select" aria-label="Kind" value={d.kind} onChange={(e) => set({ ...d, kind: e.target.value as Draft['kind'] })}>
          <option value="normal">Normal</option>
          <option value="door_prize">Door prize</option>
        </select>
      </div>
      <label className="adm-field">
        <span>MC script (shown on the MC screen, free text)</span>
        <textarea className="adm-input" rows={4} value={d.script} onChange={(e) => set({ ...d, script: e.target.value })} />
      </label>
      {d.kind === 'door_prize' && (
        <div className="adm-field">
          <span>Prizes drawn in this segment</span>
          <span className="adm-row" style={{ margin: 0 }}>
            {prizes.map((p) => {
              const other = takenBy.get(p.id);
              return (
                <label key={p.id} className="adm-check" title={other ? `In “${other}”` : undefined}>
                  <input type="checkbox" checked={d.prize_ids.includes(p.id)} disabled={!!other} onChange={() => toggle(p.id)} />
                  {prizeLabel(p)}{other ? ` (in ${other})` : ''}
                </label>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

export function RundownEditor() {
  const { data, loading, reload } = useLoad<{ state: McState; prizes: PrizeRow[] }>('/api/admin/rundown', 5_000);
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; reason: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const state = data?.state;
  const segments = state?.segments ?? [];
  const prizes = data?.prizes ?? [];

  /** prize id → title of the segment that holds it, leaving out the segment being edited. */
  const takenBy = (exceptId: string | null) =>
    new Map(segments.filter((s) => s.id !== exceptId).flatMap((s) => s.prizes.map((p) => [p.id, s.title] as const)));

  async function save(id: string | null, d: Draft): Promise<boolean> {
    const time = parseTime(d.planned_time);
    const duration = Number(d.duration_min);
    if (!d.title.trim() || !time || !Number.isInteger(duration) || duration < 1) { setMsg({ ok: false, text: describeRundown('INVALID') }); return false; }
    const body = {
      ...(id ? { id } : {}),
      title: d.title.trim(), planned_time: time, duration_min: duration, pic: d.pic.trim() || null, script: d.script.trim() || null,
      kind: d.kind, prize_ids: d.kind === 'door_prize' ? d.prize_ids : [],
      ...(d.sort_order.trim() !== '' ? { sort_order: Number(d.sort_order) } : {}),
    };
    const r = await api<{ prize?: string }>('/api/admin/rundown', body);
    if (r.status === 'OK') { setMsg({ ok: true, text: id ? 'Saved.' : 'Segment added.' }); reload(); return true; }
    setMsg({ ok: false, text: describeRundown(r.status, r.data?.prize) });
    return false;
  }

  async function remove(id: string) {
    const r = await api(`/api/admin/rundown/${id}/delete`, {});
    setDeleting(null);
    setMsg(r.status === 'OK' ? { ok: true, text: 'Segment deleted.' } : { ok: false, text: describeRundown(r.status) });
    reload();
  }

  async function setScreen(id: string, screen: ScreenKey | null) {
    const r = await api(`/api/admin/rundown/${id}/screen`, { screen });
    setMsg(r.status === 'OK' ? { ok: true, text: 'Suggested screen saved.' } : { ok: false, text: describeRundown(r.status) });
    reload();
  }

  async function setCurrent() {
    if (!jump) return;
    const r = await api('/api/admin/rundown/set-current', { segment_id: jump.id, reason: jump.reason });
    setMsg(r.status === 'OK' ? { ok: true, text: 'Current segment changed. MC screens follow within 2 seconds.' } : { ok: false, text: describeRundown(r.status) });
    if (r.status === 'OK') setJump(null);
    reload();
  }

  const phase = state?.phase === 'running' ? 'Show running' : state?.phase === 'ended' ? 'Show ended' : 'Not started';

  return (
    <>
      <p className="adm-muted">Status: <b>{phase}</b>. Finished segments are read-only. Times are WITA on the event date.</p>
      <h2 className="adm-sub">Add a segment</h2>
      <Fields d={adding} set={setAdding} prizes={prizes} takenBy={takenBy(null)} />
      <div className="adm-row">
        <button className="btn btn--gold" onClick={async () => { if (await save(null, adding)) setAdding(EMPTY); }}>Add segment</button>
      </div>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Order</th><th>Time</th><th>Segment</th><th>Min</th><th>PIC</th><th>Prizes</th><th>Screen</th><th>Status</th><th /></tr></thead>
          <tbody>
            {segments.map((s) => {
              const status = segmentStatus(s, state?.current_segment_id ?? null);
              if (editing?.id === s.id) {
                return (
                  <tr key={s.id}>
                    <td colSpan={9}>
                      <Fields d={editing.draft} set={(draft) => setEditing({ id: s.id, draft })} prizes={prizes} takenBy={takenBy(s.id)} />
                      <span className="adm-row">
                        <button className="btn btn--gold" onClick={async () => { if (await save(s.id, editing.draft)) setEditing(null); }}>Save</button>
                        <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                      </span>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={s.id}>
                  <td>{s.sort_order}</td>
                  <td>{formatTimeWita(s.planned_start)}</td>
                  <td><b>{s.title}</b>{s.kind === 'door_prize' && <> <span className="adm-badge adm-badge--gold">door prize</span></>}</td>
                  <td>{s.duration_min}</td>
                  <td>{s.pic ?? ''}</td>
                  <td>{s.prizes.map((p) => p.name).join(', ')}</td>
                  <td>
                    <select className="adm-select" aria-label={`Suggested screen for ${s.title}`} value={s.suggested_screen ?? ''}
                      onChange={(e) => setScreen(s.id, (e.target.value || null) as ScreenKey | null)}>
                      <option value="">—</option>
                      {SCREENS.map((x) => <option key={x.key} value={x.key}>{STRINGS.en[screenLabel(x.key)]}</option>)}
                    </select>
                  </td>
                  <td>
                    {status === 'current' ? <span className="adm-badge adm-badge--green">current</span>
                      : status === 'done' && s.started_at && s.ended_at ? `${formatTimeWita(s.started_at)}–${formatTimeWita(s.ended_at)}` : ''}
                  </td>
                  <td>
                    <span className="adm-row" style={{ margin: 0 }}>
                      <button className="btn" disabled={status === 'done'} onClick={() => { setEditing({ id: s.id, draft: toDraft(s) }); setMsg(null); }}>Edit</button>
                      {status !== 'current' && <button className="btn" onClick={() => setJump({ id: s.id, reason: '' })}>Make current</button>}
                      {deleting === s.id ? (
                        <>
                          <button className="btn btn--danger" onClick={() => remove(s.id)}>Confirm delete</button>
                          <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn--danger" disabled={!!s.started_at} title={s.started_at ? 'This segment has run' : undefined}
                          onClick={() => setDeleting(s.id)}>Delete</button>
                      )}
                    </span>
                    {jump?.id === s.id && (
                      <span className="adm-row">
                        <input className="adm-input" placeholder="Reason (required)" value={jump.reason} onChange={(e) => setJump({ id: s.id, reason: e.target.value })} />
                        <button className="btn btn--gold" onClick={setCurrent}>Set current</button>
                        <button className="btn" onClick={() => setJump(null)}>Cancel</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && segments.length === 0 && <tr><td colSpan={9} className="adm-muted">No segments yet. Add the first one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
