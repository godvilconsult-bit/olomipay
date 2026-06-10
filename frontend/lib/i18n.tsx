'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Lang = 'en' | 'sw';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** t('English', 'Swahili') → returns the string for the active language. */
  t: (en: string, sw: string) => string;
}

const Ctx = createContext<LangCtx>({ lang: 'en', setLang: () => {}, t: (en) => en });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const s = localStorage.getItem('jiko_lang');
    if (s === 'sw' || s === 'en') setLangState(s);
  }, []);

  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem('jiko_lang', l); } catch {} };
  const t = (en: string, sw: string) => (lang === 'sw' ? sw : en);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);

/** Compact EN | SW switch for the header. */
export function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <div className="flex items-center rounded-full bg-black/5 p-0.5 text-xs font-bold">
      {(['en', 'sw'] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 transition ${lang === l ? 'bg-flame text-white' : 'text-ink/50'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
