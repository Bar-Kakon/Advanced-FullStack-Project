import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  CompanyMembershipModel,
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
};
