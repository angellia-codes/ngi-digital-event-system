'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export function RehearsalPanel({ mode, reload }: { mode: string; reload: () => void }) {
  const [resetText, setResetText] = useState('');
  const [liveText, setLiveText] = useState('');
  const [msg, setMsg] = useState('');

  async function run(path: string, confirm: string, okMsg: string) {
    const r = await api(path, { confirm });
    setMsg(r.status === 'OK' ? okMsg : r.status === 'NOT_REHEARSAL' ? 'The event is already live. This is locked.' : 'Could not do that. Try again.');
    setResetText('');
    setLiveText('');
    reload();
  }

  if (mode === 'live') {
    return (
      <>
        <h2 className="adm-sub">Event mode</h2>
        <p className="adm-msg adm-msg--ok">The event is LIVE. Rehearsal reset is locked and the audit log can no longer be deleted.</p>
      </>
    );
  }
  return (
    <>
      <h2 className="adm-sub">Event mode</h2>
      <p className="adm-muted">Now in <strong>rehearsal</strong>: test scans are allowed and can be wiped. Do the reset after the final rehearsal, then go live before doors open.</p>
      <div className="adm-card">
        <p>Reset rehearsal data: removes all check-ins, merchandise records, prize numbers and logs. Employees and PINs stay.</p>
        <div className="adm-row">
          <input className="adm-input" placeholder="Type RESET" value={resetText} onChange={(e) => setResetText(e.target.value)} aria-label="Type RESET to confirm" />
          <button className="btn btn--danger" disabled={resetText !== 'RESET'} onClick={() => run('/api/admin/reset', 'RESET', 'Rehearsal data cleared.')}>Reset rehearsal data</button>
        </div>
      </div>
      <div className="adm-card">
        <p>Go live: one-way. After this, resets are impossible and the audit log is permanent.</p>
        <div className="adm-row">
          <input className="adm-input" placeholder="Type GO LIVE" value={liveText} onChange={(e) => setLiveText(e.target.value)} aria-label="Type GO LIVE to confirm" />
          <button className="btn btn--gold" disabled={liveText !== 'GO LIVE'} onClick={() => run('/api/admin/go-live', 'GO LIVE', 'The event is live.')}>Go live</button>
        </div>
      </div>
      {msg && <p className="adm-msg adm-msg--ok">{msg}</p>}
    </>
  );
}
