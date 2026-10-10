'use client';
import { useState } from 'react';
import { stageLinkText } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';
import { heartbeatState } from '@/lib/draw-ui';
import type { StageOptions } from '@/lib/stage';
import { useLoad } from '@/lib/use-load';

type StageInfo = { stage: { rev: number; phase: string; options: StageOptions }; heartbeat_age: number | null; key_set: boolean };

export function StagePanel() {
  const { data, reload } = useLoad<StageInfo>('/api/admin/stage', 3_000);
  const [fresh, setFresh] = useState<{ key: string; url: string } | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [msg, setMsg] = useState('');

  async function makeKey() {
    const r = await api<{ key: string; url: string }>('/api/admin/settings/stage-key', {});
    setConfirmNew(false);
    if (r.ok && r.data) { setFresh(r.data); setMsg(''); reload(); }
    else setMsg('Could not create a key. Try again.');
  }
  async function setOption(change: Partial<StageOptions>) {
    const r = await api('/api/admin/settings/stage-options', change);
    if (r.status === 'OK') { setMsg(''); reload(); } else setMsg('Could not change that option. Try again.');
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setMsg('Copied.'); } catch { setMsg('Copy failed: select the text and copy it by hand.'); }
  }

  const o = data?.stage.options;
  const link = heartbeatState(data?.heartbeat_age);
  return (
    <>
      <h2 className="adm-sub">Stage display</h2>
      <p className="adm-muted">The projector opens a private link with a display key. Anyone with the link can watch the stage, but cannot change anything. Making a new key signs out every open display.</p>
      <div className="adm-card">
        <p>
          <span className={`adm-dot ${link === 'ok' ? 'adm-dot--ok' : link === 'down' ? 'adm-dot--down' : ''}`} />
          {data ? stageLinkText(data.heartbeat_age) : 'Loading…'}
          {data ? <span className="adm-muted"> · showing {data.stage.phase}</span> : null}
        </p>
        <p className="adm-muted">{data?.key_set ? 'A display key is set.' : 'No display key yet. Create one before the rehearsal.'}</p>
        {fresh && (
          <div className="adm-msg adm-msg--ok">
            This link is shown only once. Open it on the projector laptop, or copy it somewhere safe.
            <code className="adm-key">{fresh.url}</code>
            <button className="btn" onClick={() => copy(fresh.url)}>Copy link</button>
          </div>
        )}
        <div className="adm-row">
          {confirmNew ? (
            <>
              <span>Every open display will be signed out.</span>
              <button className="btn btn--danger" onClick={makeKey}>Yes, make a new key</button>
              <button className="btn" onClick={() => setConfirmNew(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn--gold" onClick={() => (data?.key_set ? setConfirmNew(true) : makeKey())}>{data?.key_set ? 'Make a new key' : 'Create display key'}</button>
          )}
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-checks">
          <label className="adm-check">
            <input type="checkbox" checked={!!o?.safe_mode} disabled={!o} onChange={(e) => setOption({ safe_mode: e.target.checked })} />
            Projector-safe look (flat black, no glows or halftone, white names, no sound)
          </label>
          <label className="adm-check">
            <input type="checkbox" checked={!!o?.reduce_effects} disabled={!o} onChange={(e) => setOption({ reduce_effects: e.target.checked })} />
            Reduced effects (no number roll, no flashing; fades only)
          </label>
          <label className="adm-check">
            Language on the stage
            <select className="adm-select" value={o?.language ?? 'en'} disabled={!o} onChange={(e) => setOption({ language: e.target.value === 'id' ? 'id' : 'en' })}>
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <p className="adm-muted">Changes reach the projector within a second or two. These options survive the rehearsal reset.</p>
      </div>
      {msg && <p className="adm-msg adm-msg--ok">{msg}</p>}
    </>
  );
}
