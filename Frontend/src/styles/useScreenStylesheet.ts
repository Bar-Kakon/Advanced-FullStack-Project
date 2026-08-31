import { useInsertionEffect } from 'react';

/**
 * Applies one screen's stylesheet while that screen is on the page, and removes it again.
 *
 * The earlier static screens were separate documents, so each could own a stylesheet that redefines
 * `:root`, `.btn`, `.form-input` and `.lang-switch` in its own terms — and they do: the auth
 * sheets and the profile sheet disagree about button gaps, field heights, shadows and shape
 * tokens. A single-page application has one document, so importing all of them the ordinary way
 * would let whichever loaded last silently repaint the others.
 *
 * Only one screen is mounted at a time, so applying its sheet on mount and removing it on unmount
 * reproduces the isolation the separate files had — and it does so without editing a single
 * declaration, which is what keeps the approved visual identical rather than merely similar.
 *
 * The CSS arrives as a string (`?inline`), so it is already in the bundle: there is no second
 * request and therefore no frame in which the screen is painted unstyled. `useInsertionEffect`
 * runs before the browser paints, for the same reason.
 *
 * A sheet is reference-counted rather than removed outright, because React mounts the next route
 * before unmounting the previous one, and two screens sharing a sheet — My profile and Edit
 * profile both load `profile.css` — must not have it pulled out from under the one still showing.
 */

const applied = new Map<string, { readonly style: HTMLStyleElement; count: number }>();

const retain = (id: string, css: string): void => {
  const existing = applied.get(id);
  if (existing) {
    existing.count += 1;
    return;
  }

  const style = document.createElement('style');
  style.dataset['screenStylesheet'] = id;
  style.textContent = css;
  document.head.appendChild(style);
  applied.set(id, { style, count: 1 });
};

const release = (id: string): void => {
  const existing = applied.get(id);
  if (!existing) return;

  existing.count -= 1;
  if (existing.count > 0) return;

  existing.style.remove();
  applied.delete(id);
};

export interface ScreenStylesheet {
  /** Stable name for this sheet, so two screens loading the same one share a single element. */
  readonly id: string;
  readonly css: string;
}

/** Sheets are listed in the order the screen loads them; later ones override earlier ones. */
export const useScreenStylesheet = (...sheets: readonly ScreenStylesheet[]): void => {
  // Keyed on the ids rather than the array, so a caller passing a fresh array literal on every
  // render does not tear the stylesheet down and rebuild it on every render.
  const key = sheets.map((sheet) => sheet.id).join('|');

  useInsertionEffect(() => {
    for (const sheet of sheets) retain(sheet.id, sheet.css);
    return () => {
      for (const sheet of sheets) release(sheet.id);
    };
    // The sheets are module-level constants; `key` identifies them completely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
};
