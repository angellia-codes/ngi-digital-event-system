const REPORTS: { href: string; title: string; text: string }[] = [
  { href: '/api/admin/reports/guests', title: 'Guests', text: 'Every employee: outlet, RSVP, check-in time, Door Prize number, merchandise.' },
  { href: '/api/admin/reports/check-ins', title: 'Check-ins', text: 'One row per check-in with time, method and desk.' },
  { href: '/api/admin/reports/merchandise', title: 'Merchandise', text: 'Every hand-over and void, with booth and staff.' },
  { href: '/api/admin/reports/draws', title: 'Draw history', text: 'Every draw: prize, slot, winner, outcome, who resolved it, void reasons.' },
  { href: '/api/admin/reports/audit', title: 'Audit log', text: 'Every recorded action, oldest first.' },
  { href: '/api/admin/reports/rsvp-pending', title: 'RSVP not answered', text: 'Employees who have not answered, with phone numbers, for a reminder.' },
  { href: '/api/admin/invitations.csv', title: 'Invitation links', text: 'Personal pass link per employee, for the WhatsApp broadcast.' },
];

export function ReportsPanel() {
  return (
    <div className="adm-links">
      {REPORTS.map((r) => (
        <a key={r.href} className="adm-link" href={r.href} download>
          <b>{r.title}</b>
          <span>{r.text}</span>
        </a>
      ))}
    </div>
  );
}
