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
} from './project.errors.js';
import type { ProjectRecord } from './project.model.js';
import type { CalendarStateOperation, ProjectRepository } from './project.repository.js';

export interface CalendarChangeService {
  adopt(actor: Types.ObjectId, project: ProjectRecord, keepOverrides: boolean): Promise<ProjectRecord>;
  setOverrides(
    actor: Types.ObjectId,
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
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
}

interface PlannedChange {
  readonly before: WorkingCalendarConfig | null;
  readonly after: WorkingCalendarConfig;
  readonly forward: CalendarStateOperation;
  readonly backward: CalendarStateOperation;
  readonly action: AuditAction;
  readonly details: Record<string, unknown>;
}

export const createCalendarChangeService = ({
  projects,
  calendars,
  guard,
  audit,
  names,
  transactions,
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
    actor: Types.ObjectId,
    project: ProjectRecord,
    change: PlannedChange,
  ): Promise<ProjectRecord> => {
    const before = await guard.assess(project, change.before, change.after);
    if (before.lock !== null) throw calendarChangeNeedsApproval(before.lock);

    const written = await transactions.run(async (session) => {
      const row = await projects.writeCalendarState(project._id, project.updatedAt, change.forward, session);
      if (row === null) throw calendarChangedConcurrently();
      await record(actor, project, change.action, { ...change.details, internalTasksAffected: before.internal }, session);
      return row;
    });

    const after = await guard.assess(project, change.before, change.after);
    if (after.lock === null) return written;

    const reverted = await transactions.run(async (session) => {
      const row = await projects.writeCalendarState(project._id, written.updatedAt, change.backward, session);
      if (row === null) return false;
      await record(
        actor,
        project,
        'project.calendar_change_reverted',
        {
          reverted: change.action,
          reason: after.lock,
          internal: after.internal,
          external: after.external,
          responsibility: after.responsibility,
          proposals: after.proposals,
        },
        session,
      );
      return true;
    });

    if (!reverted) throw calendarChangedConcurrently();
    throw calendarChangeNeedsApproval(after.lock);
  };

  return {
    async adopt(actor, project, keepOverrides) {
      const [pinned, current] = await Promise.all([
        calendars.findById(project.calendarVersion),
        calendars.findCurrent(project.company),
      ]);
      if (current === null) throw calendarVersionMissing();

      const dropsOverrides = !keepOverrides && project.calendarOverrides !== undefined;

      return apply(actor, project, {
        before: pinned === null ? null : resolveEffectiveCalendar(pinned.config, project.calendarOverrides),
        after: resolveEffectiveCalendar(current.config, keepOverrides ? project.calendarOverrides : undefined),
        forward: {
          set: { calendarVersion: current._id },
          unsetOverrides: dropsOverrides,
          pushAdoption: {
            fromVersion: project.calendarVersion,
            toVersion: current._id,
            adoptedAt: new Date(),
            adoptedBy: actor,
            overridesKept: keepOverrides,
          },
        },
        backward: {
          set: {
            calendarVersion: project.calendarVersion,
            ...(dropsOverrides && project.calendarOverrides !== undefined
              ? { calendarOverrides: project.calendarOverrides }
              : {}),
          },
          popAdoption: true,
        },
        action: 'project.calendar_adopted',
        details: {
          fromVersion: pinned?.version ?? null,
          toVersion: current.version,
          overridesKept: keepOverrides,
        },
      });
    },

    async setOverrides(actor, project, overrides) {
      const pinned = await calendars.findById(project.calendarVersion);

      return apply(actor, project, {
        before: pinned === null ? null : resolveEffectiveCalendar(pinned.config, project.calendarOverrides),
        after: resolveEffectiveCalendar(configOrDefault(pinned), overrides),
        forward: { set: { calendarOverrides: overrides } },
        backward:
          project.calendarOverrides === undefined
            ? { unsetOverrides: true }
            : { set: { calendarOverrides: project.calendarOverrides } },
        action: 'project.calendar_overrides_changed',
        details: { before: project.calendarOverrides ?? null, after: overrides },
      });
    },
  };
};
