import { Types, type PipelineStage } from 'mongoose';

import {
  UserModel,
  type Region,
  type RegistrationCategory,
  type Specialty,
} from '../users/user.model.js';
import type { Availability } from '../companies/company.model.js';
import { CompanyMembershipModel } from '../companies/companyMembership.model.js';
import { CompanyModel } from '../companies/company.model.js';
import { RatingModel } from '../ratings/rating.model.js';
import type { BrowseCursor } from './browse.cursor.js';

/** One discovered contractor, joined to the company facts Browse renders. */
export interface BrowseCandidate {
  readonly _id: Types.ObjectId;
  readonly firstName: string;
  readonly lastName: string;
  readonly bio?: string;
  readonly registrationCategory: RegistrationCategory;
  readonly specialties?: readonly Specialty[];
  readonly specialtyOther?: string;
  readonly businessPhone?: string;
  readonly avatar?: { readonly fileId?: Types.ObjectId };
  readonly location?: {
    readonly city?: string;
    readonly region?: Region;
    readonly travelRadiusKm?: number;
    readonly place?: { readonly placeId: string; readonly displayName: string };
  };
  readonly approvedTravelLocations?: readonly { readonly placeId: string; readonly displayName: string }[];
  readonly createdAt: Date;
  readonly companyName: string | null;
  readonly companyId: Types.ObjectId | null;
  readonly officePhone: string | null;
  readonly availability: Availability | null;
  /** Present only on a rating-sorted page: the key the cursor for the next page is built from. */
  readonly ratingSortKey?: number;
}

/** `relevance` is the discovery order Browse has always returned; `rating_desc` orders on the average. */
export const BROWSE_SORTS = ['relevance', 'rating_desc'] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];

/** An unrated contractor sorts below every rated one, and is never treated as a zero score. */
const UNRATED_SORT_KEY = -1;

export interface BrowseQuery {
  readonly excludeUserIds: readonly Types.ObjectId[];
  readonly text?: string;
  readonly categories?: readonly RegistrationCategory[];
  readonly specialties?: readonly Specialty[];
  readonly regions?: readonly Region[];
  readonly availability?: readonly Availability[];
  readonly approvedPlaceId?: string;
  readonly sort: BrowseSort;
  readonly cursor: BrowseCursor | null;
  readonly limit: number;
}

export interface BrowseRepository {
  find(query: BrowseQuery): Promise<BrowseCandidate[]>;
}

/** Escaped, so a user typing `.` or `(` searches for that character rather than a pattern. */
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const browseRepository: BrowseRepository = {
  /**
   * One aggregation. The company facts are joined in the pipeline rather than fetched per card,
   * which is what keeps a page of results at a fixed number of round trips.
   */
  async find({
    excludeUserIds, text, categories, specialties, regions, availability, approvedPlaceId, sort,
    cursor, limit,
  }) {
    const match: Record<string, unknown> = { status: 'active' };

    if (excludeUserIds.length > 0) match['_id'] = { $nin: [...excludeUserIds] };
    if (categories && categories.length > 0) match['registrationCategory'] = { $in: [...categories] };
    if (specialties && specialties.length > 0) match['specialties'] = { $in: [...specialties] };
    if (approvedPlaceId) match['approvedTravelLocations.placeId'] = approvedPlaceId;

    // `nationwide` contractors answer every regional filter, or they vanish from every search.
    if (regions && regions.length > 0 && !regions.includes('nationwide')) {
      match['location.region'] = { $in: [...regions, 'nationwide'] };
    } else if (regions && regions.includes('nationwide')) {
      match['location.region'] = 'nationwide';
    }

    if (cursor && cursor.kind === 'discovery') {
      match['$or'] = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    const pipeline: PipelineStage[] = [{ $match: match }];

    pipeline.push(
      {
        $lookup: {
          from: CompanyMembershipModel.collection.name,
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $and: [{ $eq: ['$user', '$$userId'] }, { $eq: ['$status', 'active'] }] },
              },
            },
            { $limit: 1 },
            { $project: { company: 1, standing: 1 } },
          ],
          as: 'membership',
        },
      },
      { $unwind: { path: '$membership', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: CompanyModel.collection.name,
          localField: 'membership.company',
          foreignField: '_id',
          as: 'company',
        },
      },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
    );

    if (availability && availability.length > 0) {
      pipeline.push({ $match: { 'company.availability': { $in: [...availability] } } });
    }

    if (text && text.trim().length > 0) {
      const pattern = new RegExp(escapeRegex(text.trim()), 'i');
      pipeline.push({
        $match: {
          $or: [
            { firstName: pattern },
            { lastName: pattern },
            { 'company.name': pattern },
            { $expr: { $regexMatch: { input: { $concat: ['$firstName', ' ', '$lastName'] }, regex: pattern } } },
          ],
        },
      });
    }

    /*
     * There is no denormalised rating on the user, so ordering by it means computing the average
     * in the pipeline. An unrated contractor keeps a distinct key rather than a zero score.
     */
    if (sort === 'rating_desc') {
      pipeline.push(
        {
          $lookup: {
            from: RatingModel.collection.name,
            localField: '_id',
            foreignField: 'ratee',
            as: 'receivedRatings',
          },
        },
        {
          $addFields: {
            ratingSortKey: {
              $cond: [
                { $gt: [{ $size: '$receivedRatings' }, 0] },
                { $avg: '$receivedRatings.score' },
                UNRATED_SORT_KEY,
              ],
            },
          },
        },
      );

      if (cursor && cursor.kind === 'rating') {
        pipeline.push({
          $match: {
            $or: [
              { ratingSortKey: { $lt: cursor.score } },
              { ratingSortKey: cursor.score, _id: { $lt: cursor.id } },
            ],
          },
        });
      }

      pipeline.push({ $sort: { ratingSortKey: -1, _id: -1 } });
    } else {
      pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
    }

    pipeline.push(
      { $limit: limit },
      {
        $project: {
          firstName: 1, lastName: 1, bio: 1, registrationCategory: 1, specialties: 1, specialtyOther: 1,
          businessPhone: 1, avatar: 1, location: 1, approvedTravelLocations: 1, createdAt: 1,
          ratingSortKey: 1,
          companyName: '$company.name',
          companyId: '$company._id',
          officePhone: '$company.officePhone',
          availability: '$company.availability',
        },
      },
    );

    return UserModel.aggregate<BrowseCandidate>(pipeline).exec();
  },
};