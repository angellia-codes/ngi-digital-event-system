'use client';
import { useState } from 'react';
import { describeScreen, formatDuration, formatMb } from '@/lib/admin-screen-text';
import { api } from '@/lib/client';
import { STRINGS } from '@/lib/i18n/strings';
import { checkVideo, describeVideoProblems, HEAD_BYTES, type VideoMeta } from '@/lib/mp4-check';
import { SCREENS, screenDef, screenLabel, type ScreenKey } from '@/lib/screens';
import { useLoad } from '@/lib/use-load';

type Row = {
  key: ScreenKey; kind: string; video_path: string | null; video_version: number; video_bytes: number | null; duration_s: number | null;
  end_action: 'hold' | 'goto'; end_target: ScreenKey | null; card_text: { id: [string, string]; en: [string, string] } | null;
  preview_url: string | null; download_url: string | null;
};
type Msg = { ok: boolean; text: string } | null;

const label = (k: ScreenKey) => STRINGS.en[screenLabel(k)];

/** Width, height and length as the browser reads them from the file itself. */
function readMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (m: Partial<VideoMeta>) => { URL.revokeObjectURL(url); resolve({ bytes: file.size, width: 0, height: 0, duration: NaN, ...m }); };
    v.preload = 'metadata';
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => done({});
    v.src = url;
  });
}

/** PUT to the signed upload URL with progress (same form body as supabase-js uploadToSignedUrl). */
function putFile(url: string, file: File, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file);
    xhr.send(body);
  });
}

