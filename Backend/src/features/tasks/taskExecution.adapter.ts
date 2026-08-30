import { Types } from 'mongoose';

import type { ProjectExecutionPort, ProjectTaskSummary } from '../projects/projectLifecycle.service.js';
import { TaskModel, type TaskRecord } from './task.model.js';
import { isOverdue } from './taskState.js';

/**
 * The Tasks domain answering the questions the Projects and Dashboard features were already
 * asking through a port.
 *
 * Everything here is counted from real task rows. The port previously answered `null` and `false`
 * because nothing could compute an answer; now that tasks exist, the same seam returns the truth
 * and no surface derives these figures a second time.
 */
export const taskExecutionAdapter: ProjectExecutionPort = {
  /**
   * The closed start rule: the project has started when the GC set a date AND the first task
   * actually started on it. The second half is what this answers.
   */
  async hasFirstTaskStarted(projectId) {
    if (!Types.ObjectId.isValid(projectId)) return false;
    const started = await TaskModel.exists({
      project: new Types.ObjectId(projectId),
      startedAt: { $ne: null },
    }).exec();
    return started !== null;
  },

  /** Completed means every task is closed — and a project with no tasks has closed nothing. */
  async areAllTasksClosed(projectId) {
    if (!Types.ObjectId.isValid(projectId)) return false;
    const project = new Types.ObjectId(projectId);
    const total = await TaskModel.countDocuments({ project }).exec();
    if (total === 0) return false;
    const open = await TaskModel.countDocuments({ project, completedAt: null }).exec();
    return open === 0;
  },

  /**
   * Real counts, or `null` when the project genuinely has no tasks — the Dashboard renders that as
   * "no work yet" rather than as four zeros, which would claim work exists and none of it is done.
   */
  async summarize(projectId): Promise<ProjectTaskSummary | null> {
    if (!Types.ObjectId.isValid(projectId)) return null;

    const rows = await TaskModel.find({ project: new Types.ObjectId(projectId) })
      .select('dueDate startedAt completedAt orphanedAt')
      .lean<Pick<TaskRecord, 'dueDate' | 'startedAt' | 'completedAt' | 'orphanedAt'>[]>()
      .exec();
    if (rows.length === 0) return null;

    const now = new Date();
    const completed = rows.filter((row) => row.completedAt !== undefined).length;

    return {
      total: rows.length,
      open: rows.length - completed,
      // Derived here exactly as My Tasks derives it, from the one shared rule.
      overdue: rows.filter((row) => isOverdue(row, now)).length,
      completed,
    };
  },
};
