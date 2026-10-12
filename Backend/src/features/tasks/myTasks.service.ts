import { Types } from 'mongoose';

import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import { formatCalendarDate } from '../projects/projectDates.js';
import type { AgreementOrigin, AgreementOriginPort } from './agreementOrigin.port.js';
import type { CommissionedWorkDto, MyTaskDto, MyTasksPageDto } from './task.dto.js';
import type { TaskKind, TaskRecord } from './task.model.js';
import type { ProposalMarkerPort } from './proposals.port.js';
import {
  alreadyCompleted,
  alreadyStarted,
  notStartedYet,
  notThePerformer,
  taskNotFound,
  taskOrphaned,
} from './task.errors.js';
import type { MyTasksCursor, TaskRepository } from './task.repository.js';
import { deriveTaskState, isOverdue, overdueDays, type TaskState } from './taskState.js';
import {
  counterpartyIdFor,
  maySeeDelegation,
  projectForDelegate,
  viewpointOf,
  type TaskViewpoint,
} from './taskVisibility.js';

export interface MyTasksFilters {
  readonly projectId?: string;
  readonly noProject?: boolean;
  readonly kind?: TaskKind;
  readonly state?: TaskState;
  readonly sort: 'due_asc' | 'due_desc';
  readonly cursor?: string;
  readonly limit: number;
}

export interface MyTasksService {
  list(userId: string, filters: MyTasksFilters): Promise<MyTasksPageDto>;
  start(userId: string, taskId: string): Promise<MyTaskDto>;
  complete(userId: string, taskId: string): Promise<MyTaskDto>;
  /** The commissioning party's read-only view of work they commissioned through agreements. */
  commissioned(userId: string): Promise<CommissionedWorkDto[]>;
}

export interface MyTasksDependencies {
  readonly tasks: TaskRepository;
  readonly projects: ProjectRepository;
  readonly participants: ParticipantRepository;
  readonly proposals: ProposalMarkerPort;
  readonly origins: AgreementOriginPort;
}

const encodeCursor = ({ dueDate, id }: MyTasksCursor): string =>
  Buffer.from(`${dueDate.toISOString()}|${id.toString()}`, 'utf8').toString('base64url');

