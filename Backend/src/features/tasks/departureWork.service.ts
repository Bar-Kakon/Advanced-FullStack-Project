import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import type { AuditRepository } from '../coordination/audit.repository.js';
import type { CompanyRecord } from '../companies/company.model.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import { formatCalendarDate } from '../projects/projectDates.js';
import type { ScheduleWrites } from '../projects/scheduleWrites.js';
import type { AgreementOriginPort } from './agreementOrigin.port.js';
import type { TrackingArrangement } from './commissionTracking.model.js';
import type { CommissionTrackingRepository } from './commissionTracking.repository.js';
import { departureArrangementInvalid } from './task.errors.js';
import type { TaskRecord } from './task.model.js';
import type { TaskRepository } from './task.repository.js';
import { deriveTaskState, isOverdue } from './taskState.js';

export interface CommissionArrangementInput {
  readonly taskId: string;
  readonly arrangement: TrackingArrangement;
  readonly trackeeUserId?: string;
}

export interface AssignedArrangementInput {
  readonly taskId: string;
  readonly action: 'transfer' | 'await_reassignment';
  readonly assigneeUserId?: string;
}

export interface DepartureWorkItemDto {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly state: string;
  readonly overdue: boolean;
  readonly awaitingReassignment: boolean;
  readonly performer: { readonly userId: string; readonly name: string } | null;
  readonly projectName: string | null;
  readonly arrangement: { readonly kind: string; readonly trackeeName: string | null } | null;
}

export interface DepartureWorkDto {
  readonly commissions: readonly DepartureWorkItemDto[];
  readonly assigned: readonly DepartureWorkItemDto[];
}

export interface DepartureWorkService {
  /** Everything a departure has to settle for one member: their commissions and their duties. */
  listFor(company: Types.ObjectId, userId: Types.ObjectId): Promise<DepartureWorkDto>;
  /**
   * The owner's explicit arrangements, all-or-nothing: every item validates before anything is
   * written, so a poisoned batch applies no part of itself.
   */
  applyArrangements(
    ownerId: Types.ObjectId,
    company: Types.ObjectId,
    departing: Types.ObjectId,
    input: {
      readonly commissions: readonly CommissionArrangementInput[];
      readonly assigned: readonly AssignedArrangementInput[];
    },
    session: DbSession,
  ): Promise<void>;
  /**
   * Step 3 of the precedence: the saved company default, applied only where no explicit
   * arrangement exists; an ineligible default target falls through to owner responsibility.
   * Every assigned duty left unsettled becomes awaiting-reassignment — never a departed assignee.
   */
  applyDefaultsAndFallback(
    ownerId: Types.ObjectId,
    company: Types.ObjectId,
    departing: Types.ObjectId,
    defaults: CompanyRecord['departureDefaults'],
    session: DbSession,
  ): Promise<void>;
}

export interface DepartureWorkDependencies {
  readonly tasks: TaskRepository;
  readonly origins: AgreementOriginPort;
  readonly trackings: CommissionTrackingRepository;
  readonly access: ProjectAccessRepository;
  readonly memberships: CompanyMembershipRepository;
  readonly participants: ParticipantRepository;
  readonly projects: ProjectRepository;
  readonly audit: AuditRepository;
  readonly notifications: NotificationDispatchService;
  readonly schedule: Pick<ScheduleWrites, 'claim'>;
}