function Upload({ row, onDone }: { row: Row; onDone: (m: Msg) => void }) {
  const [pct, setPct] = useState<number | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    const meta = await readMeta(file);
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
    const problems = checkVideo(head, meta);
    if (problems.length) return onDone({ ok: false, text: `${label(row.key)}: ${describeVideoProblems(problems, meta)}` });
    const sign = await api<{ path: string; url: string }>('/api/admin/screens/upload-url', { key: row.key });
    if (!sign.ok || !sign.data) return onDone({ ok: false, text: 'Could not start the upload. Try again.' });
    setPct(0);
    const uploaded = await putFile(sign.data.url, file, setPct);
    setPct(null);
    if (!uploaded) return onDone({ ok: false, text: `${label(row.key)}: upload failed. Check the connection and try again.` });
    const r = await api('/api/admin/screens', { key: row.key, path: sign.data.path, bytes: file.size, duration_s: meta.duration });
    onDone(r.status === 'OK'
      ? { ok: true, text: `${label(row.key)}: uploaded. The stage laptop downloads it within a minute.` }
      : { ok: false, text: describeScreen(r.status) });
  }
  if (pct !== null) return <span className="adm-badge adm-badge--gold">Uploading {pct}%</span>;
  return (
    <label className="btn">
      {row.video_path ? 'Replace…' : 'Upload…'}
      <input type="file" accept="video/mp4" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

function EndAction({ row, onDone }: { row: Row; onDone: (m: Msg) => void }) {
  if (row.key === 'doorprize_intro') return <span className="adm-muted">Holds; the MC’s prize pick switches to the draw.</span>;
  const value = row.end_action === 'goto' && row.end_target ? row.end_target : 'hold';
  async function save(v: string) {
    const body = v === 'hold' ? { key: row.key, end_action: 'hold' } : { key: row.key, end_action: 'goto', end_target: v };
    const r = await api('/api/admin/screens', body);
    onDone(r.status === 'OK' ? { ok: true, text: `${label(row.key)}: end action saved.` } : { ok: false, text: describeScreen(r.status) });
  }
  return (
    <select className="adm-select" aria-label={`${label(row.key)} at the end`} value={value} onChange={(e) => save(e.target.value)}>
      <option value="hold">Hold the last frame</option>
      {SCREENS.filter((s) => s.key !== row.key && s.key !== 'draw').map((s) => (
        <option key={s.key} value={s.key}>Go to: {label(s.key)}</option>
      ))}
    </select>
  );
}

function ClosingText({ row, onDone }: { row: Row; onDone: (m: Msg) => void }) {
  const [t, setT] = useState(() => row.card_text ?? {
    id: [STRINGS.id['stage.closing_1'], STRINGS.id['stage.closing_2']] as [string, string],
    en: [STRINGS.en['stage.closing_1'], STRINGS.en['stage.closing_2']] as [string, string],
  });
  const set = (lang: 'id' | 'en', i: 0 | 1, v: string) => setT((x) => {
    const next: [string, string] = [...x[lang]];
    next[i] = v;
    return { ...x, [lang]: next };
  });
  async function save() {
    const r = await api('/api/admin/screens', { key: 'closing', card_text: t });
    onDone(r.status === 'OK' ? { ok: true, text: 'Closing text saved. The stage shows it within a minute.' } : { ok: false, text: describeScreen(r.status) });
  }
  return (
    <div className="adm-card">
      {(['id', 'en'] as const).map((lang) => (
        <div key={lang} className="adm-row">
          <b>{lang.toUpperCase()}</b>
          <input className="adm-input" maxLength={60} aria-label={`Closing line 1 (${lang})`} value={t[lang][0]} onChange={(e) => set(lang, 0, e.target.value)} />
          <input className="adm-input" maxLength={60} aria-label={`Closing line 2 (${lang})`} value={t[lang][1]} onChange={(e) => set(lang, 1, e.target.value)} />
        </div>
      ))}
      <button className="btn btn--gold" onClick={save}>Save closing text</button>
    </div>
  );
}

export function ScreenManager() {
  const { data, reload } = useLoad<{ screens: Row[] }>('/api/admin/screens');
  const [msg, setMsg] = useState<Msg>(null);
  const [preview, setPreview] = useState<ScreenKey | null>(null);
  const rows = data?.screens ?? [];
  const done = (m: Msg) => { setMsg(m); reload(); };
  const closing = rows.find((r) => r.key === 'closing');

  return (
    <>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Screen</th><th>Kind</th><th>File</th><th>Length</th><th>Size</th><th>At the end</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const def = screenDef(r.key);
              const video = def.kind === 'loop' || def.kind === 'once';
              return (
                <tr key={r.key}>
                  <td><b>{label(r.key)}</b>{def.audio && ' 🔊'}</td>
                  <td>{def.kind === 'loop' ? 'Loop, silent' : def.kind === 'once' ? 'Plays once' : def.kind === 'draw' ? 'Live draw board' : def.kind === 'card' ? 'Card (in app)' : 'Black'}</td>
                  <td>{video ? (r.video_path ? `v${r.video_version}` : <span className="adm-badge adm-badge--pink">missing</span>) : '—'}</td>
                  <td>{formatDuration(r.duration_s)}</td>
                  <td>{formatMb(r.video_bytes)}</td>
                  <td>{def.kind === 'once' ? <EndAction row={r} onDone={done} /> : ''}</td>
                  <td>
                    <span className="adm-row" style={{ margin: 0 }}>
                      {video && <Upload row={r} onDone={done} />}
                      {r.preview_url && <button className="btn" onClick={() => setPreview(preview === r.key ? null : r.key)}>{preview === r.key ? 'Close' : 'Preview'}</button>}
                    </span>
                    {preview === r.key && r.preview_url && <video src={r.preview_url} controls style={{ width: 320, marginTop: 8 }} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="adm-sub">Closing card</h2>
      {closing && <ClosingText key={closing.card_text ? JSON.stringify(closing.card_text) : 'default'} row={closing} onDone={done} />}

      <h2 className="adm-sub">USB fallback</h2>
      <p className="adm-muted">Download every current file and copy them to a USB stick for the LED vendor. File names are in show order.</p>
      <div className="adm-links">
        {rows.filter((r) => r.download_url).map((r) => (
          <a key={r.key} className="adm-link" href={r.download_url!} download>
            <b>{label(r.key)}</b>
            <span>v{r.video_version} · {formatMb(r.video_bytes)}</span>
          </a>
        ))}
      </div>
    </>
  );
}
