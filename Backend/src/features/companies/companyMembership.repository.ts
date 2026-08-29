import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  CompanyMembershipModel,
  type CompanyMembershipRecord,
  type CompanyPermission,
  type CompanyPosition,
  type CompanyMembershipStatus,
  type CompanyStanding,
} from './companyMembership.model.js';

export interface NewCompanyMembership {
  readonly company: Types.ObjectId;
  readonly user: Types.ObjectId | null;
  readonly invitedFullName?: string;
  readonly standing: CompanyStanding;
  readonly status: CompanyMembershipStatus;
  readonly companyPosition?: CompanyPosition;
  readonly permissions: readonly CompanyPermission[];
}

export interface CompanyMembershipRepository {
  create(membership: NewCompanyMembership, session?: DbSession): Promise<Types.ObjectId>;
  /** The caller's own live relationship. Ids from a request are strings; an unparseable one is
   *  "no such row" rather than a throw. */
  findActiveByUser(userId: string): Promise<CompanyMembershipRecord | null>;
}

/** The only module that writes `companymemberships`. */
export const companyMembershipRepository: CompanyMembershipRepository = {
  async create(membership, session) {
    const [created] = await CompanyMembershipModel.create(
      [{ ...membership, permissions: [...membership.permissions] }],
      session ? { session } : {},
    );
    if (created === undefined) throw new Error('Company membership insert returned no document.');

    return created._id;
  },

  async findActiveByUser(userId) {
    if (!Types.ObjectId.isValid(userId)) return null;

    return CompanyMembershipModel.findOne({ user: new Types.ObjectId(userId), status: 'active' })
      .lean<CompanyMembershipRecord>()
      .exec();
  },
};
