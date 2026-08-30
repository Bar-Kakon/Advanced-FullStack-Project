import { Types, type PipelineStage } from 'mongoose';

import { BlockModel } from '../blocks/block.model.js';
import { CompanyModel, type Availability } from '../companies/company.model.js';
import { CompanyMembershipModel } from '../companies/companyMembership.model.js';
import { ConnectionModel } from '../connections/connection.model.js';
import {
  UserModel,
  type Region,
  type RegistrationCategory,
  type Specialty,
} from '../users/user.model.js';
import type { NetworkCursor } from './network.cursor.js';
import type { NetworkGroup } from './network.dto.js';

/** One edge, reduced to the other party and the date this group is ordered by. */
export interface NetworkEdge {
  readonly _id: Types.ObjectId;
  readonly otherUserId: Types.ObjectId;
  readonly at: Date;
}

/** The person behind a row, joined to the company facts a card shows. */
export interface NetworkPerson {
  readonly _id: Types.ObjectId;
  readonly firstName: string;
  readonly lastName: string;
  readonly registrationCategory: RegistrationCategory;
  readonly specialties?: readonly Specialty[];
  readonly specialtyOther?: string;
  readonly avatar?: { readonly fileId?: Types.ObjectId };
  readonly location?: { readonly city?: string; readonly region?: Region };
  readonly companyName: string | null;
  readonly availability: Availability | null;
}

export interface NetworkQuery {
  readonly userId: string;
  readonly group: NetworkGroup;
  readonly cursor: NetworkCursor | null;
  readonly limit: number;
}

export interface BlockedQuery {
  readonly userId: string;
  readonly cursor: NetworkCursor | null;
  readonly limit: number;
}

export interface NetworkRepository {
  findEdges(query: NetworkQuery): Promise<NetworkEdge[]>;
  findBlocks(query: BlockedQuery): Promise<NetworkEdge[]>;
  findPeople(ids: readonly Types.ObjectId[]): Promise<NetworkPerson[]>;
}

const toObjectId = (id: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

const olderThan = (cursor: NetworkCursor | null, field: string): Record<string, unknown>[] =>
  cursor === null
    ? []
    : [
        {
          $or: [
            { [field]: { $lt: cursor.at } },
            { [field]: cursor.at, _id: { $lt: cursor.id } },
          ],
        },
      ];

export const networkRepository: NetworkRepository = {
  async findEdges({ userId, group, cursor, limit }) {
    const viewer = toObjectId(userId);
    if (viewer === null) return [];

    const dateField = group === 'connected' ? 'respondedAt' : 'requestedAt';
    const side =
      group === 'connected'
        ? { $or: [{ requester: viewer }, { recipient: viewer }], status: 'accepted' }
        : group === 'incoming'
          ? { recipient: viewer, status: 'pending' }
          : { requester: viewer, status: 'pending' };

    const filter: Record<string, unknown> = { $and: [side, ...olderThan(cursor, dateField)] };

    const rows = await ConnectionModel.find(filter)
      .sort({ [dateField]: -1, _id: -1 })
      .limit(limit)
      .select({ requester: 1, recipient: 1, [dateField]: 1 })
      .lean<{ _id: Types.ObjectId; requester: Types.ObjectId; recipient: Types.ObjectId; respondedAt?: Date; requestedAt?: Date }[]>()
      .exec();

    return rows.flatMap((row) => {
      const at = group === 'connected' ? row.respondedAt : row.requestedAt;
      if (at === undefined) return [];

      return [
        {
          _id: row._id,
          otherUserId: row.requester.equals(viewer) ? row.recipient : row.requester,
          at,
        },
      ];
    });
  },

  async findBlocks({ userId, cursor, limit }) {
    const viewer = toObjectId(userId);
    if (viewer === null) return [];

    const filter: Record<string, unknown> = {
      $and: [{ blockerUserId: viewer }, ...olderThan(cursor, 'createdAt')],
    };

    const rows = await BlockModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select({ blockedUserId: 1, createdAt: 1 })
      .lean<{ _id: Types.ObjectId; blockedUserId: Types.ObjectId; createdAt: Date }[]>()
      .exec();

    return rows.map((row) => ({ _id: row._id, otherUserId: row.blockedUserId, at: row.createdAt }));
  },

  /** One aggregation for a whole page, so a row never costs a query of its own. */
  async findPeople(ids) {
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
            { $project: { company: 1 } },
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
      {
        $project: {
          firstName: 1,
          lastName: 1,
          registrationCategory: 1,
          specialties: 1,
          specialtyOther: 1,
          avatar: 1,
          location: 1,
          companyName: '$company.name',
          availability: '$company.availability',
        },
      },
    ];

    return UserModel.aggregate<NetworkPerson>(pipeline).exec();
  },
};
