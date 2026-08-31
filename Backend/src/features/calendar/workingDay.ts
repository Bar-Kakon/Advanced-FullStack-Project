import { WEEKDAYS, type Weekday, type WorkingCalendarConfig } from './workingCalendar.types.js';

/**
 * The one place a date is judged working or not.
 *
 * A schedule calendar is the weekly pattern plus the approved one-off exceptions that override it
 * on named dates. Every arithmetic function below takes the pair, so no caller can compute against
 * the pattern alone and quietly disagree with the calendar the project actually keeps.
 */
export interface ScheduleCalendar {
  readonly config: WorkingCalendarConfig;
  /** Calendar date to whether that single day is working. Absent means the pattern decides. */
  readonly exceptions: ReadonlyMap<string, boolean>;
}

export const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

/** A calendar with no exceptions. For callers where none exist, never where none were loaded. */
export const plainCalendar = (config: WorkingCalendarConfig): ScheduleCalendar => ({
  config,
  exceptions: new Map(),
});

export const calendarWithExceptions = (
  config: WorkingCalendarConfig,
  exceptions: ReadonlyMap<string, boolean>,
): ScheduleCalendar => ({ config, exceptions });

export const weekdayOf = (date: Date): Weekday => {
  const day = WEEKDAYS[date.getUTCDay()];
  if (day === undefined) throw new Error('A date resolved to no weekday.');
  return day;
};

/** The weekly pattern alone, before any exception is considered. */
export const matchesWeeklyPattern = (config: WorkingCalendarConfig, date: Date): boolean =>
  config.workingDays.includes(weekdayOf(date));

export const isWorkingDay = (calendar: ScheduleCalendar, date: Date): boolean =>
  calendar.exceptions.get(dateKey(date)) ?? matchesWeeklyPattern(calendar.config, date);

const MS_PER_DAY = 86_400_000;
const SEARCH_LIMIT = 3650;

export class NoWorkingDaysError extends Error {
  constructor() {
    super('The calendar names no working day, so no schedule can be computed from it.');
  }
}

const step = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY);

export const nextWorkingDayOnOrAfter = (calendar: ScheduleCalendar, date: Date): Date => {
  let cursor = date;
  for (let i = 0; i <= SEARCH_LIMIT; i += 1) {
    if (isWorkingDay(calendar, cursor)) return cursor;
    cursor = step(cursor, 1);
  }
  throw new NoWorkingDaysError();
};

export const addWorkingDays = (
  calendar: ScheduleCalendar,
  from: Date,
  days: number,
): Date => {
  let cursor = nextWorkingDayOnOrAfter(calendar, from);
  for (let moved = 0; moved < days; moved += 1) {
    cursor = nextWorkingDayOnOrAfter(calendar, step(cursor, 1));
  }
  return cursor;
};

export const workingDaysBetween = (
  calendar: ScheduleCalendar,
  from: Date,
  to: Date,
): number => {
  if (to.getTime() < from.getTime()) return 0;

  let count = 0;
  let cursor = from;
  for (let i = 0; i <= SEARCH_LIMIT && cursor.getTime() <= to.getTime(); i += 1) {
    if (isWorkingDay(calendar, cursor)) count += 1;
    cursor = step(cursor, 1);
  }
  return count;
};

export const dueFromWorkingDays = (
  calendar: ScheduleCalendar,
  start: Date,
  workingDays: number,
): Date => addWorkingDays(calendar, start, Math.max(1, workingDays) - 1);