export const createDepartureWorkService = ({
  tasks,
  origins,
  trackings,
  access,
  memberships,
  participants,
  projects,
  audit,
  notifications,
  schedule,
}: DepartureWorkDependencies): DepartureWorkService => {
  const namesFor = async (ids: readonly Types.ObjectId[]): Promise<Map<string, string>> => {
    const unique = [...new Set(ids.map((id) => id.toString()))].map((id) => new Types.ObjectId(id));
    const people = await participants.findByIds(unique);
    return new Map(
      people.map((person) => [person._id.toString(), `${person.firstName} ${person.lastName}`.trim()]),
    );
  };

  /** The member's unfinished commissions stamped to THIS company — attribution by the stamp only. */
  const unfinishedCommissions = async (company: Types.ObjectId, userId: Types.ObjectId) => {
    const all = await origins.listByProposer(userId);
    const scoped = all.filter((origin) => origin.company !== null && origin.company.equals(company));
    const rows = await tasks.listByIds(scoped.map((origin) => origin.task));
    const open = rows.filter((task) => task.completedAt === undefined);
    const accepterByTask = new Map(scoped.map((o) => [o.task.toString(), o.accepter]));
    return { open, accepterByTask };
  };

  const isActiveEmployeeOf = async (
    company: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<boolean> => {
    const membership = await memberships.findActiveByUser(userId.toString());
    return membership !== null && membership.company.equals(company);
  };

  const transferDuty = async (
    task: TaskRecord,
    departing: Types.ObjectId,
    target: Types.ObjectId,
    ownerId: Types.ObjectId,
    ownerName: string,
    session: DbSession,
    announcements: { userId: Types.ObjectId; taskTitle: string; projectId?: Types.ObjectId }[],
  ): Promise<void> => {
    if (task.project !== undefined) await schedule.claim(task.project, session);
    const moved =
      task.assignee !== undefined
        ? await tasks.replaceAssignee(task._id, departing, target, session)
        : await tasks.resolveOrphan(task._id, target, session);
    if (moved === 0) throw departureArrangementInvalid();

    if (task.project !== undefined) {
      await audit.append(
        [
          {
            project: task.project,
            task: task._id,
            actor: ownerId,
            actorName: ownerName,
            action: 'work.replacement_recorded',
            parties: [departing, target],
            details: { taskId: task._id.toString(), reason: 'employee_departure' },
            partyDetails: {},
          },
        ],
        session,
      );
    }
    announcements.push({
      userId: target,
      taskTitle: task.title,
      ...(task.project === undefined ? {} : { projectId: task.project }),
    });
  };

  return {
    async listFor(company, userId) {
      const { open, accepterByTask } = await unfinishedCommissions(company, userId);
      const assigned = [
        ...(await tasks.listUnfinishedAssignedInCompany(userId, company)),
        ...(await tasks.listOrphanedPreviouslyAssignedInCompany(userId, company)),
      ];
      const trackingRows = await trackings.listByTasks(open.map((task) => task._id));
      const trackingByTask = new Map(trackingRows.map((row) => [row.task.toString(), row]));

      const nameIds: Types.ObjectId[] = [
        ...open.flatMap((task) => {
          const accepter = accepterByTask.get(task._id.toString());
          return accepter === undefined ? [] : [accepter];
        }),
        ...trackingRows.flatMap((row) => (row.trackee === undefined ? [] : [row.trackee])),
      ];
      const names = await namesFor(nameIds);

      const projectIds = assigned.flatMap((task) => (task.project === undefined ? [] : [task.project]));
      const foundProjects = await projects.listByIds(projectIds);
      const projectNames = new Map(foundProjects.map((row) => [row._id.toString(), row.name]));

      const now = new Date();
      const toItem = (
        task: TaskRecord,
        performer: Types.ObjectId | undefined,
      ): DepartureWorkItemDto => {
        const tracking = trackingByTask.get(task._id.toString());
        return {
          id: task._id.toString(),
          title: task.title,
          startDate: formatCalendarDate(task.startDate),
          dueDate: formatCalendarDate(task.dueDate),
          state: deriveTaskState(task),
          overdue: isOverdue(task, now),
          awaitingReassignment: task.orphanedAt !== undefined,
          performer:
            performer === undefined
              ? null
              : { userId: performer.toString(), name: names.get(performer.toString()) ?? '' },
          projectName:
            task.project === undefined ? null : projectNames.get(task.project.toString()) ?? null,
          arrangement:
            tracking === undefined
              ? null
              : {
                  kind: tracking.arrangement,
                  trackeeName:
                    tracking.trackee === undefined
                      ? null
                      : names.get(tracking.trackee.toString()) ?? null,
                },
        };
      };

      return {
        commissions: open.map((task) => toItem(task, accepterByTask.get(task._id.toString()))),
        assigned: assigned.map((task) => toItem(task, undefined)),
      };
    },

    async applyArrangements(ownerId, company, departing, input, session) {
      const { open, accepterByTask } = await unfinishedCommissions(company, departing);
      const openIds = new Set(open.map((task) => task._id.toString()));
      const assignedRows = await tasks.listUnfinishedAssignedInCompany(departing, company);
      const orphanedRows = (await tasks.listByIds(
        input.assigned
          .filter((row) => Types.ObjectId.isValid(row.taskId))
          .map((row) => new Types.ObjectId(row.taskId)),
      )).filter(
        (task) =>
          task.orphanedAt !== undefined &&
          task.company !== undefined &&
          task.company.equals(company) &&
          task.previousAssignee !== undefined &&
          task.previousAssignee.equals(departing) &&
          task.completedAt === undefined,
      );
      const dutyById = new Map([
        ...assignedRows.map((task) => [task._id.toString(), task] as const),
        ...orphanedRows.map((task) => [task._id.toString(), task] as const),
      ]);

      // VALIDATE everything first — nothing below writes until every item has passed.
      for (const row of input.commissions) {
        if (!openIds.has(row.taskId)) throw departureArrangementInvalid();
        if (row.arrangement === 'owner_only') {
          if (row.trackeeUserId !== undefined) throw departureArrangementInvalid();
          continue;
        }
        if (row.trackeeUserId === undefined || !Types.ObjectId.isValid(row.trackeeUserId)) {
          throw departureArrangementInvalid();
        }
        const trackee = new Types.ObjectId(row.trackeeUserId);
        if (trackee.equals(departing)) throw departureArrangementInvalid();
        if (!(await isActiveEmployeeOf(company, trackee))) throw departureArrangementInvalid();
      }
      for (const row of input.assigned) {
        const task = dutyById.get(row.taskId);
        if (task === undefined) throw departureArrangementInvalid();
        if (row.action === 'await_reassignment') {
          if (row.assigneeUserId !== undefined) throw departureArrangementInvalid();
          continue;
        }
        if (row.assigneeUserId === undefined || !Types.ObjectId.isValid(row.assigneeUserId)) {
          throw departureArrangementInvalid();
        }
        const target = new Types.ObjectId(row.assigneeUserId);
        if (target.equals(departing)) throw departureArrangementInvalid();
        if (task.project === undefined) throw departureArrangementInvalid();
        // Project execution restrictions are never bypassed: the replacement must already be in.
        if ((await access.findActiveMembership(task.project, target)) === null) {
          throw departureArrangementInvalid();
        }
      }

      const [ownerName] = [(await namesFor([ownerId])).get(ownerId.toString()) ?? ''];
      const announcements: { userId: Types.ObjectId; taskTitle: string; projectId?: Types.ObjectId }[] = [];

      await trackings.upsertMany(
        input.commissions.map((row) => ({
          task: new Types.ObjectId(row.taskId),
          company,
          commissionedBy: departing,
          arrangement: row.arrangement,
          ...(row.trackeeUserId === undefined ? {} : { trackee: new Types.ObjectId(row.trackeeUserId) }),
          assignedBy: ownerId,
        })),
        session,
      );

      for (const row of input.assigned) {
        const task = dutyById.get(row.taskId)!;
        if (row.action === 'transfer') {
          await transferDuty(
            task,
            departing,
            new Types.ObjectId(row.assigneeUserId!),
            ownerId,
            ownerName,
            session,
            announcements,
          );
        } else if (task.orphanedAt === undefined) {
          const moved = await tasks.orphanTask(task._id, departing, session);
          if (moved === 0) throw departureArrangementInvalid();
          if (task.project !== undefined) {
            await audit.append(
              [
                {
                  project: task.project,
                  task: task._id,
                  actor: ownerId,
                  actorName: ownerName,
                  action: 'work.orphaned',
                  parties: [departing],
                  details: { taskId: task._id.toString(), reason: 'employee_departure' },
                  partyDetails: {},
                },
              ],
              session,
            );
          }
        }
      }

      // After the transaction commits, never inside it: delivery is best-effort, state is not.
      for (const item of announcements) {
        await notifications.emit({
          userId: item.userId,
          type: 'task.assigned',
          ...(item.projectId === undefined ? {} : { projectId: item.projectId }),
          payload: { taskTitle: item.taskTitle },
          dedupeKey: `departure-transfer:${item.userId.toString()}:${item.taskTitle}`,
        });
      }
    },

    async applyDefaultsAndFallback(ownerId, company, departing, defaults, session) {
      const { open } = await unfinishedCommissions(company, departing);
      const trackingRows = await trackings.listByTasks(
        open.map((task) => task._id),
        session,
      );
      const arranged = new Set(trackingRows.map((row) => row.task.toString()));
      const unarranged = open.filter((task) => !arranged.has(task._id.toString()));

      const defaultCommissioned = defaults?.commissioned;
      if (defaultCommissioned !== undefined && unarranged.length > 0) {
        const trackee = defaultCommissioned.trackee;
        const trackeeValid =
          trackee !== undefined &&
          !trackee.equals(departing) &&
          (await isActiveEmployeeOf(company, trackee));
        const usable =
          defaultCommissioned.arrangement === 'owner_only' ||
          (trackeeValid && trackee !== undefined);
        if (usable) {
          await trackings.upsertMany(
            unarranged.map((task) => ({
              task: task._id,
              company,
              commissionedBy: departing,
              arrangement: defaultCommissioned.arrangement,
              ...(defaultCommissioned.arrangement === 'owner_only' || trackee === undefined
                ? {}
                : { trackee }),
              assignedBy: ownerId,
            })),
            session,
          );
        }
      }
      // No usable default → no row: the precedence's final step, owner responsibility, is the
      // recorded meaning of absence.

      const duties = await tasks.listUnfinishedAssignedInCompany(departing, company, session);
      const ownerName = (await namesFor([ownerId])).get(ownerId.toString()) ?? '';
      const announcements: { userId: Types.ObjectId; taskTitle: string; projectId?: Types.ObjectId }[] = [];

      for (const task of duties) {
        const target = defaults?.assigned?.assignee;
        const targetUsable =
          target !== undefined &&
          !target.equals(departing) &&
          task.project !== undefined &&
          (await access.findActiveMembership(task.project, target)) !== null;

        if (targetUsable && target !== undefined) {
          await transferDuty(task, departing, target, ownerId, ownerName, session, announcements);
        } else {
          const moved = await tasks.orphanTask(task._id, departing, session);
          if (moved === 0) throw departureArrangementInvalid();
          if (task.project !== undefined) {
            await audit.append(
              [
                {
                  project: task.project,
                  task: task._id,
                  actor: ownerId,
                  actorName: ownerName,
                  action: 'work.orphaned',
                  parties: [departing],
                  details: { taskId: task._id.toString(), reason: 'employee_departure' },
                  partyDetails: {},
                },
              ],
              session,
            );
          }
        }
      }

      for (const item of announcements) {
        await notifications.emit({
          userId: item.userId,
          type: 'task.assigned',
          ...(item.projectId === undefined ? {} : { projectId: item.projectId }),
          payload: { taskTitle: item.taskTitle },
          dedupeKey: `departure-transfer:${item.userId.toString()}:${item.taskTitle}`,
        });
      }
    },
  };
};
