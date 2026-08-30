import { Types } from 'mongoose';

import { RatingModel, type RatingRecord } from './rating.model.js';

export type NewRating = Omit<RatingRecord, '_id' | 'createdAt'>;

export interface RatingSummary {
  readonly average: number;
  readonly count: number;
}

export interface RatingRepository {
  create(rating: NewRating): Promise<Types.ObjectId | null>;
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
