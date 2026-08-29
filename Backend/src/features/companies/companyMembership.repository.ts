import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  CompanyMembershipModel,
  CURRENT_MEMBERSHIP_STATUSES,
  type CompanyPermission,
  type CompanyPosition,
  type CompanyMembershipRecord,
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

/** What a self-registration has to match: an open seat, in a company of that name, for that job. */
export interface InvitationMatch {
  readonly companyIds: readonly Types.ObjectId[];
  readonly invitedFullName: string;
  readonly companyPosition: CompanyPosition;
}

export interface CompanyMembershipRepository {
  create(membership: NewCompanyMembership, session?: DbSession): Promise<Types.ObjectId>;
  /** Open seats matching a registration. More than one is ambiguous and the caller decides. */
  findOpenInvitations(match: InvitationMatch): Promise<CompanyMembershipRecord[]>;
  /** `invited` → `pending_company_approval`, binding the seat to the account that claimed it. */
  claimInvitation(id: Types.ObjectId, user: Types.ObjectId, session?: DbSession): Promise<boolean>;
  /** Ids arriving from a request are strings; an unparseable one is "no such row", never a throw. */
  findActiveByUser(userId: string): Promise<CompanyMembershipRecord | null>;
  /** Their one company, active or waiting for approval. An ended relationship is not one. */
  findCurrentByUser(userId: string): Promise<CompanyMembershipRecord | null>;
  listByCompany(company: Types.ObjectId): Promise<CompanyMembershipRecord[]>;
  /** `pending_company_approval` → `active`. Returns how many rows actually moved. */
  approve(company: Types.ObjectId, membershipId: string): Promise<number>;
  approveAllPending(company: Types.ObjectId): Promise<number>;
}

/** The only module that reads or writes `companymemberships`. */
export const companyMembershipRepository: CompanyMembershipRepository = {
  async create(membership, session) {
    const [created] = await CompanyMembershipModel.create(
      [{ ...membership, permissions: [...membership.permissions] }],
      session ? { session } : {},
    );
    if (created === undefined) throw new Error('Company membership insert returned no document.');

    return created._id;
  },

  async findOpenInvitations({ companyIds, invitedFullName, companyPosition }) {
    return CompanyMembershipModel.find({
      company: { $in: [...companyIds] },
      status: 'invited',
      user: null,
      standing: 'employee',
      invitedFullName,
      companyPosition,
    })
      .lean<CompanyMembershipRecord[]>()
      .exec();
  },

  async claimInvitation(id, user, session) {
    // The status is part of the filter, so two registrations racing for one seat cannot both win:
    // the second finds nothing to update.
    const query = CompanyMembershipModel.updateOne(
      { _id: id, status: 'invited', user: null },
      { $set: { user, status: 'pending_company_approval' } },
    );
    if (session) query.session(session);

    const result = await query.exec();
    return result.modifiedCount === 1;
  },

  async findActiveByUser(userId) {
    if (!Types.ObjectId.isValid(userId)) return null;

    return CompanyMembershipModel.findOne({ user: new Types.ObjectId(userId), status: 'active' })
      .lean<CompanyMembershipRecord>()
      .exec();
  },

  /** `user_current_unique` guarantees at most one match, so there is nothing here to choose between. */
  async findCurrentByUser(userId) {
    if (!Types.ObjectId.isValid(userId)) return null;

    return CompanyMembershipModel.findOne({
      user: new Types.ObjectId(userId),
      status: { $in: [...CURRENT_MEMBERSHIP_STATUSES] },
    })
      .lean<CompanyMembershipRecord>()
      .exec();
  },

  async listByCompany(company) {
    return CompanyMembershipModel.find({ company })
      .sort({ createdAt: 1 })
      .lean<CompanyMembershipRecord[]>()
      .exec();
  },

  async approve(company, membershipId) {
    if (!Types.ObjectId.isValid(membershipId)) return 0;

    // The company is in the filter as well as the id, so an owner can only ever approve their own.
    const result = await CompanyMembershipModel.updateOne(
      { _id: new Types.ObjectId(membershipId), company, status: 'pending_company_approval' },
      { $set: { status: 'active' } },
    ).exec();

    return result.modifiedCount;
  },

  async approveAllPending(company) {
    const result = await CompanyMembershipModel.updateMany(
      { company, status: 'pending_company_approval' },
      { $set: { status: 'active' } },
    ).exec();

    return result.modifiedCount;
  },
};
