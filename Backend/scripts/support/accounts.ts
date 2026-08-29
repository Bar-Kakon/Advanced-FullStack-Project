/** Builds real accounts through the real Register endpoint, and removes them afterwards. */
import { Types } from 'mongoose';

import { CompanyModel } from '../../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../../src/features/companies/companyMembership.model.js';
import { FileAssetModel } from '../../src/features/files/fileAsset.model.js';
import { UserModel } from '../../src/features/users/user.model.js';
import { WorkEntryModel } from '../../src/features/workentries/workEntry.model.js';
import { request } from './harness.js';

export interface Account {
  readonly email: string;
  readonly token: string;
  readonly userId: Types.ObjectId;
  readonly companyId: Types.ObjectId;
}

export const createAccount = async (baseUrl: string, marker: string, index: number): Promise<Account> => {
  const email = `${marker}.${index}.${Date.now()}@example.com`;
  const companyName = `${marker} ${index} ${Date.now()} Ltd`;

  const { status, body } = await request(baseUrl, 'POST', '/api/auth/register', {
    json: {
      firstName: 'Verify',
      lastName: `Account${index}`,
      companyName,
      email,
      password: 'CorrectHorse42!',
      confirmPassword: 'CorrectHorse42!',
      specialty: 'drilling',
      city: 'חיפה',
      region: 'haifa',
      availability: 'open',
      acceptedTerms: true,
    },
  });

  if (status !== 201) throw new Error(`Register failed for the harness account: ${JSON.stringify(body)}`);

  const user = await UserModel.findOne({ email }).lean().exec();
  const company = await CompanyModel.findOne({ name: companyName }).lean().exec();
  if (!user || !company) throw new Error('Register reported success but wrote no account.');

  return {
    email,
    token: body['accessToken'] as string,
    userId: user._id,
    companyId: company._id,
  };
};

/** Everything the scripts create carries the same marker, so cleanup can be exact. */
export const cleanUp = async (marker: string): Promise<void> => {
  const users = await UserModel.find({ email: new RegExp(`^${marker}\\.`) }).select('_id').lean().exec();
  const userIds = users.map((user) => user._id);

  await WorkEntryModel.deleteMany({ owner: { $in: userIds } }).exec();
  await FileAssetModel.deleteMany({ owner: { $in: userIds } }).exec();
  await CompanyMembershipModel.deleteMany({ user: { $in: userIds } }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${marker} `) }).exec();
  await UserModel.deleteMany({ _id: { $in: userIds } }).exec();
};
