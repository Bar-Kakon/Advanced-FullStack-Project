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
