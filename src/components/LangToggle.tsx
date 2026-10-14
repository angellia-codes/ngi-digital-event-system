'use client';
import { useI18n } from '@/lib/i18n';

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang" role="group" aria-label={t('lang.label')}>
      {(['id', 'en'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? 'lang__btn lang__btn--on' : 'lang__btn'} lang={l} aria-label={t(l === 'id' ? 'lang.id' : 'lang.en')} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
