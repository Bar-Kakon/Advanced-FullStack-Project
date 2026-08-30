import { Types } from 'mongoose';

import type { RatingEligibilityPort } from '../ratings/ratings.service.js';
import { TaskModel, type TaskRecord } from './task.model.js';

/**
 * The Tasks domain answering the evidence question the Ratings feature asks through a port.
 *
 * The pair it proves is the counterparty and the responsible party on one completed piece of
 * project work: whoever ordered it, and whoever answered for it. A supplier fulfilling a delivery
 * commitment is that same shape, so supplier participation needs no separate path.
 *
 * A delegate is deliberately not a party here. The delegator stays responsible, and the closed
 * confidentiality rule means the side that ordered the work must never learn who performed it.
 */
const completedTogether = (raterId: string, rateeId: string): Record<string, unknown> => {
  const rater = new Types.ObjectId(raterId);
  const ratee = new Types.ObjectId(rateeId);

  return {
    kind: 'project',
    completedAt: { $ne: null },
    $or: [
      { createdBy: rater, assignee: ratee },
      { createdBy: ratee, assignee: rater },
    ],
  };
};

export const workEvidenceAdapter: RatingEligibilityPort = {
  async findWorkEvidence(raterId, rateeId, workId) {
    const ids = [raterId, rateeId, workId];
    if (!ids.every((id) => Types.ObjectId.isValid(id))) return null;

    const completed = await TaskModel.findOne({
      _id: new Types.ObjectId(workId),
      ...completedTogether(raterId, rateeId),
    })
      .select('project')
      .lean<Pick<TaskRecord, '_id' | 'project'>>()
      .exec();

    if (completed === null || completed.project === undefined) return null;
    return { kind: 'project_task', project: completed.project, task: completed._id };
  },

  async hasAnyWorkEvidence(raterId, rateeId) {
    if (![raterId, rateeId].every((id) => Types.ObjectId.isValid(id))) return false;
    if (raterId === rateeId) return false;

    const completed = await TaskModel.exists(completedTogether(raterId, rateeId)).exec();
    return completed !== null;
  },
};
