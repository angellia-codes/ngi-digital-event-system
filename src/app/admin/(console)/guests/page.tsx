'use client';
import { useState } from 'react';
import { GuestTable } from '@/components/admin/GuestTable';
import { ImportPanel } from '@/components/admin/ImportPanel';
import { WalkInForm } from '@/components/admin/WalkInForm';

export default function GuestsPage() {
  const [version, setVersion] = useState(0); // remounts the table after an import or a walk-in
  const refresh = () => setVersion((v) => v + 1);
  return (
    <>
      <div className="adm-row">
        <h1 className="adm-title" style={{ margin: 0 }}>Guests</h1>
        <span className="adm-spacer" />
        <a className="btn btn--gold" href="/api/admin/invitations.csv" download>Download invitations CSV</a>
      </div>
      <p className="adm-muted">The invitations file has each employee’s personal pass link and a ready WhatsApp message link. Treat it like a list of passwords: send each link only to its owner.</p>
      <h2 className="adm-sub">Import employees</h2>
      <ImportPanel onDone={refresh} />
      <h2 className="adm-sub">Add a walk-in</h2>
      <WalkInForm onAdded={refresh} />
      <h2 className="adm-sub">Employees</h2>
      <GuestTable key={version} />
    </>
  );
}
