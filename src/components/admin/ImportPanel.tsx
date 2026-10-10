'use client';
import { useRef, useState } from 'react';
import { describeImportError } from '@/lib/admin-text';
import { api } from '@/lib/client';

type Err = { row: number; field: string; code: string };
type Preview = {
  status: string; errors?: Err[]; would_insert?: number; would_update?: number;
  missing_count?: number; missing?: { employee_id: string; full_name: string }[]; missingColumns?: string[];
};
type Done = { inserted: number; updated: number; flagged_missing: number };

const TEMPLATE = 'employee_id,full_name,outlet,department,position,phone,category\nE001,Kadek Ayu,Outlet Ubud,Service,Barista,0812-3456-7890,\n';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nourishfest-guests-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setDone(null);
    setError('');
    setPreview(null);
    const text = await file.text();
    setCsv(text);
    setBusy(true);
    const r = await api<Preview>('/api/admin/import/preview', { csv: text });
    setBusy(false);
    if (!r.ok) return setError('Could not check the file. Try again.');
    setPreview({ ...(r.data ?? {}), status: r.status });
  }

  async function commit() {
    if (!csv) return;
    setBusy(true);
    const r = await api<Done & { errors?: Err[] }>('/api/admin/import/commit', { csv });
    setBusy(false);
    if (r.ok && r.status === 'OK' && r.data) {
      setDone(r.data);
      setPreview(null);
      setCsv(null);
      onDone();
    } else if (r.status === 'HAS_ERRORS') {
      setPreview({ status: 'HAS_ERRORS', errors: r.data?.errors ?? [] });
    } else {
      setError('Import failed. Nothing was changed. Try again.');
    }
  }

  const blocked = preview && preview.status !== 'OK';
  return (
    <div className="adm-card">
      <div
        className={`adm-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      >
        <p>Drop the employee CSV here, or</p>
        <button className="btn" onClick={() => input.current?.click()} disabled={busy}>Choose file</button>{' '}
        <button className="btn" onClick={downloadTemplate}>Download template</button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <p className="adm-muted">Required columns: employee_id, full_name, outlet. Optional: department, position, phone, category. Uploading the same employee_id again updates that person.</p>
      </div>

      {busy && <p className="adm-muted">Working…</p>}
      {error && <p className="adm-msg adm-msg--error">{error}</p>}
      {done && <p className="adm-msg adm-msg--ok">Imported: {done.inserted} new, {done.updated} updated, {done.flagged_missing} flagged as missing from this file.</p>}

      {preview?.status === 'BAD_COLUMNS' && <p className="adm-msg adm-msg--error">Missing required column(s): {preview.missingColumns?.join(', ')}. Use the template.</p>}
      {preview?.status === 'EMPTY' && <p className="adm-msg adm-msg--error">The file has a header but no rows.</p>}
      {preview?.status === 'TOO_MANY' && <p className="adm-msg adm-msg--error">The file has more than 1000 rows. Split it.</p>}
      {preview?.status === 'HAS_ERRORS' && (
        <div className="adm-msg adm-msg--error">
          <strong>Nothing was imported. Fix these {preview.errors?.length} problem(s) and upload again:</strong>
          <ul className="adm-list">{preview.errors?.map((e, i) => <li key={i}>{describeImportError(e)}</li>)}</ul>
        </div>
      )}

      {preview?.status === 'OK' && (
        <div>
          <p><strong>{preview.would_insert}</strong> new, <strong>{preview.would_update}</strong> updated, <strong>{preview.missing_count}</strong> existing employees not in this file.</p>
          {(preview.missing_count ?? 0) > 0 && (
            <>
              <p className="adm-muted">These will be flagged, not deleted. Their QR codes keep working until you deactivate them.</p>
              <ul className="adm-list">{preview.missing?.map((m) => <li key={m.employee_id}>{m.employee_id} — {m.full_name}</li>)}</ul>
            </>
          )}
          <div className="adm-row">
            <button className="btn btn--gold" onClick={commit} disabled={busy}>Import now</button>
            <button className="btn" onClick={() => { setPreview(null); setCsv(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {blocked && <button className="btn" onClick={() => { setPreview(null); setCsv(null); }}>Clear</button>}
    </div>
  );
}
