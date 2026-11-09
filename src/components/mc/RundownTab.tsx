'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import {
  currentSegment, driftMinutes, formatDrift, nextSegment, segmentStatus, undrawnCount, type McState, type Segment,
} from '@/lib/mc';
import { formatTimeWita } from '@/lib/time';

function Row({ seg, status, open, onToggle }: { seg: Segment; status: string; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const showScript = status === 'current' || open;
  return (
    <li className={`mc-seg mc-seg--${status}`}>
      <button type="button" className="mc-seg__head" onClick={onToggle} aria-expanded={showScript}>
        <span className="mc-seg__time">{formatTimeWita(seg.planned_start)}</span>
        <span className="mc-seg__title">
          {seg.title}
          {seg.kind === 'door_prize' && <span className="mc-badge">{t('mc.door_prize')}</span>}
        </span>
        <span className="mc-seg__dur">{seg.duration_min}&apos;</span>
      </button>
      {seg.pic && <div className="mc-seg__pic">{t('mc.pic', { pic: seg.pic })}</div>}
      {status === 'done' && seg.started_at && seg.ended_at && (
        <div className="mc-seg__pic">{t('mc.actual', { start: formatTimeWita(seg.started_at), end: formatTimeWita(seg.ended_at) })}</div>
      )}
      {showScript && <div className="mc-seg__script">{seg.script || t('mc.no_script')}</div>}
    </li>
  );
}

/** Live run-sheet. NEXT moves exactly one segment forward; there is no back button (an admin corrects mistakes). */
export function RundownTab({ state, onState }: { state: McState | null; onState: (s: McState) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  if (!state) return null;
  const cur = currentSegment(state);
  const upcoming = nextSegment(state);
  const undrawn = cur?.kind === 'door_prize' ? undrawnCount(cur) : 0;
  const drift = cur?.started_at ? driftMinutes(cur.planned_start, cur.started_at) : 0;

  async function next() {
    if (busy || !state) return;
    setBusy(true);
    setNote('');
    const r = await api<{ state?: McState }>('/api/station/mc/next', { from_segment_id: state.current_segment_id });
    setBusy(false);
    setConfirming(false);
    if (r.data?.state) onState(r.data.state);
    if (r.status === 'ALREADY_ADVANCED') setNote(t('mc.already_advanced'));
    else if (r.status === 'NO_SEGMENTS') setNote(t('mc.no_segments'));
    else if (!r.ok) setNote(t('mc.error')); // safe to tap again: the server only moves on from this segment once
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  return (
    <div className="mc-tab">
      {state.phase === 'running' && (
        <p className={drift > 0 ? 'mc-drift mc-drift--late' : 'mc-drift'}>
          {drift === 0 ? t('mc.on_time') : t('mc.show_drift', { drift: formatDrift(drift) })}
        </p>
      )}
      {state.segments.length === 0 ? (
        <p className="op__muted">{t('mc.no_segments')}</p>
      ) : (
        <ol className="mc-list">
          {state.segments.map((s) => (
            <Row key={s.id} seg={s} status={segmentStatus(s, state.current_segment_id)} open={open.has(s.id)} onToggle={() => toggle(s.id)} />
          ))}
        </ol>
      )}

      {state.phase !== 'ended' && state.segments.length > 0 && (
        <div className="mc-next">
          {note && <p role="alert" className="error">{note}</p>}
          {confirming ? (
            <div className="mc-confirm">
              <p>{t('mc.undrawn_confirm', { n: undrawn })}</p>
              <div className="op__row">
                <button type="button" className="btn--staff btn--staff-dark" disabled={busy} onClick={() => setConfirming(false)}>{t('mc.cancel')}</button>
                <button type="button" className="btn--staff" disabled={busy} onClick={next}>{t('mc.yes_next')}</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mc-next__hint">{upcoming ? t('mc.next_title', { title: upcoming.title }) : t('mc.last_segment')}</p>
              <button type="button" className="btn--staff mc-next__btn" disabled={busy}
                onClick={() => (undrawn > 0 ? setConfirming(true) : next())}>
                {state.phase === 'not_started' ? t('mc.start') : t('mc.next')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
