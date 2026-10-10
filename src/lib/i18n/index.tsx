'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate, type Lang, type StringKey } from './strings';

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: StringKey, vars?: Record<string, string | number>) => string };
const KEY = 'nf_lang';
const I18n = createContext<Ctx>({ lang: 'id', setLang: () => {}, t: (k, v) => translate('id', k, v) });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en'); // English is the default
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'id' || saved === 'en') setLangState(saved);
    } catch { /* storage unavailable: keep the default */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
