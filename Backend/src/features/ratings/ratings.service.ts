import { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import type { RatingRepository } from './rating.repository.js';
import { alreadyRated, cannotRateSelf, notEligibleToRate, rateeNotFound } from './rating.errors.js';
import type { CreateRatingBody } from './ratings.validation.js';

/**
 * Whether a shared completed task entitles one person to rate another.
 *
 * It is a port because the task domain does not exist yet: `tasks` and `projects` are unbuilt, so
 * nothing can prove shared completed work today. The rule is not invented here — the seam is, so
 * the tasks feature can supply it later without the rating rules moving.
 */
export interface RatingEligibilityPort {
  canRate(raterId: string, rateeId: string, taskId: string): Promise<boolean>;
}

/** Refuses every rating, because no shared completed task can exist while `tasks` is unbuilt. */
export const noTaskDomainEligibility: RatingEligibilityPort = {
  async canRate() {
    return false;
  },
};

export interface RatingsService {
  rate(actorId: string, input: CreateRatingBody): Promise<void>;
}

export interface RatingsDependencies {
  readonly ratings: RatingRepository;
  readonly users: UserRepository;
  readonly eligibility: RatingEligibilityPort;
}

export const createRatingsService = ({
  ratings,
  users,
  eligibility,
}: RatingsDependencies): RatingsService => ({
  async rate(actorId, { rateeUserId, taskId, score, comment }) {
    // First, and before anything that could be satisfied another way.
    if (actorId === rateeUserId) throw cannotRateSelf();

    const ratee = await users.findById(rateeUserId);
    if (ratee === null) throw rateeNotFound();

    // The same identity reached by another route is still the same identity.
    if (ratee._id.toString() === actorId) throw cannotRateSelf();

    if (!(await eligibility.canRate(actorId, rateeUserId, taskId))) throw notEligibleToRate();

    const created = await ratings.create({
      rater: new Types.ObjectId(actorId),
      ratee: ratee._id,
      score,
      task: new Types.ObjectId(taskId),
      ...(comment === undefined ? {} : { comment }),
    });
    if (created === null) throw alreadyRated();
  },
});