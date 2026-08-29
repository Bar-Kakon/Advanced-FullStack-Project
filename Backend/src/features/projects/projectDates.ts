/**
 * Calendar dates, held as UTC midnight so a project that starts on the 3rd is the 3rd in every
 * timezone. Anything that parses to a different day than it was written is a bug this file exists
 * to prevent.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const parseCalendarDate = (value: string): Date | null => {
  if (!DATE_ONLY.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? parsed : null;
};

export const formatCalendarDate = (value: Date): string => value.toISOString().slice(0, 10);

const MS_PER_DAY = 86_400_000;

export const addDays = (from: Date, days: number): Date =>
  new Date(from.getTime() + days * MS_PER_DAY);

export const daysBetween = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);

/** The date the target may never pass: the original promise plus the allowance the יזם set. */
export const overrunCeiling = (originalTargetEndDate: Date, overrunAllowanceDays: number): Date =>
  addDays(originalTargetEndDate, overrunAllowanceDays);

/** Positive only. A target pulled earlier than the original is not an overrun. */
export const overrunFromOriginal = (originalTargetEndDate: Date, targetEndDate: Date): number =>
  Math.max(0, daysBetween(originalTargetEndDate, targetEndDate));
