'use client';
import { useI18n } from '@/lib/i18n';

export type Tab = 'scan' | 'manual';

export function TabBar({ tab, onTab, counter }: { tab: Tab; onTab: (t: Tab) => void; counter: string }) {
  const { t } = useI18n();
  return (
    <nav className="tabs" aria-label="Mode">
      <button type="button" className="tabs__item" aria-pressed={tab === 'scan'} onClick={() => onTab('scan')}>{t('staff.tab_scan')}</button>
      <button type="button" className="tabs__item" aria-pressed={tab === 'manual'} onClick={() => onTab('manual')}>{t('staff.manual')}</button>
      <div className="tabs__item" role="status">{counter}</div>
    </nav>
  );
}
