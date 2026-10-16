import type { Language } from './strings.types';

/**
 * The one place the interface language becomes a formatting locale.
 *
 * It lived in a dozen components as `lang === 'he' ? 'he-IL' : 'en-GB'`, which is the kind of
 * duplication that drifts silently: changing the English locale meant finding every copy, and
 * missing one produced two date formats on the same screen.
 */
export const localeOf = (lang: Language): string => (lang === 'he' ? 'he-IL' : 'en-GB');

/**
 * A calendar date — `YYYY-MM-DD`, a day with no time and no zone.
 *
 * It is built from the parts rather than parsed, because `new Date('2027-10-03')` is read as UTC
 * midnight and then rendered in the viewer's zone, which shows the previous day anywhere west of
 * Greenwich. Formatting in UTC keeps the day that was stored.
 */
export const formatCalendarDate = (
  value: string,
  lang: Language,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string => {
  // Accepts a bare `YYYY-MM-DD` and a full ISO timestamp alike: callers hold both shapes, and the
  // day is the leading ten characters either way.
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(localeOf(lang), {
    ...options,
    timeZone: 'UTC',
  });
};

/**
 * A real instant — a stored `createdAt` and the like. Rendered in the viewer's own zone, which is
 * correct here and wrong for a calendar date: an instant happened at a moment, a calendar date did
 * not.
 */
export const formatInstantDate = (
  iso: string,
  lang: Language,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string => new Date(iso).toLocaleDateString(localeOf(lang), options);

export const formatInstantTime = (iso: string, lang: Language): string =>
  new Date(iso).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });
