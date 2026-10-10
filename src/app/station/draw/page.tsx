'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { padPrize } from '@/components/pass/PrizeNumber';
import { StationShell } from '@/components/station/StationShell';
import { WinnerCard } from '@/components/station/WinnerCard';
import { api } from '@/lib/client';
import { heartbeatState, pendingDraws, requestIds, secondsLeft } from '@/lib/draw-ui';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { drawProblem, roundKey, screenFor } from '@/lib/operator';
import { firstOpenPrize, prizeLabel, type PrizeRow } from '@/lib/prizes';
import { useCurrent } from '@/lib/use-current';
import { useStation } from '@/lib/use-station';
import '@/styles/operator.css';

type Resolve = { draw_id: string; outcome: 'confirm' | 'no_show' } | { round_id: string; outcome: 'confirm_all' };
const LINK_TEXT: Record<'ok' | 'down' | 'never', StringKey> = { ok: 'draw.stage_ok', down: 'draw.stage_down', never: 'draw.stage_never' };

export default function DrawStation() {
  const { me } = useStation('draw');
  const { t } = useI18n();
  const { current, offline, reload } = useCurrent(!!me);
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [prizeId, setPrizeId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const ids = useMemo(() => requestIds(), []);

  const loadPrizes = useCallback(async () => {
    const r = await api<{ prizes: PrizeRow[] }>('/api/station/prizes');
    if (r.ok && r.data) setPrizes(r.data.prizes);
  }, []);
  useEffect(() => {
    if (!me) return;
    loadPrizes();
    const id = setInterval(loadPrizes, 10_000);
    return () => clearInterval(id);
  }, [me, loadPrizes]);

  const round = current?.round ?? null;
  const screen = screenFor(round, dismissed);
  const pending = round ? pendingDraws(round) : [];

  // After a no-show the same prize is selected again for the redraw (the operator can still pick another one).
  const redrawPrize = screen === 'redraw' && round ? round.prize.id : null;
  const key = round ? roundKey(round) : null;
  useEffect(() => {
    if (redrawPrize) setPrizeId(redrawPrize);
  }, [redrawPrize, key]);
  // Otherwise start on the first prize that still has a free slot.
  useEffect(() => {
    if (prizeId === null && prizes.length > 0) setPrizeId(firstOpenPrize(prizes) ?? prizes[0].id);
  }, [prizeId, prizes]);

  // The 60-second countdown ticks once a second, only while a draw is waiting.
  const waiting = pending.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [waiting]);

  const refresh = useCallback(() => Promise.all([reload(), loadPrizes()]), [reload, loadPrizes]);

  async function draw() {
    if (!prizeId || busy) return;
    setBusy(true);
    setNote('');
    // The same request id is reused until the server answers, so a retry or a double tap cannot draw twice.
    const r = await api<{ short_by?: number; pending?: number }>('/api/station/draw', { prize_id: prizeId, request_id: ids.idFor(prizeId) });
    if (r.status !== 'RETRYABLE_ERROR') ids.done(prizeId);
    setBusy(false);
    if (r.status === 'DRAWN') {
      const short = r.data?.short_by ?? 0;
      if (short > 0) setNote(t('draw.short_by', { got: r.data?.pending ?? 0, short }));
    } else {
      const key = drawProblem(r.status);
      if (key) setNote(t(key));
    }
    await refresh();
  }

  async function resolve(body: Resolve) {
    if (busy) return;
    setBusy(true);
    setNote('');
    const r = await api('/api/station/draw/resolve', body);
    setBusy(false);
    if (!r.ok) setNote(t('draw.error')); // the action is safe to repeat: whichever tap lands first wins
    await refresh();
  }

  async function showOnStage() {
    if (!prizeId || busy) return;
    setBusy(true);
    setNote('');
    const r = await api<{ status: string }>('/api/station/draw/stage', { phase: 'intro', prize_id: prizeId });
    setBusy(false);
    if (r.status === 'DRAW_IN_PROGRESS') setNote(t('draw.in_progress'));
    else if (!r.ok) setNote(t('draw.error'));
    await reload();
  }

  async function blankStage() {
    if (busy) return;
    setBusy(true);
    setNote('');
    const r = await api<{ status: string }>('/api/station/draw/stage', { phase: 'idle' });
    setBusy(false);
    if (r.status === 'DRAW_IN_PROGRESS') setNote(t('draw.in_progress'));
    else if (!r.ok) setNote(t('draw.error'));
    await reload();
  }

  function next() {
    if (round) setDismissed(roundKey(round));
    setPrizeId(null);
    setNote('');
  }

  if (!me) return null;
  const link = heartbeatState(current?.heartbeat_age);
  const left = secondsLeft(current?.oldest_pending_at ?? null, now);
  const selected = prizes.find((p) => p.id === prizeId) ?? null;
  const batch = !!round?.prize.batch;
  const prizeLine = round ? prizeLabel(round.prize) : '';

  return (
    <StationShell title={t('draw.title')} me={me}>
      <div className="op">
        <div className="op__link" aria-live="polite">
          <span className={`dot dot--${link}`} />
          {offline ? t('common.retry_hint') : t(LINK_TEXT[link])}
        </div>

        {screen === 'active' && round && (
          <>
            <p className="op__note">{t('draw.stage_note')}</p>
            {note && <p role="alert" className="error">{note}</p>}
            {batch ? (
              <>
                {round.draws.filter((d) => d.status !== 'void_no_show' && d.status !== 'void_admin').map((d) => (
                  <WinnerCard key={d.id} compact tone={d.status === 'confirmed' ? 'green' : 'gold'} busy={busy}
                    winner={d} tag={`${d.slot} / ${round.prize.quantity}`} prizeLine={prizeLine}
                    onConfirm={d.status === 'drawn' ? () => resolve({ draw_id: d.id, outcome: 'confirm' }) : undefined}
                    onNoShow={d.status === 'drawn' ? () => resolve({ draw_id: d.id, outcome: 'no_show' }) : undefined} />
                ))}
                {pending.length > 1 && (
                  <button type="button" className="btn-confirm btn-confirm--wide" disabled={busy}
                    onClick={() => resolve({ round_id: round.round_id, outcome: 'confirm_all' })}>{t('draw.confirm_all')}</button>
                )}
              </>
            ) : (
              pending.map((d) => (
                <WinnerCard key={d.id} winner={d} busy={busy} prizeLine={prizeLine}
                  tag={t('draw.progress', { n: d.slot, total: round.prize.quantity })}
                  onConfirm={() => resolve({ draw_id: d.id, outcome: 'confirm' })}
                  onNoShow={() => resolve({ draw_id: d.id, outcome: 'no_show' })}>
                  <div className={left <= 10 ? 'countdown countdown--low' : 'countdown'}>
                    {t('draw.must_be_present')}
                    <b>{t('draw.seconds', { n: left })}</b>
                    {t('draw.waiting')}
                  </div>
                </WinnerCard>
              ))
            )}
          </>
        )}

        {screen === 'recorded' && round && (
          <div className="panel panel--green">
            <div className="panel__head"><span className="panel__title">{t('draw.recorded')}</span></div>
            {round.draws.filter((d) => d.status === 'confirmed').map((d) => (
              <div key={d.id}>
                <div className="panel__name">{d.name}</div>
                <div className="panel__meta">{padPrize(d.number)} · {d.outlet}</div>
              </div>
            ))}
            <div className="panel__actions">
              <button type="button" className="btn--staff btn--staff-dark" onClick={next}>{t('draw.next')}</button>
              <button type="button" className="btn--staff btn--staff-dark" disabled={busy} onClick={blankStage}>{t('draw.blank_stage')}</button>
            </div>
          </div>
        )}

        {(screen === 'pick' || screen === 'redraw') && (
          <>
            {screen === 'redraw' && <p className="op__void">{t('draw.no_show')}</p>}
            {prizes.length === 0 ? (
              <p className="op__muted">{t('draw.no_prizes')}</p>
            ) : (
              <>
                <h2>{t('draw.pick_prize')}</h2>
                <div className="choices">
                  {prizes.map((p) => (
                    <button key={p.id} type="button" className="choice" aria-pressed={p.id === prizeId} disabled={p.remaining === 0}
                      onClick={() => setPrizeId(p.id)}>
                      {prizeLabel(p)}
                      <small>{t('draw.prize_left', { n: p.remaining, total: p.quantity })}</small>
                    </button>
                  ))}
                </div>
                {note && <p role="alert" className="error">{note}</p>}
                <div className="op__row">
                  <button type="button" className="btn--staff btn--staff-dark" disabled={busy || !selected} onClick={showOnStage}>{t('draw.show_prize')}</button>
                  <button type="button" className="btn--staff" disabled={busy || !selected || selected.remaining === 0} onClick={draw}>
                    {selected?.draw_as_batch ? t('draw.draw_batch', { n: selected.remaining }) : t('draw.draw')}
                  </button>
                </div>
                <button type="button" className="btn--staff btn--staff-dark" disabled={busy} onClick={blankStage}>{t('draw.blank_stage')}</button>
              </>
            )}
          </>
        )}
      </div>
    </StationShell>
  );
}
