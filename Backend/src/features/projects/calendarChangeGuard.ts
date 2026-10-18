import type { Types } from 'mongoose';

import type { CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { isWorkingDay, type ScheduleCalendar } from '../calendar/workingDay.js';
import {
  WEEKDAYS,
  resolveEffectiveCalendar,
  type WorkingCalendarConfig,
} from '../calendar/workingCalendar.types.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { ProposalRecord } from '../coordination/proposal.model.js';
import type { ProposalRepository } from '../coordination/proposal.repository.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { calendarFor } from '../scheduleexceptions/exceptionCalendar.js';
import type { ScheduleExceptionRepository } from '../scheduleexceptions/scheduleException.repository.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import type { ProjectRecord } from './project.model.js';

export type CalendarChangeLock = 'external' | 'proposals' | 'responsibility';

export interface CalendarChangeImpact {
  readonly internal: number;
  readonly external: number;
  readonly responsibility: number;
  readonly proposals: number;
  readonly lock: CalendarChangeLock | null;
}

export interface AdoptionImpactPreview {
  readonly keepOverrides: CalendarChangeImpact;
  readonly dropOverrides: CalendarChangeImpact | null;
}

export interface CalendarChangeGuard {
  /** `before` is `null` when the pinned version cannot be read. */
  assess(
    project: ProjectRecord,
    before: WorkingCalendarConfig | null,
    after: WorkingCalendarConfig,
  ): Promise<CalendarChangeImpact>;
  /** What adopting the company's current version would do; `null` when the project is current. */
  previewAdoption(project: ProjectRecord): Promise<AdoptionImpactPreview | null>;
}

export interface CalendarChangeGuardDependencies {
  readonly calendars: Pick<CompanyCalendarRepository, 'findById' | 'findCurrent'>;
  readonly tasks: Pick<TaskRepository, 'listLiveAssignedInProject'>;
  readonly proposals: Pick<ProposalRepository, 'listForProject'>;
  readonly exceptions: Pick<ScheduleExceptionRepository, 'listApproved'>;
  readonly companyMemberships: Pick<CompanyMembershipRepository, 'listByCompany'>;
  readonly projectMembers: Pick<ProjectAccessRepository, 'listMembers'>;
  readonly now?: () => Date;
}

const MS_PER_DAY = 86_400_000;
const MAX_WINDOW_DAYS = 730;
const PROPOSAL_SCAN_LIMIT = 500;
const UNRESOLVED_PROPOSALS: ReadonlySet<string> = new Set(['requested', 'open', 'expired']);

const NO_IMPACT: CalendarChangeImpact = {
  internal: 0,
  external: 0,
  responsibility: 0,
  proposals: 0,
  lock: null,
};

const UNDETERMINED: CalendarChangeImpact = { ...NO_IMPACT, lock: 'responsibility' };

const startOfUtcDay = (at: Date): Date =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

const later = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);

const sameWorkingDays = (a: WorkingCalendarConfig, b: WorkingCalendarConfig): boolean =>
  WEEKDAYS.every((day) => a.workingDays.includes(day) === b.workingDays.includes(day));

const sameHours = (a: WorkingCalendarConfig, b: WorkingCalendarConfig): boolean =>
  a.hours.startMinute === b.hours.startMinute && a.hours.endMinute === b.hours.endMinute;

/** `true` when a day in the window changes for this work, `null` when that cannot be determined. */
const windowChanges = (
  before: ScheduleCalendar,
  after: ScheduleCalendar,
  from: Date,
  to: Date,
  hoursChanged: boolean,
): boolean | null => {
  if (to.getTime() < from.getTime()) return false;
  if ((to.getTime() - from.getTime()) / MS_PER_DAY > MAX_WINDOW_DAYS) return null;

  for (let at = from.getTime(); at <= to.getTime(); at += MS_PER_DAY) {
    const day = new Date(at);
    const was = isWorkingDay(before, day);
    const will = isWorkingDay(after, day);
    if (was !== will || (hoursChanged && (was || will))) return true;
  }
  return false;
};

const datesOf = (proposal: ProposalRecord): Date[] => {
  const dates: (Date | undefined)[] = [
    proposal.changes.alternativeStart,
    proposal.changes.alternativeDue,
    proposal.alternativesContext?.earliestStart,
    proposal.alternativesContext?.latestFinishForWork,
    proposal.alternativesContext?.latestFinishForChain,
  ];
  for (const item of proposal.items) {
    dates.push(item.currentStart, item.currentDue, item.proposedStart, item.proposedDue);
    dates.push(item.counterStart, item.counterDue);
  }
  return dates.filter((date): date is Date => date instanceof Date);
};

