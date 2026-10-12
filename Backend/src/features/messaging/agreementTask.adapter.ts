import { Types } from 'mongoose';

import type { TaskCreationService } from '../tasks/taskCreation.service.js';
import type { AgreementTaskPort } from './messaging.service.js';

/**
 * An accepted agreement becomes a task through the EXISTING task domain — there is no second task
 * schema and no second set of permissions.
 *
 * It creates STANDALONE work on the performer, through the acceptance path: receiving work is not
 * creating work, so the manual `task.create` gate is not asked. Project work needs a stage and
 * moves its dates through the Proposal/Cascade boundary, and an agreement carries neither; routing
 * it that way would let a conversation write a committed project date without the proposal that
 * rule exists to require. The commitment's two parties stay on the agreement message itself.
 */
export const createAgreementTaskAdapter = (creation: TaskCreationService): AgreementTaskPort => ({
  async create({ assigneeId, title, description, startDate, dueDate }) {
    const result = await creation.createFromAcceptedAgreement(assigneeId, {
      title,
      ...(description === undefined ? {} : { description }),
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    });

    return new Types.ObjectId(result.task.id);
  },
});
