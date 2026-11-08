'use client';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { MEASURES, SIZES, type FullChart, type Measure } from '@/lib/sizes';

const HEAD: Record<Measure, StringKey> = { chest: 'size.chest', bottom: 'size.bottom', length: 'size.length', sleeve: 'size.sleeve' };

/** Vendor chart as a native bilingual table (merch size spec §2). Widths are measured flat, not around the body. */
export function SizeGuide({ chart }: { chart: FullChart }) {
  const { t } = useI18n();
  return (
    <div className="size-guide">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('size.col_size')}</th>
            {MEASURES.map((m) => <th key={m} scope="col">{t(HEAD[m])}</th>)}
          </tr>
        </thead>
        <tbody>
          {SIZES.map((s) => (
            <tr key={s}>
              <th scope="row">{s}</th>
              {MEASURES.map((m) => <td key={m}>{chart[s][m]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">{t('size.unit')}</p>
      <p className="caption">{t('size.tip')}</p>
    </div>
  );
}
