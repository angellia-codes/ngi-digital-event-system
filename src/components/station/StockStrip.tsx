'use client';
import { useI18n } from '@/lib/i18n';
import type { SizeSummary } from '@/lib/sizes';

/** Stock left per size, pinned above the scanner (merch size spec §4.2). Before stock is entered it shows claimed per size. */
export function StockStrip({ summary }: { summary: SizeSummary | null }) {
  const { t } = useI18n();
  if (!summary) return null;
  const label = summary.stock_set ? t('size.strip_left') : t('size.strip_given');
  return (
    <div className="stock-strip" role="group" aria-label={label}>
      <b>{label}</b>
      {summary.sizes.map((r) => {
        const n = summary.stock_set ? r.left : r.given;
        return <span key={r.size} className={summary.stock_set && n <= 0 ? 'is-zero' : undefined}>{r.size} {n}</span>;
      })}
    </div>
  );
}
