import {
  CompanyMembershipModel,
  OWNER_COMPANY_POSITION,
} from '../../src/features/companies/companyMembership.model.js';

/** Owner rows carrying no position at all. A row that already names one is never in scope. */
export const OWNERS_WITHOUT_POSITION: Record<string, unknown> = {
  standing: 'owner',
  $or: [{ companyPosition: { $exists: false } }, { companyPosition: null }],
};

export const countOwnersWithoutPosition = async (): Promise<number> =>
  CompanyMembershipModel.countDocuments(OWNERS_WITHOUT_POSITION).exec();

/** Owner rows naming some other job. Reported, never rewritten. */
export const countOwnersWithOtherPosition = async (): Promise<number> =>
  CompanyMembershipModel.countDocuments({
    standing: 'owner',
    companyPosition: { $exists: true, $nin: [null, OWNER_COMPANY_POSITION] },
  }).exec();

export const migrateOwnerPositions = async (): Promise<number> => {
  const result = await CompanyMembershipModel.updateMany(
    OWNERS_WITHOUT_POSITION,
    { $set: { companyPosition: OWNER_COMPANY_POSITION } },
  ).exec();

  return result.modifiedCount;
};
