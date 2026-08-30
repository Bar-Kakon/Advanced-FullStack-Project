import { Types } from 'mongoose';

import { RatingModel, type RatingRecord } from './rating.model.js';

export type NewRating = Omit<RatingRecord, '_id' | 'createdAt'>;

export interface RatingSummary {
  readonly average: number;
  readonly count: number;
}

export interface RatingRepository {
  create(rating: NewRating): Promise<Types.ObjectId | null>;
  /** Either direction: the pair holds one participation rating per project at most. */
  hasParticipationRating(raterId: string, rateeId: string, projectId: string): Promise<boolean>;
  listForRatee(rateeUserId: string): Promise<RatingRecord[]>;
  /** `null` when nobody has rated them, which the profile renders as an honest blank. */
  summaryFor(rateeUserId: string): Promise<RatingSummary | null>;
  summaryForMany(rateeIds: readonly Types.ObjectId[]): Promise<Map<string, RatingSummary>>;
}

const DUPLICATE_KEY_CODE = 11000;

const toObjectId = (id: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

export const ratingRepository: RatingRepository = {
  async create(rating) {
    try {
      const [created] = await RatingModel.create([rating]);
      return created?._id ?? null;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) return null;
      throw error;
    }
  },

  async hasParticipationRating(raterId, rateeId, projectId) {
    const rater = toObjectId(raterId);
    const ratee = toObjectId(rateeId);
    const project = toObjectId(projectId);
    if (rater === null || ratee === null || project === null) return false;

    const found = await RatingModel.exists({
      'context.kind': 'project_participation',
      'context.project': project,
      $or: [
        { rater, ratee },
        { rater: ratee, ratee: rater },
      ],
    }).exec();
    return found !== null;
  },

  async listForRatee(rateeUserId) {
    const ratee = toObjectId(rateeUserId);
    if (ratee === null) return [];

    return RatingModel.find({ ratee }).sort({ createdAt: -1 }).lean<RatingRecord[]>().exec();
  },

  async summaryFor(rateeUserId) {
    const ratee = toObjectId(rateeUserId);
    if (ratee === null) return null;

    return (await this.summaryForMany([ratee])).get(ratee.toString()) ?? null;
  },

  // One aggregation for a whole result page rather than one per card.
  async summaryForMany(rateeIds) {
    if (rateeIds.length === 0) return new Map();

    const rows = await RatingModel.aggregate<{ _id: Types.ObjectId; average: number; count: number }>([
      { $match: { ratee: { $in: [...rateeIds] } } },
      { $group: { _id: '$ratee', average: { $avg: '$score' }, count: { $sum: 1 } } },
    ]).exec();

    return new Map(
      rows.map((row) => [row._id.toString(), { average: row.average, count: row.count }]),
    );
  },
};
