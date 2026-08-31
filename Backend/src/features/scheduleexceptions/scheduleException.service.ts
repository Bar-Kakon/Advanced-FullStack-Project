import { Types } from 'mongoose';

import { configOrDefault, type CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { resolveEffectiveCalendar } from '../calendar/workingCalendar.types.js';
import { isWorkingDay, dateKey } from '../calendar/workingDay.js';
import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import { projectNotFound } from '../projects/project.errors.js';
import type { ProjectRecord } from '../projects/project.model.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import {
  hasProjectPermission,
  requireActiveCompany,
  resolveProjectAccess,
  type ResolvedProjectAccess,
} from '../projects/projectAuthorization.js';
import { TaskModel, type TaskRecord } from '../tasks/task.model.js';
import { calendarFor } from './exceptionCalendar.js';
import {
  alreadyDecided,
  exceptionNotFound,
  invalidWindow,
  notPermittedToApprove,
  notResponsibleForTask,
  onlyApproverMayModify,
  onlySubmitterMayCancel,
  projectScopeNeedsAuthority,
  windowTooLong,
} from './scheduleException.errors.js';
import type {
  EffectiveDayDto,
  ScheduleExceptionDto,
  ScheduleExceptionListDto,
} from './scheduleException.dto.js';
import type {
  ExceptionKind,
  ExceptionScope,
  ScheduleExceptionRecord,
} from './scheduleException.model.js';
import type { ScheduleExceptionRepository } from './scheduleException.repository.js';

const MS_PER_DAY = 86_400_000;
const MAX_WINDOW_DAYS = 365;
/** How far ahead the calendar view resolves days. One quarter is what a screen can usefully draw. */
const EFFECTIVE_HORIZON_DAYS = 120;

export interface RequestExceptionInput {
  readonly kind: ExceptionKind;
  readonly scope: ExceptionScope;
  readonly taskId?: string;
  readonly fromDate: Date;
  readonly toDate: Date;
  readonly reason?: string;
}

export interface ModifyExceptionInput {
  readonly kind?: ExceptionKind;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly note?: string;
}

export interface ScheduleExceptionService {
  list(userId: string, projectId: string): Promise<ScheduleExceptionListDto>;
  request(
    userId: string,
    projectId: string,
    input: RequestExceptionInput,
  ): Promise<ScheduleExceptionDto>;
  modify(userId: string, exceptionId: string, input: ModifyExceptionInput): Promise<ScheduleExceptionDto>;
  decide(
    userId: string,
    exceptionId: string,
    approve: boolean,
    note?: string,
  ): Promise<ScheduleExceptionDto>;
  cancel(userId: string, exceptionId: string): Promise<ScheduleExceptionDto>;
}

export interface ScheduleExceptionDependencies {
  readonly exceptions: ScheduleExceptionRepository;
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly participants: ParticipantRepository;
  readonly calendars: CompanyCalendarRepository;
  readonly companyContext: CompanyContextService;
  readonly notifications: NotificationDispatchService;
}

const iso = (value: Date): string => value.toISOString().slice(0, 10);

