import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';

import { TaskModel, type TaskKind, type TaskRecord } from './task.model.js';
import type { TaskState } from './taskState.js';

export interface MyTasksCursor {
  readonly dueDate: Date;
  readonly id: Types.ObjectId;
}

export interface MyTasksQuery {
  readonly userId: Types.ObjectId;
  readonly project?: Types.ObjectId;
  /** `true` filters to standalone work; the project filter's "no project" option. */
  readonly noProject?: boolean;
  readonly kind?: TaskKind;
  readonly state?: TaskState;
  readonly sort: 'due_asc' | 'due_desc';
  readonly cursor: MyTasksCursor | null;
  readonly limit: number;
}

export interface TaskRepository {
  /** PRJ-07: a cancelled project takes its planned tasks with it — nothing had started. */
  deleteByProject(project: Types.ObjectId, session?: DbSession): Promise<number>;
  listMine(query: MyTasksQuery): Promise<TaskRecord[]>;
  listByIds(ids: readonly Types.ObjectId[]): Promise<TaskRecord[]>;
  /** PRJ-10's read: every project task's dates and progress, titles only — no names at all. */
  listForTimeline(project: Types.ObjectId): Promise<
    readonly Pick<TaskRecord, '_id' | 'title' | 'startDate' | 'dueDate' | 'startedAt' | 'completedAt' | 'stage'>[]
  >;
  /** Work someone is still responsible for: assigned, not completed and not orphaned. */
  listLiveAssignedInProject(
    project: Types.ObjectId,
  ): Promise<readonly Pick<TaskRecord, '_id' | 'assignee' | 'startDate' | 'dueDate'>[]>;
  /** The departing member's unfinished responsibilities inside the company's own projects. */
  listUnfinishedAssignedInCompany(
    assignee: Types.ObjectId,
    company: Types.ObjectId,
    session?: DbSession,
  ): Promise<TaskRecord[]>;
  /** Authority-driven replacement at departure: guarded on the current assignee (D7 unset). */
  replaceAssignee(
    taskId: Types.ObjectId,
    from: Types.ObjectId,
    to: Types.ObjectId,
    session?: DbSession,
  ): Promise<number>;
  /** The awaiting-execution-reassignment state: the recorded orphan shape gets its first writer. */
  orphanTask(taskId: Types.ObjectId, from: Types.ObjectId, session?: DbSession): Promise<number>;
  /** Resolving an orphan later: guarded on the orphan state itself. */
  resolveOrphan(taskId: Types.ObjectId, to: Types.ObjectId, session?: DbSession): Promise<number>;
  /** The departed member's duties still awaiting execution reassignment. */
  listOrphanedPreviouslyAssignedInCompany(
    previousAssignee: Types.ObjectId,
    company: Types.ObjectId,
  ): Promise<TaskRecord[]>;
  findById(id: string): Promise<TaskRecord | null>;
  setStarted(id: Types.ObjectId, at: Date): Promise<TaskRecord | null>;
  setCompleted(id: Types.ObjectId, at: Date): Promise<TaskRecord | null>;
  create(task: Omit<TaskRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<TaskRecord>;
}

/** The two states a person can be in on a task: responsible for it, or hidden performer of it. */
const minePredicate = (userId: Types.ObjectId): Record<string, unknown> => ({
  $or: [{ assignee: userId }, { 'delegation.delegate': userId }],
});

/** Derived states have no stored field, so each maps to a condition on the two timestamps. */
const statePredicate = (state: TaskState): Record<string, unknown> => {
  if (state === 'completed') return { completedAt: { $ne: null } };
  if (state === 'in_progress') return { startedAt: { $ne: null }, completedAt: null };
  return { startedAt: null };
};

export const taskRepository: TaskRepository = {
  async deleteByProject(project, session) {
    const query = TaskModel.deleteMany({ project });
    if (session) query.session(session);
    const result = await query.exec();
    return result.deletedCount;
  },

  async listForTimeline(project) {
    return TaskModel.find({ project })
      .select('title startDate dueDate startedAt completedAt stage')
      .sort({ startDate: 1, _id: 1 })
      .lean<Pick<TaskRecord, '_id' | 'title' | 'startDate' | 'dueDate' | 'startedAt' | 'completedAt' | 'stage'>[]>()
      .exec();
  },

  async listLiveAssignedInProject(project) {
    return TaskModel.find({
      project,
      assignee: { $ne: null },
      completedAt: null,
      orphanedAt: null,
    })
      .select('assignee startDate dueDate')
      .lean<Pick<TaskRecord, '_id' | 'assignee' | 'startDate' | 'dueDate'>[]>()
      .exec();
  },

  async listUnfinishedAssignedInCompany(assignee, company, session) {
    return TaskModel.find({
      assignee,
      company,
      kind: 'project',
      completedAt: { $exists: false },
    })
      .session(session ?? null)
      .lean<TaskRecord[]>()
      .exec();
  },

  async listOrphanedPreviouslyAssignedInCompany(previousAssignee, company) {
    return TaskModel.find({
      previousAssignee,
      company,
      kind: 'project',
      orphanedAt: { $exists: true },
      assignee: { $exists: false },
      completedAt: { $exists: false },
    })
      .lean<TaskRecord[]>()
      .exec();
  },

  async replaceAssignee(taskId, from, to, session) {
    const result = await TaskModel.updateOne(
      { _id: taskId, assignee: from, completedAt: { $exists: false } },
      {
        $set: { assignee: to, previousAssignee: from },
        $unset: { delegation: '', orphanedAt: '' },
      },
      session ? { session } : {},
    ).exec();
    return result.modifiedCount;
  },

  async orphanTask(taskId, from, session) {
    const result = await TaskModel.updateOne(
      { _id: taskId, assignee: from, completedAt: { $exists: false } },
      {
        $set: { orphanedAt: new Date(), previousAssignee: from },
        $unset: { assignee: '', delegation: '' },
      },
      session ? { session } : {},
    ).exec();
    return result.modifiedCount;
  },

  async resolveOrphan(taskId, to, session) {
    const result = await TaskModel.updateOne(
      { _id: taskId, orphanedAt: { $exists: true }, assignee: { $exists: false } },
      { $set: { assignee: to }, $unset: { orphanedAt: '' } },
      session ? { session } : {},
    ).exec();
    return result.modifiedCount;
  },

  async listByIds(ids) {
    if (ids.length === 0) return [];
    return TaskModel.find({ _id: { $in: ids } }).lean<TaskRecord[]>().exec();
  },

  async listMine(query) {
    const conditions: Record<string, unknown>[] = [minePredicate(query.userId)];

    if (query.project !== undefined) conditions.push({ project: query.project });
    if (query.noProject === true) conditions.push({ kind: 'standalone' });
    if (query.kind !== undefined) conditions.push({ kind: query.kind });
    if (query.state !== undefined) conditions.push(statePredicate(query.state));

    const ascending = query.sort === 'due_asc';
    if (query.cursor !== null) {
      const after = ascending ? '$gt' : '$lt';
      conditions.push({
        $or: [
          { dueDate: { [after]: query.cursor.dueDate } },
          { dueDate: query.cursor.dueDate, _id: { [after]: query.cursor.id } },
        ],
      });
    }

    const direction = ascending ? 1 : -1;
    return TaskModel.find({ $and: conditions })
      .sort({ dueDate: direction, _id: direction })
      .limit(query.limit)
      .lean<TaskRecord[]>()
      .exec();
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return TaskModel.findById(new Types.ObjectId(id)).lean<TaskRecord>().exec();
  },

  /** Conditional on the field being unset, so a double submit cannot rewrite the first timestamp. */
  async setStarted(id, at) {
    return TaskModel.findOneAndUpdate(
      { _id: id, startedAt: null },
      { $set: { startedAt: at } },
      { returnDocument: 'after' },
    )
      .lean<TaskRecord>()
      .exec();
  },

  async setCompleted(id, at) {
    return TaskModel.findOneAndUpdate(
      { _id: id, completedAt: null, startedAt: { $ne: null } },
      { $set: { completedAt: at } },
      { returnDocument: 'after' },
    )
      .lean<TaskRecord>()
      .exec();
  },

  async create(task) {
    // The dates first agreed are stamped once here, so every creation path preserves them.
    const created = new TaskModel({
      ...task,
      originalStartDate: task.startDate,
      originalDueDate: task.dueDate,
      originalDatesSource: 'creation',
    });
    await created.save();
    return created.toObject() as TaskRecord;
  },
};
