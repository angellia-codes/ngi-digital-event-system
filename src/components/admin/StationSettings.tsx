'use client';
import { useState } from 'react';
import { randomPin, ROLE_NAME } from '@/lib/admin-text';
import { api } from '@/lib/client';
import type { Role } from '@/lib/session';

export type PinRow = { role: Role; is_set: boolean; active: boolean; updated_at: string | null };

function PinLine({ row, reload }: { row: PinRow; reload: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');

  async function save() {
    const r = await api('/api/admin/settings/pin', { role: row.role, pin });
    if (r.status === 'OK') { setMsg(`PIN set to ${pin}. Write it down now; it cannot be shown again. Devices on this role were signed out.`); setPin(''); reload(); }
    else setMsg(r.status === 'INVALID_PIN' ? 'The PIN must be exactly 6 digits.' : r.status === 'PIN_IN_USE' ? 'Another role already uses that PIN.' : 'Could not save. Try again.');
  }
  async function toggle() {
    const r = await api('/api/admin/settings/pin-active', { role: row.role, active: !row.active });
    if (r.status === 'OK') reload();
    else setMsg('Could not change. Set a PIN first.');
  }

  return (
    <tr>
      <td>{ROLE_NAME[row.role]}</td>
      <td>{!row.is_set ? <span className="adm-badge adm-badge--pink">not set</span> : row.active ? <span className="adm-badge adm-badge--green">active</span> : <span className="adm-badge">off</span>}</td>
      <td>
        <span className="adm-row" style={{ margin: 0 }}>
          <input className="adm-input" inputMode="numeric" maxLength={6} placeholder="6 digits" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} style={{ width: 110 }} aria-label={`New PIN for ${ROLE_NAME[row.role]}`} />
          <button className="btn" onClick={() => setPin(randomPin())}>Generate</button>
          <button className="btn btn--gold" onClick={save} disabled={pin.length !== 6}>Set PIN</button>
          {row.is_set && <button className="btn" onClick={toggle}>{row.active ? 'Turn off' : 'Turn on'}</button>}
        </span>
        {msg && <div className="adm-msg adm-msg--ok">{msg}</div>}
      </td>
    </tr>
  );
}

export function StationSettings({ pins, labels, reload }: { pins: PinRow[]; labels: string[]; reload: () => void }) {
  const [text, setText] = useState(labels.join('\n'));
  const [msg, setMsg] = useState('');

  async function saveLabels() {
    const list = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const r = await api('/api/admin/settings/station-labels', { labels: list });
    if (r.status === 'OK') { setMsg('Saved.'); reload(); }
    else setMsg('Use 1 to 20 different names, up to 30 characters each.');
  }

  return (
    <>
      <h2 className="adm-sub">Station PINs</h2>
      <p className="adm-muted">One PIN per role, shared by the people on that desk. Changing or turning off a PIN signs out every device using it.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Role</th><th>Status</th><th>New PIN</th></tr></thead>
          <tbody>{pins.map((p) => <PinLine key={p.role} row={p} reload={reload} />)}</tbody>
        </table>
      </div>
      <h2 className="adm-sub">Station names</h2>
      <p className="adm-muted">One per line. Staff pick one after entering the PIN; it is recorded on every scan.</p>
      <textarea className="adm-textarea" value={text} onChange={(e) => setText(e.target.value)} aria-label="Station names" />
      <div className="adm-row"><button className="btn btn--gold" onClick={saveLabels}>Save names</button>{msg && <span>{msg}</span>}</div>
    </>
  );
}
