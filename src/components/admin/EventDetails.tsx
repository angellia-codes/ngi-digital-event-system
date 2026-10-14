'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { formatTimeWita } from '@/lib/time';

export type EventInfo = {
  event_date: string; doors_at: string | null; starts_at: string | null; ends_at: string | null;
  venue: string | null; maps_url: string | null;
};

const hm = (iso: string | null) => (iso ? formatTimeWita(iso) : '');
const ERR: Record<string, string> = {
  INVALID_MAPS_URL: 'That is not a Google Maps link. Paste the link from the Share button in Google Maps.',
  INVALID_TIMES: 'Programme start and end must be after the gate opens.',
};

export function EventDetails({ info, reload }: { info: EventInfo; reload: () => void }) {
  const [f, setF] = useState({
    event_date: info.event_date, doors_at: hm(info.doors_at) || '17:00', starts_at: hm(info.starts_at), ends_at: hm(info.ends_at),
    venue: info.venue ?? '', maps_url: info.maps_url ?? '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const r = await api('/api/admin/settings/event', {
      event_date: f.event_date, doors_at: f.doors_at || null, starts_at: f.starts_at || null, ends_at: f.ends_at || null,
      venue: f.venue.trim() || null, maps_url: f.maps_url.trim() || null,
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
        </div>
        <div className="adm-row">
          <button className="btn btn--gold" onClick={save}>Save details</button>
        </div>
        <p className="adm-muted">To preview, open any guest pass link and tap “Putar undangan”.</p>
        {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      </div>
    </>
  );
}
