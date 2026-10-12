'use client';
import { OutletTable, type OutletRow } from '@/components/admin/OutletTable';
import { stageLinkText } from '@/lib/admin-draw-text';
import { heartbeatState } from '@/lib/draw-ui';
import type { PrizeRow } from '@/lib/prizes';
import { useLoad } from '@/lib/use-load';

type Dash = {
  counts: { total: number; checked_in: number; redeemed: number; opened: number; mode: string };
  outlets: OutletRow[];
  prizes: PrizeRow[];
  draw: { confirmed: number; pending: number; no_shows: number; admin_voids: number; eligible: number };
  stage: { phase: string; rev: number; heartbeat_age: number | null };
  recent: { at: string; actor: string; action: string }[];
};

export default function Dashboard() {
  const { data, loading, status } = useLoad<Dash>('/api/admin/dashboard', 5_000);
  if (loading) return <p className="adm-muted">Loading…</p>;
  if (!data) return <p className="adm-msg adm-msg--error">Could not load the dashboard ({status}). It retries every 5 seconds.</p>;
  const c = data.counts;
  const stats: [string, number | string][] = [
    ['Employees', c.total],
    ['Opened their invitation', `${c.opened} / ${c.total}`],
    ['Checked in', `${c.checked_in} / ${c.total}`],
    ['Merchandise handed over', `${c.redeemed} / ${c.checked_in}`],
  ];
  const d = data.draw;
  const drawStats: [string, number][] = [
    ['Prizes confirmed', d.confirmed],
    ['Waiting for the MC', d.pending],
    ['Not here', d.no_shows],
    ['Voided by admin', d.admin_voids],
    ['Still eligible to win', d.eligible],
  ];
  const link = heartbeatState(data.stage.heartbeat_age);
  return (
    <>
      <h1 className="adm-title">Dashboard <span className={`adm-badge ${c.mode === 'live' ? 'adm-badge--green' : 'adm-badge--gold'}`}>{c.mode}</span></h1>
      <div className="adm-grid">
        {stats.map(([label, n]) => (
          <div className="adm-stat" key={label}>
            <div className="adm-stat__n">{n}</div>
            <div className="adm-stat__l">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="adm-sub">Door prize</h2>
      <div className="adm-grid">
        {drawStats.map(([label, n]) => (
          <div className="adm-stat" key={label}>
            <div className="adm-stat__n">{n}</div>
            <div className="adm-stat__l">{label}</div>
          </div>
        ))}
        <div className="adm-stat">
          <div className="adm-stat__n" style={{ fontSize: 20, paddingTop: 8 }}>
            <span className={`adm-dot ${link === 'ok' ? 'adm-dot--ok' : link === 'down' ? 'adm-dot--down' : ''}`} />{data.stage.phase}
          </div>
          <div className="adm-stat__l">Stage: {stageLinkText(data.stage.heartbeat_age)}</div>
        </div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Prize</th><th>Slots</th><th>Confirmed</th><th>Waiting</th><th>Not here</th><th>Left</th></tr></thead>
          <tbody>
            {data.prizes.map((p) => (
              <tr key={p.id}>
                <td>{p.tier ? `${p.tier} · ` : ''}{p.name}</td>
                <td>{p.quantity}</td>
                <td>{p.confirmed}</td>
                <td>{p.pending}</td>
                <td>{p.no_shows}</td>
                <td>{p.remaining}</td>
              </tr>
            ))}
            {data.prizes.length === 0 && <tr><td colSpan={6} className="adm-muted">No prizes yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="adm-sub">Attendance by outlet</h2>
      <OutletTable rows={data.outlets} />

      <h2 className="adm-sub">Recent activity</h2>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Time (WITA)</th><th>Who</th><th>What</th></tr></thead>
          <tbody>
            {data.recent.map((r, i) => (
              <tr key={i}>
                <td>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(r.at))}</td>
                <td>{r.actor}</td>
                <td>{r.action.replaceAll('_', ' ')}</td>
              </tr>
            ))}
            {data.recent.length === 0 && <tr><td colSpan={3} className="adm-muted">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
