import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Language } from '../i18n/strings.types';

const STORAGE_KEY = 'fieldsync-lang';

const readStoredLanguage = (): Language => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'he';
  } catch {
    // Private browsing and blocked site data both throw here rather than returning null.
    return 'he';
  }
};

export interface UiState {
  readonly language: Language;
}

/**
 * Global UI preference. It belongs in the store rather than in a screen because every screen reads
 * it and the navbar writes it, so there is no component that owns it.
 */
export const uiSlice = createSlice({
  name: 'ui',
  initialState: { language: readStoredLanguage() } as UiState,
  reducers: {
    languageChanged(state, action: PayloadAction<Language>) {
      state.language = action.payload;
      try {
        localStorage.setItem(STORAGE_KEY, action.payload);
      } catch {
        // Persistence is a convenience; failing to store it must not break the toggle.
      }
    },
  },
});

export const { languageChanged } = uiSlice.actions;
