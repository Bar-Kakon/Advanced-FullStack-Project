import { Types } from 'mongoose';

import { calendarWithExceptions, dateKey, type ScheduleCalendar } from '../calendar/workingDay.js';
import type { WorkingCalendarConfig } from '../calendar/workingCalendar.types.js';
import type { ScheduleExceptionRecord } from './scheduleException.model.js';

const MS_PER_DAY = 86_400_000;
/** A single request may not cover more than a year, which also bounds this expansion. */
const MAX_SPAN_DAYS = 400;

/**
 * Who a resolved calendar is being built for.
 *
 * A project-scoped exception reaches every piece of work on the job. A task-scoped one reaches only
 * that task. A professional-scoped one reaches the work that professional is responsible for. So
 * the same project produces different calendars for different tasks, and the answer depends on
 * which task is being asked about rather than on the project alone.
 */
export interface CalendarSubject {
  readonly taskId?: string;
  readonly professionalId?: string;
}

const SPECIFICITY = { project: 0, professional: 1, task: 2 } as const;

const applies = (row: ScheduleExceptionRecord, subject: CalendarSubject): boolean => {
  if (row.scope === 'project') return true;
  if (row.scope === 'task') return row.task?.toString() === subject.taskId;
  return row.professional?.toString() === subject.professionalId;
};

/**
 * Expands approved rows into one answer per date.
 *
 * Where two approved rows cover the same day, the more specific one wins — a task exception over a
 * professional's, a professional's over the whole project's — because the narrower row is the one
 * somebody asked for about this particular work. Two rows of equal specificity are settled by
 * approval time, so the later decision stands.
 */
export const resolveExceptionDays = (
  rows: readonly ScheduleExceptionRecord[],
  subject: CalendarSubject,
): ReadonlyMap<string, boolean> => {
  const chosen = new Map<string, { working: boolean; rank: number; at: number }>();

  for (const row of rows) {
    if (row.status !== 'approved' || !applies(row, subject)) continue;

    const rank = SPECIFICITY[row.scope];
    const at = (row.approvedAt ?? row.requestedAt).getTime();
    const working = row.kind === 'working';

    const span = Math.floor((row.toDate.getTime() - row.fromDate.getTime()) / MS_PER_DAY);
    for (let day = 0; day <= Math.min(span, MAX_SPAN_DAYS); day += 1) {
      const key = dateKey(new Date(row.fromDate.getTime() + day * MS_PER_DAY));
      const held = chosen.get(key);
      if (held !== undefined && (held.rank > rank || (held.rank === rank && held.at > at))) continue;
      chosen.set(key, { working, rank, at });
    }
  }

  return new Map([...chosen].map(([key, value]) => [key, value.working]));
};

export const calendarFor = (
  config: WorkingCalendarConfig,
  rows: readonly ScheduleExceptionRecord[],
  subject: CalendarSubject,
): ScheduleCalendar => calendarWithExceptions(config, resolveExceptionDays(rows, subject));

/**
 * The per-task calendars of one project in a single pass, so a cascade over fifty tasks costs one
 * read rather than fifty.
 */
export const calendarsForTasks = (
  config: WorkingCalendarConfig,
  rows: readonly ScheduleExceptionRecord[],
  tasks: readonly { readonly id: string; readonly assignee?: Types.ObjectId }[],
): ReadonlyMap<string, ScheduleCalendar> =>
  new Map(
    tasks.map((task) => [
      task.id,
      calendarFor(config, rows, {
        taskId: task.id,
        ...(task.assignee === undefined ? {} : { professionalId: task.assignee.toString() }),
      }),
    ]),
  );
