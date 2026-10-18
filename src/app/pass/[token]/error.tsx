'use client';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import '@/styles/pass.css';

/** Branded fallback when the pass fails to load (database or network error on the server). */
export default function PassError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="pass-bg"><main className="pass">
      <header className="pass__top"><span className="label">NOURISH GROUP INDONESIA</span><LangToggle /></header>
      <section className="notice" role="alert">
        <h1>{t('pass.error_title')}</h1>
        <p>{t('pass.error_body')}</p>
        <button type="button" className="btn btn--primary" onClick={() => { reset(); window.location.reload(); }}>{t('pass.retry')}</button>
      </section>
    </main></div>
  );
}
