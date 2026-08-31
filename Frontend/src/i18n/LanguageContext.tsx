import { useCallback, useEffect, useMemo, type ReactNode } from 'react';

import { useAppDispatch, useAppSelector } from '../store/hooks';
import { languageChanged } from '../store/uiSlice';
import { LanguageContext } from './languageContextObject';
import { he } from './strings.he';
import { en } from './strings.en';
import type { Language, Strings } from './strings.types';

export interface LanguageValue {
  readonly lang: Language;
  readonly t: Strings;
  readonly isRtl: boolean;
  setLang(next: Language): void;
}

/**
 * Direction and typeface belong on the root element, not on a panel: the stylesheet redefines
 * `--font-sans` there, and `body` resolves that variable against an ancestor. Scoped any lower,
 * English copy still computed the Hebrew font.
 *
 * `data-lang` is what the stylesheet matches on.
 */
const applyToRoot = (lang: Language): void => {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'he' ? 'rtl' : 'ltr';
  root.dataset['lang'] = lang;
};

/**
 * The language now lives in the Redux store, which is what makes it one value rather than one per
 * screen. This provider stays because `useLanguage` is the API every screen already calls, and it
 * is where the root attributes are kept in step with the store.
 */
export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const lang = useAppSelector((state) => state.ui.language);
  const dispatch = useAppDispatch();

  // Runs after the first paint and after every change, so the root attributes never disagree with
  // what is on screen. Without it the page would render English text inside an RTL layout.
  useEffect(() => {
    applyToRoot(lang);
  }, [lang]);

  const setLang = useCallback(
    (next: Language): void => {
      dispatch(languageChanged(next));
    },
    [dispatch],
  );

  const value = useMemo<LanguageValue>(
    () => ({ lang, t: lang === 'he' ? (he as unknown as Strings) : en, isRtl: lang === 'he', setLang }),
    [lang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

