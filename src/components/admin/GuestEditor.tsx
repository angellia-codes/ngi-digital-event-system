'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export type AdminGuest = {
  id: string; employee_id: string; full_name: string; outlet: string; department: string | null; position: string | null;
  phone: string | null; opened: boolean; active: boolean; flagged_missing: boolean; is_walk_in: boolean;
  checked_in_at: string | null; prize_number: number | null; merch: string;
};

export function GuestEditor({ guest, onClose, onSaved }: { guest: AdminGuest; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(guest.full_name);
  const [outlet, setOutlet] = useState(guest.outlet);
  const [phone, setPhone] = useState(guest.phone ?? '');
  const [active, setActive] = useState(guest.active);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const changes: Record<string, unknown> = {};
    if (name !== guest.full_name) changes.full_name = name;
    if (outlet !== guest.outlet) changes.outlet = outlet;
    if (phone !== (guest.phone ?? '')) changes.phone = phone.trim() === '' ? null : phone;
    if (active !== guest.active) changes.active = active;
    if (Object.keys(changes).length === 0) return onClose();
    setBusy(true);
    const r = await api('/api/admin/guests', { guest_id: guest.id, changes });
    setBusy(false);
    if (r.status === 'OK') { onSaved(); onClose(); }
    else setMsg(r.status === 'INVALID_PHONE' ? 'That phone number is not valid.' : 'Could not save. Try again.');
  }

  return (
    <div className="adm-card">
      <h3 className="adm-sub" style={{ marginTop: 0 }}>Edit {guest.employee_id}</h3>
      <label className="adm-field"><span>Full name</span><input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="adm-field"><span>Outlet</span><input className="adm-input" value={outlet} onChange={(e) => setOutlet(e.target.value)} /></label>
      <label className="adm-field"><span>Phone (WhatsApp)</span><input className="adm-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <label className="adm-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (inactive employees are not eligible at the desks)</label>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      <div className="adm-row">
        <button className="btn btn--gold" onClick={save} disabled={busy}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
