import { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import {
  conflictsWithParticipation,
  isContextSuperseded,
  type RatingWorkContext,
} from './rating.model.js';
import type { RatingRepository } from './rating.repository.js';
import {
  alreadyRated,
  cannotRateSelf,
  notEligibleToRate,
  rateeNotFound,
  ratingContextSuperseded,
} from './rating.errors.js';
import type { CreateRatingBody } from './ratings.validation.js';

/** Does the platform hold evidence that these two completed real professional work together? */
export interface RatingEligibilityPort {
  /** The context to record, or `null` when nothing proves the relationship. */
  findWorkEvidence(raterId: string, rateeId: string, workId: string): Promise<RatingWorkContext | null>;
  /** The same question asked of the pair rather than of one named piece of work. */
  hasAnyWorkEvidence(raterId: string, rateeId: string): Promise<boolean>;
  /** Whether a completed Task already represents work between the pair inside one project. */
  hasCompletedTaskWorkIn(raterId: string, rateeId: string, projectId: string): Promise<boolean>;
  /** Every completed piece of work between the pair that could carry a rating — the form's list. */
  listWorkEvidence(
    raterId: string,
    rateeId: string,
  ): Promise<readonly { id: string; title: string; completedAt: Date }[]>;
}

export interface RatingsService {
  rate(actorId: string, input: CreateRatingBody): Promise<void>;
  eligibleWorks(
    actorId: string,
    rateeUserId: string,
  ): Promise<readonly { id: string; title: string; completedAt: string }[]>;
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
  async eligibleWorks(actorId, rateeUserId) {
    if (actorId === rateeUserId) return [];
    const works = await eligibility.listWorkEvidence(actorId, rateeUserId);
    return works.map((work) => ({
      id: work.id,
      title: work.title,
      completedAt: work.completedAt.toISOString(),
    }));
  },

  async rate(actorId, { rateeUserId, workId, score, comment }) {
    // First, and before anything that could be satisfied another way.
    if (actorId === rateeUserId) throw cannotRateSelf();

    const ratee = await users.findById(rateeUserId);
    if (ratee === null) throw rateeNotFound();

    // The same identity reached by another route is still the same identity.
    if (ratee._id.toString() === actorId) throw cannotRateSelf();

    const context = await eligibility.findWorkEvidence(actorId, rateeUserId, workId);
    if (context === null) throw notEligibleToRate();

    const project = context.project.toString();
    const [taskWork, participation] = await Promise.all([
      eligibility.hasCompletedTaskWorkIn(actorId, rateeUserId, project),
      ratings.hasParticipationRating(actorId, rateeUserId, project),
    ]);
    if (isContextSuperseded(context, taskWork)) throw ratingContextSuperseded();
    if (conflictsWithParticipation(context, participation)) throw ratingContextSuperseded();

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