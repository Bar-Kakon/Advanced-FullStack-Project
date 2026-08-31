import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  CompanyModel,
  type Availability,
  type CompanyRecord,
  type ContractorCategory,
} from './company.model.js';

export interface NewCompany {
  readonly name: string;
  readonly officePhone?: string;
  readonly availability: Availability;
  readonly contractorCategory?: ContractorCategory;
}

export interface CompanyUpdate {
  readonly name?: string;
  /** `null` clears the number; an absent key leaves it as it is. */
  readonly officePhone?: string | null;
  readonly availability?: Availability;
}

export interface CompanyRepository {
  create(company: NewCompany, session?: DbSession): Promise<Types.ObjectId>;
  /** Every company holding this name. The name is not unique, so this returns a list. */
  findIdsByName(name: string): Promise<Types.ObjectId[]>;
  findById(id: Types.ObjectId): Promise<CompanyRecord | null>;
  /** Classifies a business that has no classification yet. Never overwrites one that has. */
  classifyIfUnset(id: Types.ObjectId, category: ContractorCategory): Promise<boolean>;
  update(id: Types.ObjectId, update: CompanyUpdate): Promise<void>;
  /** Stamps employee setup as done. Idempotent, and the first stamp is the one that survives. */
  markEmployeeSetupComplete(id: Types.ObjectId, at: Date): Promise<void>;
}

/**
 * There is no delete here on purpose. Undoing a half-finished signup was what the compensating
 * delete existed for, and a transaction removes the situation rather than cleaning up after it.
 */
export const companyRepository: CompanyRepository = {
  async create(company, session) {
    const [created] = await CompanyModel.create([company], session ? { session } : {});
    if (created === undefined) throw new Error('Company insert returned no document.');

    return created._id;
  },

  async findIdsByName(name) {
    return CompanyModel.find({ name }).distinct('_id');
  },

  async findById(id) {
    return CompanyModel.findById(id).lean<CompanyRecord>().exec();
  },

  async classifyIfUnset(id, category) {
    const result = await CompanyModel.updateOne(
      { _id: id, contractorCategory: { $exists: false } },
      { $set: { contractorCategory: category } },
    ).exec();

    return result.modifiedCount === 1;
  },

  async update(id, update) {
    // Only the three keys the caller actually supplied are written; an absent key is untouched,
    // never blanked.
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    if (update.name !== undefined) $set['name'] = update.name;
    if (update.availability !== undefined) $set['availability'] = update.availability;
    if (update.officePhone === null) $unset['officePhone'] = '';
    else if (update.officePhone !== undefined) $set['officePhone'] = update.officePhone;

    const changes = {
      ...(Object.keys($set).length > 0 ? { $set } : {}),
      ...(Object.keys($unset).length > 0 ? { $unset } : {}),
    };
    if (Object.keys(changes).length === 0) return;

    await CompanyModel.updateOne({ _id: id }, changes).exec();
  },

  /** The filter keeps the original stamp: a later call must not rewrite the day it happened. */
  async markEmployeeSetupComplete(id, at) {
    await CompanyModel.updateOne(
      { _id: id, employeeSetupCompletedAt: { $exists: false } },
      { $set: { employeeSetupCompletedAt: at } },
    ).exec();
  },
};