export const createScheduleExceptionService = ({
  exceptions,
  projects,
  access,
  participants,
  calendars,
  companyContext,
  notifications,
}: ScheduleExceptionDependencies): ScheduleExceptionService => {
  const reachProject = async (
    userId: string,
    projectId: string,
  ): Promise<{ project: ProjectRecord; resolved: ResolvedProjectAccess }> => {
    const authority = requireActiveCompany(await companyContext.forUser(userId), userId);
    const memberOf = await access.listActiveProjectIdsForUser(new Types.ObjectId(userId));
    const project = await projects.findAccessibleById(
      projectId,
      new Types.ObjectId(authority.companyId),
      memberOf,
    );
    if (project === null) throw projectNotFound();

    const resolved = await resolveProjectAccess({
      projectId: project._id,
      projectCompany: project.company,
      userId: new Types.ObjectId(userId),
      authority,
      access,
    });
    return { project, resolved };
  };

  const namesOf = async (ids: readonly Types.ObjectId[]): Promise<Map<string, string>> => {
    const unique = [...new Map(ids.map((id) => [id.toString(), id])).values()];
    const people = await participants.findByIds(unique);
    return new Map(
      people.map((row) => [row._id.toString(), `${row.firstName} ${row.lastName}`.trim()]),
    );
  };

  const toDto = async (
    row: ScheduleExceptionRecord,
    viewerId: string,
    mayApprove: boolean,
    taskTitle: string | null,
  ): Promise<ScheduleExceptionDto> => {
    const names = await namesOf([
      row.requestedBy,
      ...(row.professional === undefined ? [] : [row.professional]),
      ...(row.approvedBy === undefined ? [] : [row.approvedBy]),
      ...(row.rejectedBy === undefined ? [] : [row.rejectedBy]),
      ...row.history.map((entry) => entry.by),
    ]);
    const nameOf = (id: Types.ObjectId): string => names.get(id.toString()) ?? '';
    const decidedBy = row.approvedBy ?? row.rejectedBy;
    const pending = row.status === 'requested';

    return {
      id: row._id.toString(),
      projectId: row.project.toString(),
      kind: row.kind,
      scope: row.scope,
      taskId: row.task?.toString() ?? null,
      taskTitle,
      professionalId: row.professional?.toString() ?? null,
      professionalName: row.professional === undefined ? null : nameOf(row.professional),
      fromDate: iso(row.fromDate),
      toDate: iso(row.toDate),
      reason: row.reason ?? null,
      status: row.status,
      requestedByName: nameOf(row.requestedBy),
      requestedAt: row.requestedAt.toISOString(),
      decidedByName: decidedBy === undefined ? null : nameOf(decidedBy),
      decidedAt: (row.approvedAt ?? row.rejectedAt)?.toISOString() ?? null,
      decisionNote: row.decisionNote ?? null,
      history: row.history.map((entry) => ({
        action: entry.action,
        byName: nameOf(entry.by),
        at: entry.at.toISOString(),
        note: entry.note ?? null,
        fromDate: entry.fromDate === undefined ? null : iso(entry.fromDate),
        toDate: entry.toDate === undefined ? null : iso(entry.toDate),
        kind: entry.kind ?? null,
      })),
      canApprove: pending && mayApprove,
      canModify: pending && mayApprove,
      canCancel: pending && row.requestedBy.toString() === viewerId,
    };
  };

  const loadDecidable = async (
    userId: string,
    exceptionId: string,
  ): Promise<{
    row: ScheduleExceptionRecord;
    project: ProjectRecord;
    resolved: ResolvedProjectAccess;
    mayApprove: boolean;
  }> => {
    const row = await exceptions.findById(exceptionId);
    if (row === null) throw exceptionNotFound();

    const { project, resolved } = await reachProject(userId, row.project.toString());
    return {
      row,
      project,
      resolved,
      mayApprove: hasProjectPermission(resolved, 'schedule.exception.approve'),
    };
  };

  const titleOf = async (taskId: Types.ObjectId | undefined): Promise<string | null> => {
    if (taskId === undefined) return null;
    const task = await TaskModel.findById(taskId).select('title').lean<{ title: string }>().exec();
    return task?.title ?? null;
  };

  /**
   * The closed routing rule, in full.
   *
   * On approval a derived notice goes to each affected professional, carrying only what is
   * relevant to them, and only after the original was approved. A request affecting nobody else
   * reaches the approver alone, and a rejection reaches the submitter alone.
   */
  const notifyDecision = async (
    row: ScheduleExceptionRecord,
    project: ProjectRecord,
    approved: boolean,
  ): Promise<void> => {
    const key = row._id.toString();
    const payload = {
      projectName: project.name,
      fromDate: iso(row.fromDate),
      toDate: iso(row.toDate),
    };

    await notifications.emit({
      userId: row.requestedBy,
      type: 'schedule.exception.decided',
      projectId: project._id,
      scheduleExceptionId: row._id,
      payload,
      dedupeKey: `schedule.exception.decided:${key}`,
    });
    if (!approved) return;

    // Who the approved dates actually reach: live work whose window overlaps the exception. A
    // project-wide row touches every professional on the job; a narrower one only the work it
    // names. Finished and orphaned work is excluded — its dates are already frozen.
    const scoped: Record<string, unknown> = {
      completedAt: { $exists: false },
      orphanedAt: { $exists: false },
      dueDate: { $gte: row.fromDate },
      startDate: { $lte: row.toDate },
    };
    if (row.scope === 'task') scoped['_id'] = row.task;
    else {
      scoped['project'] = project._id;
      if (row.scope === 'professional') scoped['assignee'] = row.professional;
    }

    const affected = await TaskModel.find(scoped)
      .select('assignee')
      .lean<{ assignee?: Types.ObjectId }[]>()
      .exec();

    const recipients = new Map<string, Types.ObjectId>();
    for (const task of affected) {
      if (task.assignee === undefined) continue;
      // The submitter already has the decision notice; a second row would say the same thing twice.
      if (task.assignee.toString() === row.requestedBy.toString()) continue;
      recipients.set(task.assignee.toString(), task.assignee);
    }

    await notifications.emitMany(
      [...recipients.values()].map((userId) => ({
        userId,
        type: 'schedule.exception.affects_you' as const,
        projectId: project._id,
        scheduleExceptionId: row._id,
        payload,
        dedupeKey: `schedule.exception.affects_you:${key}:${userId.toString()}`,
      })),
    );
  };

  return {
    async list(userId, projectId) {
      const { project, resolved } = await reachProject(userId, projectId);
      const mayApprove = hasProjectPermission(resolved, 'schedule.exception.approve');

      const rows = await exceptions.listForProject(project._id);
      const titles = new Map<string, string | null>();
      for (const row of rows) {
        if (row.task === undefined) continue;
        titles.set(row.task.toString(), await titleOf(row.task));
      }

      const version = await calendars.findById(project.calendarVersion);
      const config = resolveEffectiveCalendar(configOrDefault(version), project.calendarOverrides);
      const calendar = calendarFor(config, rows, { professionalId: userId });

      // Resolved for the viewer's own work, so the days a screen draws are the days that person is
      // actually scheduled by rather than a generic project answer.
      const effectiveDays: EffectiveDayDto[] = [];
      const start = Date.now();
      for (let day = 0; day < EFFECTIVE_HORIZON_DAYS; day += 1) {
        const date = new Date(start + day * MS_PER_DAY);
        const key = dateKey(date);
        const overridden = calendar.exceptions.has(key);
        if (overridden) effectiveDays.push({ date: key, working: isWorkingDay(calendar, date) });
      }

      return {
        exceptions: await Promise.all(
          rows.map((row) =>
            toDto(row, userId, mayApprove, row.task === undefined ? null : titles.get(row.task.toString()) ?? null),
          ),
        ),
        mayApprove,
        effectiveDays,
      };
    },

    async request(userId, projectId, input) {
      if (input.toDate < input.fromDate) throw invalidWindow();
      if ((input.toDate.getTime() - input.fromDate.getTime()) / MS_PER_DAY > MAX_WINDOW_DAYS) {
        throw windowTooLong();
      }

      const { project, resolved } = await reachProject(userId, projectId);
      const mayApprove = hasProjectPermission(resolved, 'schedule.exception.approve');
      const requester = new Types.ObjectId(userId);

      let task: TaskRecord | null = null;
      if (input.scope === 'task') {
        if (input.taskId === undefined || !Types.ObjectId.isValid(input.taskId)) {
          throw exceptionNotFound();
        }
        task = await TaskModel.findOne({ _id: input.taskId, project: project._id })
          .lean<TaskRecord>()
          .exec();
        if (task === null) throw exceptionNotFound();
        // A task exception is still a request about one's own work, so the responsible party is
        // the only person who may raise it — the approver's own authority is a separate question.
        if (task.assignee?.toString() !== userId && !mayApprove) throw notResponsibleForTask();
      }

      // A project-wide exception is not "for oneself", so it is not something the professional
      // requester rule opens. It belongs to whoever may approve one.
      if (input.scope === 'project' && !mayApprove) throw projectScopeNeedsAuthority();

      const created = await exceptions.create({
        project: project._id,
        kind: input.kind,
        scope: input.scope,
        ...(task === null ? {} : { task: task._id }),
        // Never read from the request body: a professional may only ever name themself.
        ...(input.scope === 'project' ? {} : { professional: requester }),
        fromDate: input.fromDate,
        toDate: input.toDate,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        requestedBy: requester,
      });

      // Where nobody else is affected the request reaches only the approver — which is exactly who
      // is notified here. Everyone else hears about it on approval, and not before.
      const approvers = await access.listMembers(project._id);
      const toNotify = approvers.filter(
        (row) =>
          row.status === 'active' &&
          row.user.toString() !== userId &&
          (row.fullAuthority || row.permissions.includes('schedule.exception.approve')),
      );

      await notifications.emitMany(
        toNotify.map((row) => ({
          userId: row.user,
          type: 'schedule.exception.awaiting_approval' as const,
          projectId: project._id,
          scheduleExceptionId: created._id,
          payload: {
            projectName: project.name,
            fromDate: iso(created.fromDate),
            toDate: iso(created.toDate),
          },
          dedupeKey: `schedule.exception.awaiting_approval:${created._id.toString()}:${row.user.toString()}`,
        })),
      );

      return toDto(created, userId, mayApprove, task?.title ?? null);
    },

    /**
     * Only the authorised approver may change a request before approving it, and the change routes
     * back through the submitting professional rather than being applied and approved in one move:
     * the row stays `requested`, and the submitter is told.
     */
    async modify(userId, exceptionId, input) {
      const { row, project, mayApprove } = await loadDecidable(userId, exceptionId);
      if (row.status !== 'requested') throw alreadyDecided();
      if (!mayApprove) throw onlyApproverMayModify();

      const fromDate = input.fromDate ?? row.fromDate;
      const toDate = input.toDate ?? row.toDate;
      if (toDate < fromDate) throw invalidWindow();

      const updated = await exceptions.update(
        row._id,
        {
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          fromDate,
          toDate,
        },
        {
          action: 'modified',
          by: new Types.ObjectId(userId),
          at: new Date(),
          fromDate,
          toDate,
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          ...(input.note === undefined ? {} : { note: input.note }),
        },
      );
      if (updated === null) throw exceptionNotFound();

      await notifications.emit({
        userId: row.requestedBy,
        type: 'schedule.exception.modified',
        projectId: project._id,
        scheduleExceptionId: row._id,
        payload: { projectName: project.name, fromDate: iso(fromDate), toDate: iso(toDate) },
        // Keyed on the modification time, so a second change is a second notice rather than a
        // silent no-op against the first.
        dedupeKey: `schedule.exception.modified:${row._id.toString()}:${updated.history.length}`,
      });

      return toDto(updated, userId, mayApprove, await titleOf(updated.task));
    },

    /**
     * An authorised approval ENDS the matter. There is no second approval step and no forwarding
     * to the Main Contractor afterwards — the closed finality rule, enforced by there being no
     * transition out of `approved`.
     */
    async decide(userId, exceptionId, approve, note) {
      const { row, project, mayApprove } = await loadDecidable(userId, exceptionId);
      if (row.status !== 'requested') throw alreadyDecided();
      if (!mayApprove) throw notPermittedToApprove();

      const now = new Date();
      const decider = new Types.ObjectId(userId);
      const updated = await exceptions.update(
        row._id,
        approve
          ? {
              status: 'approved',
              approvedBy: decider,
              approvedAt: now,
              ...(note === undefined ? {} : { decisionNote: note }),
            }
          : {
              status: 'rejected',
              rejectedBy: decider,
              rejectedAt: now,
              ...(note === undefined ? {} : { decisionNote: note }),
            },
        {
          action: approve ? 'approved' : 'rejected',
          by: decider,
          at: now,
          ...(note === undefined ? {} : { note }),
        },
      );
      if (updated === null) throw exceptionNotFound();

      await notifyDecision(updated, project, approve);
      return toDto(updated, userId, mayApprove, await titleOf(updated.task));
    },

    async cancel(userId, exceptionId) {
      const { row, mayApprove } = await loadDecidable(userId, exceptionId);
      if (row.status !== 'requested') throw alreadyDecided();
      if (row.requestedBy.toString() !== userId) throw onlySubmitterMayCancel();

      const updated = await exceptions.update(
        row._id,
        { status: 'cancelled', cancelledAt: new Date() },
        { action: 'cancelled', by: new Types.ObjectId(userId), at: new Date() },
      );
      if (updated === null) throw exceptionNotFound();

      return toDto(updated, userId, mayApprove, await titleOf(updated.task));
    },
  };
};
