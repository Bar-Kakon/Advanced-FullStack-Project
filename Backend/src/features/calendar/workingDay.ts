import { WEEKDAYS, type Weekday, type WorkingCalendarConfig } from './workingCalendar.types.js';

/**
 * The weekly pattern only. Holidays are a separate concept with no approved data source yet, so
 * nothing here claims to know about them.
 */
export const weekdayOf = (date: Date): Weekday => {
  const day = WEEKDAYS[date.getUTCDay()];
  if (day === undefined) throw new Error('A date resolved to no weekday.');
  return day;
};

export const isWorkingDay = (config: WorkingCalendarConfig, date: Date): boolean =>
  config.workingDays.includes(weekdayOf(date));

const MS_PER_DAY = 86_400_000;
const SEARCH_LIMIT = 3650;

export class NoWorkingDaysError extends Error {
  constructor() {
    super('The calendar names no working day, so no schedule can be computed from it.');
  }
}

const step = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY);

export const nextWorkingDayOnOrAfter = (config: WorkingCalendarConfig, date: Date): Date => {
  let cursor = date;
  for (let i = 0; i <= SEARCH_LIMIT; i += 1) {
    if (isWorkingDay(config, cursor)) return cursor;
    cursor = step(cursor, 1);
  }
  throw new NoWorkingDaysError();
};

export const addWorkingDays = (
  config: WorkingCalendarConfig,
  from: Date,
  days: number,
): Date => {
  let cursor = nextWorkingDayOnOrAfter(config, from);
  for (let moved = 0; moved < days; moved += 1) {
    cursor = nextWorkingDayOnOrAfter(config, step(cursor, 1));
  }
  return cursor;
};

export const workingDaysBetween = (
  config: WorkingCalendarConfig,
  from: Date,
  to: Date,
): number => {
  if (to.getTime() < from.getTime()) return 0;

  let count = 0;
  let cursor = from;
  for (let i = 0; i <= SEARCH_LIMIT && cursor.getTime() <= to.getTime(); i += 1) {
    if (isWorkingDay(config, cursor)) count += 1;
    cursor = step(cursor, 1);
  }
  return count;
};

export const dueFromWorkingDays = (
  config: WorkingCalendarConfig,
  start: Date,
  workingDays: number,
): Date => addWorkingDays(config, start, Math.max(1, workingDays) - 1);
