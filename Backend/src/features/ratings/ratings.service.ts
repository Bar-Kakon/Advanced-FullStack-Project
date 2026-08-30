import { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import type { RatingWorkContext } from './rating.model.js';
import type { RatingRepository } from './rating.repository.js';
import { alreadyRated, cannotRateSelf, notEligibleToRate, rateeNotFound } from './rating.errors.js';
import type { CreateRatingBody } from './ratings.validation.js';

/** Does the platform hold evidence that these two completed real professional work together? */
export interface RatingEligibilityPort {
  /** The context to record, or `null` when nothing proves the relationship. */
  findWorkEvidence(raterId: string, rateeId: string, workId: string): Promise<RatingWorkContext | null>;
  /** The same question asked of the pair rather than of one named piece of work. */
  hasAnyWorkEvidence(raterId: string, rateeId: string): Promise<boolean>;
}

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
  async rate(actorId, { rateeUserId, workId, score, comment }) {
    // First, and before anything that could be satisfied another way.
    if (actorId === rateeUserId) throw cannotRateSelf();

    const ratee = await users.findById(rateeUserId);
    if (ratee === null) throw rateeNotFound();

    // The same identity reached by another route is still the same identity.
    if (ratee._id.toString() === actorId) throw cannotRateSelf();

    const context = await eligibility.findWorkEvidence(actorId, rateeUserId, workId);
    if (context === null) throw notEligibleToRate();

    const created = await ratings.create({
      rater: new Types.ObjectId(actorId),
      ratee: ratee._id,
      score,
      context,
      ...(comment === undefined ? {} : { comment }),
    });
    if (created === null) throw alreadyRated();
  },
});