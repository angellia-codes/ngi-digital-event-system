'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { panelFor, type Context, type Icon } from '@/lib/result-panel';
import type { Size } from '@/lib/sizes';
import { formatTimeWita } from '@/lib/time';

export type Result = {
  status: string;
  guest?: { id: string; full_name: string; outlet: string; department?: string | null; position?: string | null };
  prize_number?: number;
  checked_in_at?: string;
  redeemed_at?: string;
  station_label?: string;
  beverage?: 'beer' | 'soft_drink';
  /** Merchandise: reserved size (null = none yet) and, after a hand-over, the size given. */
  size?: Size | null;
  size_source?: 'guest' | 'admin' | 'auto' | null;
  given_size?: Size | null;
};

const PATHS: Record<Exclude<Icon, 'none'>, string[]> = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  alert: ['M12 6v8', 'M12 18.5v.5'],
  cross: ['M6 6l12 12', 'M18 6L6 18'],
  swap: ['M5 9h13l-3-3', 'M19 15H6l3 3'],
  refresh: ['M19 8a8 8 0 1 0 1 6', 'M19 3v5h-5'],
};

function PanelIcon({ icon }: { icon: Icon }) {
  if (icon === 'none') return null;
  return (
    <span className="panel__icon" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[icon].map((d) => <path key={d} d={d} />)}
      </svg>
    </span>
  );
}

/** `extra` replaces the default hand-over button (the merchandise booth puts its size controls there). */
export function ResultPanel({ context, result, busy, onNext, onHandOver, extra }: {
  context: Context; result: Result; busy?: boolean; onNext: () => void; onHandOver?: () => void; extra?: ReactNode;
}) {
  const { t } = useI18n();
  const panel = panelFor(context, result.status);
  useEffect(() => { if (panel.vibrate.length) navigator.vibrate?.(panel.vibrate); }, [result, panel.vibrate]);

  const g = result.guest;
  // A live region announces reliably only if it exists empty first, then gets its text.
  const [said, setSaid] = useState('');
  const spoken = `${t(panel.titleKey)}${g ? `. ${g.full_name}` : ''}`;
  useEffect(() => {
    const id = setTimeout(() => setSaid(spoken), 100);
    return () => { clearTimeout(id); setSaid(''); };
  }, [spoken, result]);

  const meta = [g?.outlet, g?.department, g?.position].filter(Boolean).join(' · ');
  const note =
    result.status === 'ALREADY_CHECKED_IN' && result.checked_in_at
      ? t('staff.first_checkin', { time: formatTimeWita(result.checked_in_at), station: result.station_label ?? '-' })
      : result.status === 'ALREADY_REDEEMED' && result.redeemed_at
        ? t(context === 'bar' ? 'bev.already_detail' : 'merch.already_detail', { time: formatTimeWita(result.redeemed_at), station: result.station_label ?? '-' })
        : null;
  const ready = (context === 'merchandise' || context === 'bar') && result.status === 'READY';
  // At the bar the drink itself is the headline, in large type (spec §3).
  const drink = context === 'bar' && result.beverage ? t(result.beverage === 'beer' ? 'bev.beer' : 'bev.soft') : null;
  // At the booth the size is the headline: what was handed over, else what was reserved (merch size spec §4.1).
  const shirtSize = context === 'merchandise' ? (result.given_size ?? result.size ?? null) : null;
  const headline = drink ?? (shirtSize ? t('size.label', { size: shirtSize }) : null);

  return (
    <section className={`panel panel--${panel.tone}`}>
      <div className="sr-only" role="status">{said}</div>
      <div className="panel__head">
        <PanelIcon icon={panel.icon} />
        <span className="panel__title">{t(panel.titleKey)}</span>
      </div>
      {headline && <div className="panel__drink">{headline}</div>}
      {g && <div className="panel__name">{g.full_name}</div>}
      {meta && <div className="panel__meta">{meta}</div>}
      {context === 'checkin' && result.prize_number !== undefined && (
        <div className="panel__prize"><b>{t('staff.prize_label')}</b><span>{String(result.prize_number).padStart(3, '0')}</span></div>
      )}
      {note && <div className="panel__note">{note}</div>}
      {extra}
      <div className="panel__actions">
        {ready && !extra && (
          <button type="button" className="btn--staff" disabled={busy} aria-disabled={busy} onClick={onHandOver}>{t(context === 'bar' ? 'bev.handover' : 'merch.handover')}</button>
        )}
        <button type="button" className="btn--staff btn--staff-dark" onClick={onNext}>{t('staff.next')}</button>
      </div>
    </section>
  );
}
