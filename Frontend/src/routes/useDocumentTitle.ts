import { useEffect } from 'react';

/**
 * Sets the browser tab title for the screen that is on the page.
 *
 * Each static prototype was its own document with its own `<title>`, and this application has
 * one, so without this every screen would still be announcing "Create account". The titles carry
 * both languages, exactly as the prototypes' did — a tab title is read at a glance, and a person
 * scanning a row of tabs should not have to have chosen a language first.
 */
export const useDocumentTitle = (title: string): void => {
  useEffect(() => {
    document.title = title;
  }, [title]);
};
