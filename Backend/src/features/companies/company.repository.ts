import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { CompanyModel, type Availability, type CompanyRecord } from './company.model.js';

export interface NewCompany {
  readonly name: string;
  readonly officePhone?: string;
  readonly availability: Availability;
}

export interface CompanyRepository {
  create(company: NewCompany, session?: DbSession): Promise<Types.ObjectId>;
  /** Every company holding this name. The name is not unique, so this returns a list. */
  findIdsByName(name: string): Promise<Types.ObjectId[]>;
  findById(id: Types.ObjectId): Promise<CompanyRecord | null>;
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

  /**
   * The date is in the filter as well as the update, so a company that has already been through
   * employee setup keeps its original stamp. Pressing Skip today must not rewrite the day the
   * business actually finished the step.
   */
  async markEmployeeSetupComplete(id, at) {
    await CompanyModel.updateOne(
      { _id: id, employeeSetupCompletedAt: { $exists: false } },
      { $set: { employeeSetupCompletedAt: at } },
    ).exec();
  },
};
