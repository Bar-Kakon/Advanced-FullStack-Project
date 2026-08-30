import { Types } from 'mongoose';

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
  listMine(query: MyTasksQuery): Promise<TaskRecord[]>;
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
      { new: true },
    )
      .lean<TaskRecord>()
      .exec();
  },

  async setCompleted(id, at) {
    return TaskModel.findOneAndUpdate(
      { _id: id, completedAt: null, startedAt: { $ne: null } },
      { $set: { completedAt: at } },
      { new: true },
    )
      .lean<TaskRecord>()
      .exec();
  },

  async create(task) {
    const created = new TaskModel(task);
    await created.save();
    return created.toObject() as TaskRecord;
  },
};
