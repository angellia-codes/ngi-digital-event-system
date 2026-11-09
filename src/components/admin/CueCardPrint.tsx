'use client';
import { Fragment } from 'react';
import { groupPax, vipName, type McState, type PaxRow, type VipRow } from '@/lib/mc';
import { prizeLabel, type PrizeRow } from '@/lib/prizes';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';
import '@/styles/cue-card.css';

/**
 * Paper backup of the MC screen (spec §3.4): rundown with full scripts and prize lines, BOD/HOD in protocol order with
 * pronunciation, and invited pax. Printed from the browser (Print → Save as PDF). Live numbers are not on paper.
 */
export function CueCardPrint() {
  const rundown = useLoad<{ state: McState; prizes: PrizeRow[] }>('/api/admin/rundown');
  const vip = useLoad<{ vips: VipRow[] }>('/api/station/mc/vip');
  const pax = useLoad<{ rows: PaxRow[] }>('/api/station/mc/pax');

  if (rundown.loading || vip.loading || pax.loading) return <p className="adm-muted">Loading…</p>;
  const segments = rundown.data?.state.segments ?? [];
  const vips = vip.data?.vips ?? [];
  const { total, outlets } = groupPax(pax.data?.rows ?? []);
  const byInvited = [...outlets].sort((a, b) => b.invited - a.invited || a.outlet.localeCompare(b.outlet));

  return (
    <div className="cue">
      <div className="cue__actions">
        <button className="btn btn--gold" onClick={() => window.print()}>Print / Save as PDF</button>
        <span className="adm-muted">A4 portrait. Print again after any change to the rundown or the VIP list.</span>
      </div>

      <h1>NourishFest 2026 — MC cue card</h1>

      <h2>1. Rundown</h2>
      {segments.length === 0 && <p>No segments yet.</p>}
      {segments.map((s) => (
        <section key={s.id} className="cue__seg">
          <h3>{formatTimeWita(s.planned_start)} · {s.title} <small>({s.duration_min} min{s.pic ? ` · PIC ${s.pic}` : ''})</small></h3>
          {s.script && <p className="cue__script">{s.script}</p>}
          {s.kind === 'door_prize' && (
            <ol>
              {s.prizes.map((p) => (
                <li key={p.id}><b>{prizeLabel(p)}</b> × {p.quantity}{p.mc_script ? ` — “${p.mc_script}”` : ''}</li>
              ))}
            </ol>
          )}
        </section>
      ))}

      <h2>2. BOD &amp; HOD (protocol order)</h2>
      {(['BOD', 'HOD'] as const).map((tier) => (
        <section key={tier}>
          <h3>{tier}</h3>
          <ol>
            {vips.filter((v) => v.tier === tier).map((v) => (
              <li key={v.id}>
                <b>{vipName(v)}</b>{v.phonetic ? ` (“${v.phonetic}”)` : ''} — {[v.position, v.outlet].filter(Boolean).join(', ')}
              </li>
            ))}
          </ol>
        </section>
      ))}

      <h2>3. Invited pax by outlet</h2>
      <p>Total invited: <b>{total.invited}</b></p>
      <table className="cue__table">
        <thead><tr><th>Outlet / department</th><th>Invited</th></tr></thead>
        <tbody>
          {byInvited.map((o) => (
            <Fragment key={o.outlet}>
              <tr className="cue__outlet"><td>{o.outlet}</td><td>{o.invited}</td></tr>
              {o.departments.map((d) => (
                <tr key={`${o.outlet}/${d.department ?? '-'}`}><td className="cue__dept">{d.department ?? 'No department'}</td><td>{d.invited}</td></tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
