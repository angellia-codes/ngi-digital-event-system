'use client';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import '@/styles/pass.css';

export function PassMessage({ kind }: { kind: 'INVALID' | 'RATE_LIMITED' }) {
  const { t } = useI18n();
  return (
    <div className="pass-bg"><main className="pass">
      <header className="pass__top"><span className="label">NOURISH GROUP INDONESIA</span><LangToggle /></header>
      <section className="notice">
        {kind === 'INVALID' ? (
          <><h1>{t('pass.invalid_title')}</h1><p>{t('pass.invalid_body')}</p></>
        ) : (
          <>
            <p>{t('pass.rate_limited')}</p>
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>{t('pass.retry')}</button>
          </>
        )}
      </section>
    </main></div>
  );
}
