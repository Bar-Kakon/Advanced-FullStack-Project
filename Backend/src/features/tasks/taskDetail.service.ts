import { Types } from 'mongoose';

import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import { formatCalendarDate } from '../projects/projectDates.js';
import { PrivateWorkItemModel, type PrivateItemKind, type PrivateWorkItemRecord } from './privateWork.model.js';
import { ProjectStageModel, type ProjectStageRecord } from './projectStage.model.js';
import type { RescheduleRequestPort } from './reschedule.port.js';
import { TaskModel, type DelegationScope, type TaskRecord } from './task.model.js';
import { taskNotFound } from './task.errors.js';
import {
  alreadyDelegated,
  cannotDelegateToSelf,
  cannotRedelegate,
  notDelegated,
  ownCrewOnly,
  partNeedsDescription,
  rescheduleUnavailable,
} from './taskDetail.errors.js';
import type { TaskRepository } from './task.repository.js';
import { deriveTaskState, isOverdue, overdueDays } from './taskState.js';
import { counterpartyIdFor, projectForDelegate, viewpointOf, type TaskViewpoint } from './taskVisibility.js';

export interface StageRef {
  readonly id: string;
  readonly name: string;
  readonly isGate: boolean;
  readonly partiallyReleased: boolean;
}

export interface TaskDetailDto {
  readonly id: string;
  readonly kind: string;
  readonly project: { readonly id: string; readonly name: string } | null;
  /** The stage this work sits in, and the stages that must finish first. Never task-to-task. */
  readonly stage: StageRef | null;
  readonly blockedBy: readonly StageRef[];
  readonly title: string;
  readonly description: string | null;
  readonly startDate: string;
  readonly dueDate: string;
  readonly state: string;
  readonly overdue: boolean;
  readonly overdueDays: number;
  readonly counterparty: { readonly userId: string; readonly name: string } | null;

  /** Only the two parties to a delegation ever see it. */
  readonly delegation: {
    readonly delegateName: string | null;
    readonly scope: DelegationScope;
    readonly partDescription: string | null;
  } | null;
  readonly viewerIsDelegate: boolean;
  readonly ownCrewOnly: boolean;
  readonly delegatorOnSiteRequired: boolean;

  readonly orphaned: boolean;

  readonly viewer: {
    readonly canReport: boolean;
    readonly canDelegate: boolean;
    readonly canEndDelegation: boolean;
    readonly canRequestDateChange: boolean;
  };
  /** `null` while the cascade domain does not exist. Never a fabricated count. */
  readonly rescheduleImpact: number | null;
  readonly rescheduleAvailable: boolean;
}

export interface TaskDetailService {
  get(userId: string, taskId: string): Promise<TaskDetailDto>;
  delegate(userId: string, taskId: string, input: { userId: string; scope: DelegationScope; partDescription?: string }): Promise<TaskDetailDto>;
  endDelegation(userId: string, taskId: string): Promise<TaskDetailDto>;
  listPrivate(userId: string, taskId: string): Promise<PrivateWorkItemRecord[]>;
  addPrivate(userId: string, taskId: string, kind: PrivateItemKind, body: string): Promise<PrivateWorkItemRecord>;
  togglePrivate(userId: string, taskId: string, itemId: string, done: boolean): Promise<PrivateWorkItemRecord>;
  removePrivate(userId: string, taskId: string, itemId: string): Promise<void>;
  requestDateChange(userId: string, taskId: string): Promise<never>;
}

export interface TaskDetailDependencies {
  readonly tasks: TaskRepository;
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly participants: ParticipantRepository;
  readonly reschedule: RescheduleRequestPort;
}

