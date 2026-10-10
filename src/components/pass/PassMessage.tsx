'use client';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import '@/styles/pass.css';

export function PassMessage({ kind }: { kind: 'INVALID' | 'RATE_LIMITED' }) {
  const { t } = useI18n();
  return (
    <main className="pass">
      <header className="pass__top"><span className="label">NOURISHFEST 2026</span><LangToggle /></header>
      <section className="notice">
        {kind === 'INVALID' ? (<><h2>{t('pass.invalid_title')}</h2><p>{t('pass.invalid_body')}</p></>) : <p>{t('pass.rate_limited')}</p>}
      </section>
    </main>
  );
}