const decodeCursor = (raw: string | undefined): MyTasksCursor | null => {
  if (!raw) return null;
  try {
    const [timestamp, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!timestamp || !id || !Types.ObjectId.isValid(id)) return null;
    const dueDate = new Date(timestamp);
    if (Number.isNaN(dueDate.getTime())) return null;
    return { dueDate, id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
};

export const createMyTasksService = ({
  tasks,
  projects,
  participants,
  proposals,
  origins,
}: MyTasksDependencies): MyTasksService => {
  /**
   * Turns one stored task into what THIS viewer is allowed to read. Every field that could cross
   * the delegation wall is decided here rather than at any call site.
   */
  const toDto = (
    task: TaskRecord,
    viewpoint: TaskViewpoint,
    viewerId: string,
    names: ReadonlyMap<string, string>,
    projectNames: ReadonlyMap<string, string>,
    pending: ReadonlyMap<string, boolean>,
    agreementOrigins: ReadonlyMap<string, AgreementOrigin>,
    now: Date,
  ): MyTaskDto => {
    const isDelegate = viewpoint === 'delegate';
    const delegateView = isDelegate ? projectForDelegate(task) : null;

    // Agreement-born work names the commissioning party as the counterparty — read from the
    // agreement message, and never shown to a delegate, who sees only their delegator.
    const origin = viewpoint === 'assignee' ? agreementOrigins.get(task._id.toString()) : undefined;
    const counterpartyId =
      origin !== undefined ? origin.proposer : counterpartyIdFor(task, viewpoint, viewerId);
    const counterpartyName =
      counterpartyId === null ? null : names.get(counterpartyId.toString()) ?? null;

    const projectId = task.project?.toString();
    return {
      id: task._id.toString(),
      kind: task.kind,
      // A delegate is never told which project the work belongs to.
      project:
        isDelegate || projectId === undefined
          ? null
          : { id: projectId, name: projectNames.get(projectId) ?? '' },
      title: delegateView?.title ?? task.title,
      description: delegateView ? delegateView.description : task.description ?? null,

      startDate: formatCalendarDate(task.startDate),
      dueDate: formatCalendarDate(task.dueDate),
      state: deriveTaskState(task),
      overdue: isOverdue(task, now),
      overdueDays: overdueDays(task, now),
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,

      counterparty:
        counterpartyId === null || counterpartyName === null
          ? null
          : { userId: counterpartyId.toString(), name: counterpartyName },

      fromAgreement: origin !== undefined,

      delegated: maySeeDelegation(viewpoint) && task.delegation !== undefined,
      viewerIsDelegate: isDelegate,
      orphaned: task.orphanedAt !== undefined,

      canStart: canReport(task, viewpoint) && task.startedAt === undefined,
      canComplete:
        canReport(task, viewpoint) && task.startedAt !== undefined && task.completedAt === undefined,

      pendingProposal: proposals.available ? pending.get(task._id.toString()) ?? false : null,
    };
  };

  /**
   * Who may report progress: whoever actually performs the work. When the work is delegated that
   * is the delegate, not the delegator — and never anybody else on the project.
   */
  const canReport = (task: TaskRecord, viewpoint: TaskViewpoint): boolean => {
    if (task.orphanedAt !== undefined) return false;
    if (task.delegation !== undefined) return viewpoint === 'delegate';
    return viewpoint === 'assignee';
  };

  const decorate = async (rows: readonly TaskRecord[], userId: string): Promise<MyTaskDto[]> => {
    const now = new Date();
    const viewpoints = new Map(rows.map((row) => [row._id.toString(), viewpointOf(row, { userId, reachesProject: false })]));

    // Standalone rows the viewer performs may have arrived through an agreement; one batched
    // reverse lookup names their commissioning party.
    const originCandidates = rows.flatMap((row) =>
      row.kind === 'standalone' && viewpoints.get(row._id.toString()) === 'assignee'
        ? [row._id]
        : [],
    );
    const agreementOrigins = new Map(
      (await origins.findByTaskIds(originCandidates)).map((origin) => [
        origin.task.toString(),
        origin,
      ]),
    );

    const counterpartyIds = rows.flatMap((row) => {
      const origin =
        viewpoints.get(row._id.toString()) === 'assignee'
          ? agreementOrigins.get(row._id.toString())
          : undefined;
      if (origin !== undefined) return [origin.proposer];
      const id = counterpartyIdFor(row, viewpoints.get(row._id.toString()) ?? 'none', userId);
      return id === null ? [] : [id];
    });
    const people = await participants.findByIds(counterpartyIds);
    const names = new Map(
      people.map((person) => [person._id.toString(), `${person.firstName} ${person.lastName}`.trim()]),
    );

    // A delegate is never told the project, so their rows contribute no project to look up.
    const projectIds = rows.flatMap((row) =>
      row.project !== undefined && viewpoints.get(row._id.toString()) !== 'delegate' ? [row.project] : [],
    );
    const found = await projects.listByIds(projectIds);
    const projectNames = new Map(found.map((project) => [project._id.toString(), project.name]));

    const pending = await proposals.pendingFor(userId, rows.map((row) => row._id.toString()));

    return rows.map((row) =>
      toDto(
        row,
        viewpoints.get(row._id.toString()) ?? 'none',
        userId,
        names,
        projectNames,
        pending,
        agreementOrigins,
        now,
      ),
    );
  };

  /** Loads a task this viewer actually performs. Anything else answers as a task that is not there. */
  const loadPerformable = async (userId: string, taskId: string) => {
    const task = await tasks.findById(taskId);
    if (task === null) throw taskNotFound();

    const viewpoint = viewpointOf(task, { userId, reachesProject: false });
    if (viewpoint !== 'assignee' && viewpoint !== 'delegate') throw taskNotFound();
    if (task.orphanedAt !== undefined) throw taskOrphaned();
    if (!canReport(task, viewpoint)) throw notThePerformer();

    return task;
  };

  const single = async (task: TaskRecord, userId: string): Promise<MyTaskDto> => {
    const [dto] = await decorate([task], userId);
    if (dto === undefined) throw taskNotFound();
    return dto;
  };

  return {
    async list(userId, filters) {
      const rows = await tasks.listMine({
        userId: new Types.ObjectId(userId),
        ...(filters.projectId !== undefined && Types.ObjectId.isValid(filters.projectId)
          ? { project: new Types.ObjectId(filters.projectId) }
          : {}),
        ...(filters.noProject === true ? { noProject: true } : {}),
        ...(filters.kind !== undefined ? { kind: filters.kind } : {}),
        ...(filters.state !== undefined ? { state: filters.state } : {}),
        sort: filters.sort,
        cursor: decodeCursor(filters.cursor),
        limit: filters.limit + 1,
      });

      const page = rows.slice(0, filters.limit);
      const last = page.at(-1);

      return {
        tasks: await decorate(page, userId),
        nextCursor:
          rows.length > filters.limit && last !== undefined
            ? encodeCursor({ dueDate: last.dueDate, id: last._id })
            : null,
      };
    },

    async start(userId, taskId) {
      const task = await loadPerformable(userId, taskId);
      if (task.startedAt !== undefined) throw alreadyStarted();

      const updated = await tasks.setStarted(task._id, new Date());
      if (updated === null) throw alreadyStarted();
      return single(updated, userId);
    },

    async complete(userId, taskId) {
      const task = await loadPerformable(userId, taskId);
      if (task.completedAt !== undefined) throw alreadyCompleted();
      if (task.startedAt === undefined) throw notStartedYet();

      const updated = await tasks.setCompleted(task._id, new Date());
      if (updated === null) throw alreadyCompleted();
      return single(updated, userId);
    },

    /**
     * Strictly read-only, and structurally scoped: only task ids taken from the caller's own
     * accepted agreements are ever read, so nothing else of a performer's world can appear here.
     * It feeds no group, count or filter of the performer's My Tasks.
     */
    async commissioned(userId) {
      const commissions = await origins.listByProposer(new Types.ObjectId(userId));
      if (commissions.length === 0) return [];

      const rows = await tasks.listByIds(commissions.map((origin) => origin.task));
      const performers = await participants.findByIds(commissions.map((origin) => origin.accepter));
      const names = new Map(
        performers.map((person) => [
          person._id.toString(),
          `${person.firstName} ${person.lastName}`.trim(),
        ]),
      );
      const accepterByTask = new Map(
        commissions.map((origin) => [origin.task.toString(), origin.accepter]),
      );

      const now = new Date();
      return rows
        .slice()
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
        .map((task) => {
          const accepter = accepterByTask.get(task._id.toString());
          const name = accepter === undefined ? null : names.get(accepter.toString()) ?? null;
          return {
            id: task._id.toString(),
            title: task.title,
            startDate: formatCalendarDate(task.startDate),
            dueDate: formatCalendarDate(task.dueDate),
            state: deriveTaskState(task),
            overdue: isOverdue(task, now),
            performer:
              accepter === undefined || name === null
                ? null
                : { userId: accepter.toString(), name },
          };
        });
    },
  };
};