export const createCalendarChangeGuard = ({
  calendars,
  tasks,
  proposals,
  exceptions,
  companyMemberships,
  projectMembers,
  now = () => new Date(),
}: CalendarChangeGuardDependencies): CalendarChangeGuard => {
  const assess: CalendarChangeGuard['assess'] = async (project, before, after) => {
    if (before === null) return UNDETERMINED;

    const hoursChanged = !sameHours(before, after);
    if (sameWorkingDays(before, after) && !hoursChanged) return NO_IMPACT;

    const today = startOfUtcDay(now());
    const [live, exceptionRows, proposalRows, companyRows, memberRows] = await Promise.all([
      tasks.listLiveAssignedInProject(project._id),
      exceptions.listApproved(project._id),
      proposals.listForProject(project._id, PROPOSAL_SCAN_LIMIT),
      companyMemberships.listByCompany(project.company),
      projectMembers.listMembers(project._id),
    ]);

    const calendarsOf = (taskId: Types.ObjectId, professional: Types.ObjectId | undefined) => {
      const subject = {
        taskId: taskId.toString(),
        ...(professional === undefined ? {} : { professionalId: professional.toString() }),
      };
      return [calendarFor(before, exceptionRows, subject), calendarFor(after, exceptionRows, subject)] as const;
    };

    const insiders = new Set(
      companyRows
        .filter((row) => row.status === 'active' && row.user !== null)
        .map((row) => (row.user as Types.ObjectId).toString()),
    );
    const participants = new Map(
      memberRows.filter((row) => row.status === 'active').map((row) => [row.user.toString(), row]),
    );

    const classify = (assignee: Types.ObjectId): 'internal' | 'external' | 'responsibility' => {
      if (insiders.has(assignee.toString())) return 'internal';
      const membership = participants.get(assignee.toString());
      if (membership !== undefined && !membership.company?.equals(project.company)) return 'external';
      return 'responsibility';
    };

    const counts = { internal: 0, external: 0, responsibility: 0 };
    for (const task of live) {
      if (task.assignee === undefined || task.assignee === null) continue;
      const due = startOfUtcDay(task.dueDate);
      const [was, will] = calendarsOf(task._id, task.assignee);
      const affected =
        due.getTime() < today.getTime() ||
        windowChanges(was, will, later(today, startOfUtcDay(task.startDate)), due, hoursChanged) !== false;
      if (affected) counts[classify(task.assignee)] += 1;
    }

    let affectedProposals = 0;
    for (const proposal of proposalRows) {
      if (!UNRESOLVED_PROPOSALS.has(proposal.status)) continue;
      const dates = datesOf(proposal);
      const last = dates.length === 0 ? null : startOfUtcDay(new Date(Math.max(...dates.map((d) => d.getTime()))));
      if (last === null || last.getTime() < today.getTime() || proposal.items.length === 0) {
        affectedProposals += 1;
        continue;
      }
      const first = later(today, startOfUtcDay(new Date(Math.min(...dates.map((d) => d.getTime())))));
      const touched = proposal.items.some((item) => {
        const [was, will] = calendarsOf(item.task, item.respondent);
        return windowChanges(was, will, first, last, hoursChanged) !== false;
      });
      if (touched) affectedProposals += 1;
    }

    const lock: CalendarChangeLock | null =
      counts.external > 0 ? 'external'
      : affectedProposals > 0 ? 'proposals'
      : counts.responsibility > 0 ? 'responsibility'
      : null;

    return { ...counts, proposals: affectedProposals, lock };
  };

  return {
    assess,

    async previewAdoption(project) {
      const [pinned, current] = await Promise.all([
        calendars.findById(project.calendarVersion),
        calendars.findCurrent(project.company),
      ]);
      if (current === null || current._id.equals(project.calendarVersion)) return null;

      const before = pinned === null ? null : resolveEffectiveCalendar(pinned.config, project.calendarOverrides);
      const keepOverrides = await assess(
        project,
        before,
        resolveEffectiveCalendar(current.config, project.calendarOverrides),
      );
      const dropOverrides =
        project.calendarOverrides === undefined ? null : await assess(project, before, current.config);

      return { keepOverrides, dropOverrides };
    },
  };
};
