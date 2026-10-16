import { createContext } from 'react';

import type { LanguageValue } from './LanguageContext';

export const LanguageContext = createContext<LanguageValue | null>(null);
