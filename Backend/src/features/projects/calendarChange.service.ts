import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { configOrDefault, type CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import {
  resolveEffectiveCalendar,
  type WorkingCalendarConfig,
  type WorkingCalendarOverrides,
} from '../calendar/workingCalendar.types.js';
import type { AuditAction } from '../coordination/auditEntry.model.js';
import type { AuditRepository } from '../coordination/audit.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type { CalendarChangeGuard } from './calendarChangeGuard.js';
import {
  calendarChangeNeedsApproval,
  calendarChangedConcurrently,
  calendarVersionMissing,
  projectNotFound,
} from './project.errors.js';
import type { ProjectRecord } from './project.model.js';
import type { CalendarStateOperation, ProjectRepository } from './project.repository.js';
import { requireProjectPermission, type ResolvedProjectAccess } from './projectAuthorization.js';
import type { ScheduleWrites } from './scheduleWrites.js';

export interface CalendarActor {
  readonly id: Types.ObjectId;
  readonly access: ResolvedProjectAccess;
}

export interface CalendarChangeService {
  adopt(actor: CalendarActor, project: ProjectRecord, keepOverrides: boolean): Promise<ProjectRecord>;
  setOverrides(
    actor: CalendarActor,
    project: ProjectRecord,
    overrides: WorkingCalendarOverrides,
  ): Promise<ProjectRecord>;
}

export interface CalendarChangeDependencies {
  readonly projects: Pick<ProjectRepository, 'writeCalendarState'>;
  readonly calendars: Pick<CompanyCalendarRepository, 'findById' | 'findCurrent'>;
  readonly guard: Pick<CalendarChangeGuard, 'assess'>;
  readonly audit: Pick<AuditRepository, 'append'>;
  readonly names: Pick<UserRepository, 'findDisplayNames'>;
  readonly schedule: Pick<ScheduleWrites, 'run'>;
}

interface PlannedChange {
  readonly before: WorkingCalendarConfig | null;
  readonly after: WorkingCalendarConfig;
  readonly operation: CalendarStateOperation;
  readonly action: AuditAction;
  readonly details: Record<string, unknown>;
}

const sameCalendarState = (a: ProjectRecord, b: ProjectRecord): boolean =>
  a.calendarVersion.equals(b.calendarVersion) &&
  JSON.stringify(a.calendarOverrides ?? null) === JSON.stringify(b.calendarOverrides ?? null);

export const createCalendarChangeService = ({
  projects,
  calendars,
  guard,
  audit,
  names,
  schedule,
}: CalendarChangeDependencies): CalendarChangeService => {
  const record = async (
    actor: Types.ObjectId,
    project: ProjectRecord,
    action: AuditAction,
    details: Record<string, unknown>,
    session: DbSession,
  ): Promise<void> => {
    const actorName = (await names.findDisplayNames([actor])).get(actor.toString()) ?? '';
    await audit.append(
      [{ project: project._id, actor, actorName, action, parties: [], details, partyDetails: {} }],
      session,
    );
  };

  const apply = async (
    actor: CalendarActor,
    loaded: ProjectRecord,
    plan: (current: ProjectRecord) => Promise<PlannedChange>,
  ): Promise<ProjectRecord> => {
    requireProjectPermission(actor.access, 'project.calendar.manage');

    return schedule.run(loaded._id, async (session, claimed) => {
      if (!sameCalendarState(loaded, claimed)) throw calendarChangedConcurrently();

      const change = await plan(claimed);
      const impact = await guard.assess(claimed, change.before, change.after, (claimed.scheduleRevision ?? 1) - 1);
      if (impact.lock !== null) throw calendarChangeNeedsApproval(impact.lock);

      const written = await projects.writeCalendarState(claimed._id, change.operation, session);
      if (written === null) throw projectNotFound();
      await record(actor.id, claimed, change.action, { ...change.details, internalTasksAffected: impact.internal }, session);
      return written;
    });
  };

  return {
    async adopt(actor, project, keepOverrides) {
      return apply(actor, project, async (current) => {
        const [pinned, latest] = await Promise.all([
          calendars.findById(current.calendarVersion),
          calendars.findCurrent(current.company),
        ]);
        if (latest === null) throw calendarVersionMissing();

        return {
          before: pinned === null ? null : resolveEffectiveCalendar(pinned.config, current.calendarOverrides),
          after: resolveEffectiveCalendar(latest.config, keepOverrides ? current.calendarOverrides : undefined),
          operation: {
            set: { calendarVersion: latest._id },
            unsetOverrides: !keepOverrides && current.calendarOverrides !== undefined,
            pushAdoption: {
              fromVersion: current.calendarVersion,
              toVersion: latest._id,
              adoptedAt: new Date(),
              adoptedBy: actor.id,
              overridesKept: keepOverrides,
            },
          },
          action: 'project.calendar_adopted',
          details: {
            fromVersion: pinned?.version ?? null,
            toVersion: latest.version,
            overridesKept: keepOverrides,
          },
        };
      });
    },

    async setOverrides(actor, project, overrides) {
      return apply(actor, project, async (current) => {
        const pinned = await calendars.findById(current.calendarVersion);

        return {
          before: pinned === null ? null : resolveEffectiveCalendar(pinned.config, current.calendarOverrides),
          after: resolveEffectiveCalendar(configOrDefault(pinned), overrides),
          operation: { set: { calendarOverrides: overrides } },
          action: 'project.calendar_overrides_changed',
          details: { before: current.calendarOverrides ?? null, after: overrides },
        };
      });
    },
  };
};
