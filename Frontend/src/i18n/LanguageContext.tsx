import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { he } from './strings.he';
import { en } from './strings.en';
import type { Language, Strings } from './strings.types';

/** Shared with the static prototypes, so a language chosen on either side is honoured by both. */
const STORAGE_KEY = 'fieldsync-lang';

export interface LanguageValue {
  readonly lang: Language;
  readonly t: Strings;
  readonly isRtl: boolean;
  setLang(next: Language): void;
}

export const LanguageContext = createContext<LanguageValue | null>(null);

const read = (): Language => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'he';
  } catch {
    // Private browsing and blocked site data both throw here rather than returning null.
    return 'he';
  }
};

/**
 * Direction and typeface belong on the root element, not on a panel: the stylesheet redefines
 * `--font-sans` there, and `body` resolves that variable against an ancestor. Scoped any lower,
 * English copy still computed the Hebrew font.
 *
 * `data-lang` is what the stylesheet matches on. It replaces `html:has(#lang-en:checked)`, which
 * only existed because a page with no JavaScript had to store the language in a radio button.
 */
const applyToRoot = (lang: Language): void => {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'he' ? 'rtl' : 'ltr';
  root.dataset['lang'] = lang;
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Language>(read);

  // Runs after the first paint and after every change, so the root attributes never disagree with
  // what is on screen. Without it the page would render English text inside an RTL layout.
  useEffect(() => {
    applyToRoot(lang);
  }, [lang]);

  const setLang = useCallback((next: Language): void => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is a convenience; failing to store it must not break the toggle.
    }
  }, []);

  const value = useMemo<LanguageValue>(
    () => ({ lang, t: lang === 'he' ? (he as unknown as Strings) : en, isRtl: lang === 'he', setLang }),
    [lang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
