'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { SIZES, type Size, type SizeChart } from '@/lib/sizes';
import { formatTimeWita } from '@/lib/time';

export type EventInfo = {
  event_date: string; doors_at: string | null; starts_at: string | null; ends_at: string | null;
  venue: string | null; maps_url: string | null; beverage_deadline?: string | null;
  merch_size_deadline?: string | null; merch_default_size?: Size | null; merch_size_chart?: SizeChart; merch_fit_note?: boolean;
};

const hm = (iso: string | null) => (iso ? formatTimeWita(iso) : '');
const witaLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** ISO → "2026-12-01T12:00" in WITA, the value a datetime-local field takes. */
const dtl = (iso: string | null | undefined) => (iso ? witaLocal.format(new Date(iso)).replace(' ', 'T') : '');
const ERR: Record<string, string> = {
  INVALID_MAPS_URL: 'That is not a Google Maps link. Paste the link from the Share button in Google Maps.',
  INVALID_TIMES: 'Programme start and end must be after the gate opens, and both deadlines before it.',
  DEFAULT_SIZE_REQUIRED: 'Pick a default T-shirt size before setting the size deadline.',
  INVALID_SIZE: 'The default size must be S, M, L, XL or XXL.',
};

export function EventDetails({ info, reload }: { info: EventInfo; reload: () => void }) {
  const [f, setF] = useState({
    event_date: info.event_date, doors_at: hm(info.doors_at) || '17:00', starts_at: hm(info.starts_at), ends_at: hm(info.ends_at),
    venue: info.venue ?? '', maps_url: info.maps_url ?? '', beverage_deadline: dtl(info.beverage_deadline),
    merch_size_deadline: dtl(info.merch_size_deadline), merch_default_size: info.merch_default_size ?? '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const r = await api('/api/admin/settings/event', {
      event_date: f.event_date, doors_at: f.doors_at || null, starts_at: f.starts_at || null, ends_at: f.ends_at || null,
      venue: f.venue.trim() || null, maps_url: f.maps_url.trim() || null, beverage_deadline: f.beverage_deadline || null,
      merch_size_deadline: f.merch_size_deadline || null, merch_default_size: f.merch_default_size || null,
    });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Saved.' }); reload(); }
    else setMsg({ ok: false, text: ERR[r.status] ?? 'Could not save. Check the fields and try again.' });
  }

  return (
    <>
      <h2 className="adm-sub">Event details</h2>
      <p className="adm-muted">Shown on the invitation. Times are WITA. Date, gate time, venue and Maps link are needed before the invitations go out; start and end are optional.</p>
      <div className="adm-card">
        <div className="adm-checks">
          <label className="adm-check">Date <input type="date" value={f.event_date} onChange={set('event_date')} /></label>
          <label className="adm-check">Gate opens <input type="time" value={f.doors_at} onChange={set('doors_at')} /></label>
          <label className="adm-check">Programme starts <input type="time" value={f.starts_at} onChange={set('starts_at')} /></label>
          <label className="adm-check">Ends <input type="time" value={f.ends_at} onChange={set('ends_at')} /></label>
          <label className="adm-check">Venue <input type="text" maxLength={120} value={f.venue} onChange={set('venue')} /></label>
          <label className="adm-check">Google Maps link <input type="url" maxLength={500} value={f.maps_url} onChange={set('maps_url')} /></label>
          <label className="adm-check">Beverage deadline <input type="datetime-local" value={f.beverage_deadline} onChange={set('beverage_deadline')} /></label>
          <label className="adm-check">T-shirt size deadline <input type="datetime-local" value={f.merch_size_deadline} onChange={set('merch_size_deadline')} /></label>
          <label className="adm-check">Default T-shirt size
            <select value={f.merch_default_size} onChange={set('merch_default_size')}>
              <option value="">None</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="adm-row">
          <button className="btn btn--gold" onClick={save}>Save details</button>
        </div>
        <p className="adm-muted">Beverage deadline (WITA): after it, anyone without a drink gets Soft Drink and the purchase count is final. Leave blank to keep choices open. Moving it later reopens the choice for automatic Soft Drink guests who have not redeemed.</p>
        <p className="adm-muted">T-shirt size deadline (WITA): separate from the beverage deadline, set it early enough for printing. After it, anyone without a size gets the default size and the order count is final. A default size is required whenever a deadline is set.</p>
        <p className="adm-muted">To preview, open any guest pass link and tap “Putar undangan”.</p>
        {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      </div>
    </>
  );
}
