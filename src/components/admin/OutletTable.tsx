import { percent } from '@/lib/admin-draw-text';

export type OutletRow = { outlet: string; total: number; rsvp_yes: number; checked_in: number; redeemed: number };

export function OutletTable({ rows }: { rows: OutletRow[] }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead><tr><th>Outlet</th><th>Employees</th><th>RSVP yes</th><th>Checked in</th><th>Attendance</th><th>Merchandise</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.outlet}>
              <td>{o.outlet}</td>
              <td>{o.total}</td>
              <td>{o.rsvp_yes}</td>
              <td>{o.checked_in}</td>
              <td><div className="adm-bar" role="img" aria-label={`${percent(o.checked_in, o.total)} percent checked in`}><i style={{ width: `${percent(o.checked_in, o.total)}%` }} /></div></td>
              <td>{o.redeemed}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="adm-muted">No employees imported yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
