'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export function WalkInForm({ onAdded }: { onAdded: () => void }) {
  const [f, setF] = useState({ full_name: '', outlet: '', department: '', position: '' });
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function add() {
    setMsg('');
    setLink('');
    const r = await api<{ pass_url: string }>('/api/admin/guests/walk-in', {
      full_name: f.full_name, outlet: f.outlet, ...(f.department && { department: f.department }), ...(f.position && { position: f.position }),
    });
    if (r.status === 'OK' && r.data) {
      setLink(r.data.pass_url);
      setF({ full_name: '', outlet: '', department: '', position: '' });
      onAdded();
    } else {
      setMsg(r.status === 'INVALID' ? 'Name and outlet are required.' : 'Could not add. Try again.');
    }
  }

  return (
    <div className="adm-card">
      <p className="adm-muted">For someone who is not in the employee file. They get a normal pass link and can be checked in like anyone else. Walk-ins are never flagged as missing.</p>
      <div className="adm-row">
        <input className="adm-input" placeholder="Full name" value={f.full_name} onChange={set('full_name')} />
        <input className="adm-input" placeholder="Outlet" value={f.outlet} onChange={set('outlet')} />
        <input className="adm-input" placeholder="Department (optional)" value={f.department} onChange={set('department')} />
        <input className="adm-input" placeholder="Position (optional)" value={f.position} onChange={set('position')} />
        <button className="btn btn--gold" onClick={add}>Add walk-in</button>
      </div>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      {link && (
        <p className="adm-msg adm-msg--ok">
          Added. Pass link: <code>{link}</code>{' '}
          <button className="btn" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button>
        </p>
      )}
    </div>
  );
}
