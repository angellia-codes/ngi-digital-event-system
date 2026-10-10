'use client';
import { useCallback, useState } from 'react';
import { StationShell } from '@/components/station/StationShell';
import { WinnerCard } from '@/components/station/WinnerCard';
import { api } from '@/lib/client';
import { pendingDraws } from '@/lib/draw-ui';
import { useI18n } from '@/lib/i18n';
import { prizeLabel } from '@/lib/prizes';
import { useCurrent } from '@/lib/use-current';
import { useStation } from '@/lib/use-station';
import '@/styles/operator.css';

type Lookup = {
  status: 'WINNER' | 'PENDING' | 'NOT_A_WINNER' | 'NO_SUCH_NUMBER';
  number?: number; name?: string; outlet?: string; department?: string | null; draw_id?: string;
  prize?: { name: string; tier: string | null };
};

/** Backup screen. Same actions as the MC screen; whichever tap lands first wins and a repeat is harmless. */
export default function PrizesStation() {
  const { me } = useStation('prizes');
  const { t } = useI18n();
  const { current, reload } = useCurrent(!!me);
  const [digits, setDigits] = useState('');
  const [found, setFound] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const lookup = useCallback(async (n: number) => {
    const r = await api<Lookup>('/api/station/prizes/lookup-number', { number: n });
    if (r.ok && r.data) setFound({ ...r.data, status: r.status as Lookup['status'] });
    else setNote(t('draw.error'));
  }, [t]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(digits);
    if (!Number.isInteger(n) || n < 1) return;
    setNote('');
    setBusy(true);
    await lookup(n);
    setBusy(false);
  }

  async function resolve(drawId: string, outcome: 'confirm' | 'no_show') {
    if (busy) return;
    setBusy(true);
    setNote('');
    const r = await api('/api/station/draw/resolve', { draw_id: drawId, outcome });
    if (!r.ok) setNote(t('draw.error'));
    await reload();
    if (found?.number) await lookup(found.number);
    setBusy(false);
  }

  if (!me) return null;
  const round = current?.round ?? null;
  const pending = round ? pendingDraws(round) : [];
  const prizeLine = round ? prizeLabel(round.prize) : '';

  return (
    <StationShell title={t('verify.title')} me={me}>
      <div className="op">
        <h2>{t('verify.current')}</h2>
        {pending.length === 0 && <p className="op__muted">{t('verify.none')}</p>}
        {pending.map((d) => (
          <WinnerCard key={d.id} compact={pending.length > 1} busy={busy} winner={d} prizeLine={prizeLine}
            confirmLabel={t('draw.confirm_handover')}
            onConfirm={() => resolve(d.id, 'confirm')} onNoShow={() => resolve(d.id, 'no_show')} />
        ))}
        {note && <p role="alert" className="error">{note}</p>}

        <h2>{t('verify.number')}</h2>
        <form className="op__form" onSubmit={find}>
          <input className="field" inputMode="numeric" maxLength={6} autoComplete="off" aria-label={t('verify.number')} placeholder="000"
            value={digits} onChange={(e) => { setDigits(e.target.value.replace(/\D/g, '')); setFound(null); }} />
          <button className="btn--staff" type="submit" disabled={busy || digits === ''}>{t('verify.lookup')}</button>
        </form>

        {found?.status === 'NO_SUCH_NUMBER' && <p className="op__void">{t('verify.no_such')}</p>}
        {found && found.status !== 'NO_SUCH_NUMBER' && found.number !== undefined && (
          <WinnerCard busy={busy} winner={{ number: found.number, name: found.name ?? '', outlet: found.outlet ?? '', department: found.department ?? null }}
            tone={found.status === 'WINNER' ? 'green' : found.status === 'PENDING' ? 'gold' : 'pink'}
            tag={t(found.status === 'WINNER' ? 'verify.winner' : found.status === 'PENDING' ? 'verify.pending' : 'verify.not_winner')}
            prizeLine={found.prize ? t('verify.prize_for', { prize: prizeLabel(found.prize) }) : undefined}
            confirmLabel={t('draw.confirm_handover')}
            onConfirm={found.status === 'PENDING' && found.draw_id ? () => resolve(found.draw_id!, 'confirm') : undefined}
            onNoShow={found.status === 'PENDING' && found.draw_id ? () => resolve(found.draw_id!, 'no_show') : undefined} />
        )}
      </div>
    </StationShell>
  );
}
