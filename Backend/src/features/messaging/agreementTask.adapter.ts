import { Types } from 'mongoose';

import type { TaskCreationService } from '../tasks/taskCreation.service.js';
import type { AgreementTaskPort } from './messaging.service.js';

/**
 * An accepted agreement becomes a task through the EXISTING task domain — there is no second task
 * schema and no second set of permissions.
 *
 * It creates STANDALONE work, owned by the party who accepted it. Project work needs a stage and
 * moves its dates through the Proposal/Cascade boundary, and an agreement carries neither; routing
 * it that way would let a conversation write a committed project date without the proposal that
 * rule exists to require.
 */
export const createAgreementTaskAdapter = (creation: TaskCreationService): AgreementTaskPort => ({
  async create({ assigneeId, title, description, startDate, dueDate }) {
    const result = await creation.create(assigneeId, {
      kind: 'standalone',
      title,
      ...(description === undefined ? {} : { description }),
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    });

    return new Types.ObjectId(result.task.id);
  },
});
