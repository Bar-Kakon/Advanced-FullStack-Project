import { Types, type PipelineStage } from 'mongoose';

import { CompanyMembershipModel } from '../companies/companyMembership.model.js';
import { UserModel } from '../users/user.model.js';

/** A person on a project, reduced to what a member row and an invitation card actually print. */
export interface Participant {
  readonly _id: Types.ObjectId;
  readonly firstName: string;
  readonly lastName: string;
  readonly companyId: Types.ObjectId | null;
  readonly companyName: string | null;
}

export interface ParticipantRepository {
  findByIds(ids: readonly Types.ObjectId[]): Promise<Participant[]>;
  exists(id: Types.ObjectId): Promise<boolean>;
}

export const participantRepository: ParticipantRepository = {
  /** One query for a whole screen, so a member row never costs a lookup of its own. */
  async findByIds(ids) {
    if (ids.length === 0) return [];

    const pipeline: PipelineStage[] = [
      { $match: { _id: { $in: [...ids] } } },
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
            {
              $lookup: {
                from: 'companies',
                localField: 'company',
                foreignField: '_id',
                as: 'company',
              },
            },
            { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
            { $project: { _id: 0, companyId: '$company._id', name: '$company.name' } },
          ],
          as: 'membership',
        },
      },
      { $unwind: { path: '$membership', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          companyId: { $ifNull: ['$membership.companyId', null] },
          companyName: { $ifNull: ['$membership.name', null] },
        },
      },
    ];

    return UserModel.aggregate<Participant>(pipeline).exec();
  },

  async exists(id) {
    return (await UserModel.exists({ _id: id, status: 'active' })) !== null;
  },
};
