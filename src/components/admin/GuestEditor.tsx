'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { SIZES, type Size } from '@/lib/sizes';

export type AdminGuest = {
  id: string; employee_id: string; full_name: string; outlet: string; department: string | null; position: string | null;
  phone: string | null; opened: boolean; active: boolean; flagged_missing: boolean; is_walk_in: boolean;
  checked_in_at: string | null; prize_number: number | null; merch: string;
  beverage?: 'beer' | 'soft_drink' | null; beverage_source?: string | null; beverage_redeemed?: boolean;
  merch_size?: Size | null; merch_size_source?: string | null; merch_given_size?: Size | null;
};

const DRINK = { beer: 'Beer', soft_drink: 'Soft Drink' } as const;
const BEV_ERR: Record<string, string> = {
  REASON_REQUIRED: 'Give a reason of at least 5 characters.',
  ALREADY_REDEEMED: 'This drink was already handed over. Void it on the Beverages page first.',
};

/** Wrong tap: admin sets or changes the drink, with a reason. Blocked while a redemption is active. */
function DrinkControl({ guest, onSaved }: { guest: AdminGuest; onSaved: () => void }) {
  const [choice, setChoice] = useState<'beer' | 'soft_drink'>(guest.beverage ?? 'soft_drink');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = guest.beverage ? `${DRINK[guest.beverage]} (${guest.beverage_source})` : 'not chosen';

  async function save() {
    const r = await api(`/api/admin/guests/${guest.id}/beverage`, { choice, reason });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Drink saved.' }); setReason(''); onSaved(); }
    else setMsg({ ok: false, text: BEV_ERR[r.status] ?? 'Could not save. Try again.' });
  }

  return (
    <div className="adm-field">
      <span>Drink: {current}{guest.beverage_redeemed ? ' · handed over' : ''}</span>
      <span className="adm-row" style={{ margin: 0 }}>
        <select className="adm-select" value={choice} onChange={(e) => setChoice(e.target.value as 'beer' | 'soft_drink')} aria-label="Drink">
          <option value="beer">Beer</option>
          <option value="soft_drink">Soft Drink</option>
        </select>
        <input className="adm-input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn" onClick={save} disabled={!!guest.beverage_redeemed}>Set drink</button>
      </span>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
    </div>
  );
}

const SIZE_ERR: Record<string, string> = {
  REASON_REQUIRED: 'Give a reason of at least 5 characters.',
  ALREADY_REDEEMED: 'This T-shirt was already handed over. Void it on the Merchandise page first.',
};

/** Wrong size picked: admin sets or changes the T-shirt size, with a reason. Blocked while a redemption is active. */
function SizeControl({ guest, onSaved }: { guest: AdminGuest; onSaved: () => void }) {
  const [size, setSize] = useState<Size>(guest.merch_size ?? 'M');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = guest.merch_size ? `${guest.merch_size} (${guest.merch_size_source})` : 'not chosen';
  const handed = guest.merch_given_size ? ` · handed over ${guest.merch_given_size}` : '';

  async function save() {
    const r = await api(`/api/admin/guests/${guest.id}/merch-size`, { size, reason });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Size saved.' }); setReason(''); onSaved(); }
    else setMsg({ ok: false, text: SIZE_ERR[r.status] ?? 'Could not save. Try again.' });
  }

  return (
    <div className="adm-field">
      <span>T-shirt size: {current}{handed}</span>
      <span className="adm-row" style={{ margin: 0 }}>
        <select className="adm-select" value={size} onChange={(e) => setSize(e.target.value as Size)} aria-label="T-shirt size">
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="adm-input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn" onClick={save} disabled={!!guest.merch_given_size}>Set size</button>
      </span>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
    </div>
  );
}

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
      <DrinkControl guest={guest} onSaved={onSaved} />
      <SizeControl guest={guest} onSaved={onSaved} />
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      <div className="adm-row">
        <button className="btn btn--gold" onClick={save} disabled={busy}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
