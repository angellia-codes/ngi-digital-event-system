'use client';
import { useRouter } from 'next/navigation';
import { LangToggle } from '@/components/LangToggle';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { Me } from '@/lib/use-station';
import '@/styles/station.css';

export function StationShell({ title, me, children }: { title: string; me: Me; children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  async function logout() {
    await api('/api/station/logout', {});
    router.replace('/station');
  }
  return (
    <div className="station">
      <header className="station__bar">
        <h1 className="station__title">{title}</h1>
        <span className="station__chip">{me.label.toUpperCase()}</span>
        <LangToggle />
        <button type="button" className="station__logout" onClick={logout}>{t('common.logout')}</button>
      </header>
      <main className="station__main">{children}</main>
    </div>
  );
}