export const createTaskDetailService = ({
  tasks,
  projects,
  access,
  participants,
  reschedule,
}: TaskDetailDependencies): TaskDetailService => {
  /**
   * Loads a task and works out where this viewer stands. Anybody with no standing — including a
   * general contractor probing a delegate's URL — gets the same answer as a task that is not there.
   */
  const load = async (userId: string, taskId: string) => {
    const task = await tasks.findById(taskId);
    if (task === null) throw taskNotFound();

    let reachesProject = false;
    if (task.project !== undefined) {
      const membership = await access.findActiveMembership(task.project, new Types.ObjectId(userId));
      reachesProject = membership !== null;
    }

    const viewpoint = viewpointOf(task, { userId, reachesProject });
    if (viewpoint === 'none') throw taskNotFound();
    return { task, viewpoint };
  };

  /** The private layer belongs to one person on one task, and is read for nobody else. */
  const loadOwnPrivate = async (userId: string, taskId: string) => {
    const { task, viewpoint } = await load(userId, taskId);
    if (viewpoint !== 'assignee' && viewpoint !== 'delegate') throw taskNotFound();
    return task;
  };

  const nameOf = async (id: Types.ObjectId | null | undefined): Promise<string | null> => {
    if (!id) return null;
    const [person] = await participants.findByIds([id]);
    return person === undefined ? null : `${person.firstName} ${person.lastName}`.trim();
  };

  const toDto = async (task: TaskRecord, viewpoint: TaskViewpoint, userId: string): Promise<TaskDetailDto> => {
    const now = new Date();
    const isDelegate = viewpoint === 'delegate';
    const delegateView = isDelegate ? projectForDelegate(task) : null;

    const counterpartyId = counterpartyIdFor(task, viewpoint, userId);
    const counterpartyName = await nameOf(counterpartyId);

    // A delegate is told neither the project nor where the work sits in it.
    let project: TaskDetailDto['project'] = null;
    let stage: StageRef | null = null;
    let blockedBy: StageRef[] = [];

    if (!isDelegate && task.project !== undefined) {
      const [found] = await projects.listByIds([task.project]);
      if (found !== undefined) project = { id: found._id.toString(), name: found.name };

      const stages = await ProjectStageModel.find({ project: task.project })
        .lean<ProjectStageRecord[]>()
        .exec();
      const byId = new Map(stages.map((row) => [row._id.toString(), row]));
      const toRef = (row: ProjectStageRecord): StageRef => ({
        id: row._id.toString(),
        name: row.name,
        isGate: row.isGate,
        partiallyReleased: row.partialReleaseAt !== undefined,
      });

      const own = task.stage === undefined ? undefined : byId.get(task.stage.toString());
      if (own !== undefined) {
        stage = toRef(own);
        blockedBy = own.dependsOn.flatMap((id) => {
          const upstream = byId.get(id.toString());
          return upstream === undefined ? [] : [toRef(upstream)];
        });
      }
    }

    const canReport =
      task.orphanedAt === undefined &&
      (task.delegation !== undefined ? isDelegate : viewpoint === 'assignee');

    return {
      id: task._id.toString(),
      kind: task.kind,
      project,
      stage,
      blockedBy,
      title: delegateView?.title ?? task.title,
      description: delegateView ? delegateView.description : task.description ?? null,
      startDate: formatCalendarDate(task.startDate),
      dueDate: formatCalendarDate(task.dueDate),
      state: deriveTaskState(task),
      overdue: isOverdue(task, now),
      overdueDays: overdueDays(task, now),
      counterparty:
        counterpartyId === null || counterpartyName === null
          ? null
          : { userId: counterpartyId.toString(), name: counterpartyName },

      delegation:
        task.delegation === undefined || (viewpoint !== 'assignee' && !isDelegate)
          ? null
          : {
              // The delegate knows themselves; only the delegator is told who performs.
              delegateName: viewpoint === 'assignee' ? await nameOf(task.delegation.delegate) : null,
              scope: task.delegation.scope,
              partDescription: task.delegation.partDescription ?? null,
            },
      viewerIsDelegate: isDelegate,
      ownCrewOnly: task.ownCrewOnly,
      delegatorOnSiteRequired: task.delegatorOnSiteRequired,
      orphaned: task.orphanedAt !== undefined,

      viewer: {
        canReport,
        // Only the responsible party may hand work on, once, and never when own-crew-only applies.
        canDelegate:
          viewpoint === 'assignee' &&
          task.delegation === undefined &&
          !task.ownCrewOnly &&
          task.orphanedAt === undefined,
        canEndDelegation: viewpoint === 'assignee' && task.delegation !== undefined,
        canRequestDateChange: reschedule.available && canReport,
      },
      rescheduleImpact: await reschedule.impactOf(task._id.toString()),
      rescheduleAvailable: reschedule.available,
    };
  };

  const reload = async (taskId: string, userId: string): Promise<TaskDetailDto> => {
    const { task, viewpoint } = await load(userId, taskId);
    return toDto(task, viewpoint, userId);
  };

  return {
    async get(userId, taskId) {
      const { task, viewpoint } = await load(userId, taskId);
      return toDto(task, viewpoint, userId);
    },

    async delegate(userId, taskId, input) {
      const { task, viewpoint } = await load(userId, taskId);
      // A delegate holding the work cannot pass it on: single level, and no exception.
      if (viewpoint === 'delegate') throw cannotRedelegate();
      if (viewpoint !== 'assignee') throw taskNotFound();
      if (task.delegation !== undefined) throw alreadyDelegated();
      if (task.ownCrewOnly) throw ownCrewOnly();
      if (input.userId === userId) throw cannotDelegateToSelf();
      if (input.scope === 'part' && !input.partDescription?.trim()) throw partNeedsDescription();
      if (!Types.ObjectId.isValid(input.userId)) throw taskNotFound();

      await TaskModel.updateOne(
        { _id: task._id },
        {
          $set: {
            delegation: {
              delegate: new Types.ObjectId(input.userId),
              scope: input.scope,
              ...(input.partDescription ? { partDescription: input.partDescription.trim() } : {}),
              delegatedAt: new Date(),
            },
          },
        },
      ).exec();

      return reload(taskId, userId);
    },

    /** Ending it returns responsibility to the delegator. The party above is never told either way. */
    async endDelegation(userId, taskId) {
      const { task, viewpoint } = await load(userId, taskId);
      if (viewpoint !== 'assignee') throw taskNotFound();
      if (task.delegation === undefined) throw notDelegated();

      await TaskModel.updateOne({ _id: task._id }, { $unset: { delegation: '' } }).exec();
      return reload(taskId, userId);
    },

    async listPrivate(userId, taskId) {
      const task = await loadOwnPrivate(userId, taskId);
      return PrivateWorkItemModel.find({ task: task._id, owner: new Types.ObjectId(userId) })
        .sort({ order: 1, createdAt: 1 })
        .lean<PrivateWorkItemRecord[]>()
        .exec();
    },

    async addPrivate(userId, taskId, kind, body) {
      const task = await loadOwnPrivate(userId, taskId);
      const count = await PrivateWorkItemModel.countDocuments({
        task: task._id,
        owner: new Types.ObjectId(userId),
      }).exec();

      const created = await PrivateWorkItemModel.create({
        task: task._id,
        owner: new Types.ObjectId(userId),
        kind,
        body,
        order: count,
      });
      return created.toObject() as PrivateWorkItemRecord;
    },

    async togglePrivate(userId, taskId, itemId, done) {
      const task = await loadOwnPrivate(userId, taskId);
      if (!Types.ObjectId.isValid(itemId)) throw taskNotFound();

      const updated = await PrivateWorkItemModel.findOneAndUpdate(
        { _id: new Types.ObjectId(itemId), task: task._id, owner: new Types.ObjectId(userId) },
        { $set: { done } },
        { new: true },
      )
        .lean<PrivateWorkItemRecord>()
        .exec();

      if (updated === null) throw taskNotFound();
      return updated;
    },

    async removePrivate(userId, taskId, itemId) {
      const task = await loadOwnPrivate(userId, taskId);
      if (!Types.ObjectId.isValid(itemId)) throw taskNotFound();

      const result = await PrivateWorkItemModel.deleteOne({
        _id: new Types.ObjectId(itemId),
        task: task._id,
        owner: new Types.ObjectId(userId),
      }).exec();
      if (result.deletedCount === 0) throw taskNotFound();
    },

    /** The entry point exists; the domain behind it does not, and it says so rather than pretending. */
    async requestDateChange(userId, taskId) {
      await load(userId, taskId);
      throw rescheduleUnavailable();
    },
  };
};
