'use client';
import { useLoad } from '@/lib/use-load';

type Dash = {
  counts: { total: number; checked_in: number; redeemed: number; rsvp_yes: number; rsvp_no: number; rsvp_pending: number; opened: number; mode: string };
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
    ['Coming (RSVP yes)', c.rsvp_yes],
    ['Not coming (RSVP no)', c.rsvp_no],
    ['No answer yet', c.rsvp_pending],
    ['Checked in', `${c.checked_in} / ${c.total}`],
    ['Merchandise handed over', `${c.redeemed} / ${c.checked_in}`],
  ];
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
