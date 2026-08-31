import { useContext } from 'react';

import { LanguageContext } from './languageContextObject';
import type { LanguageValue } from './LanguageContext';

/**
 * The only way a component reads the language. The null check turns "rendered outside the
 * provider" into one clear error at the point of the mistake, instead of `undefined` spreading
 * through the tree until some label renders blank.
 */
export const useLanguage = (): LanguageValue => {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside <LanguageProvider>.');
  return value;
};
