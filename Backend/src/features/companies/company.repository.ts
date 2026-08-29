import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { CompanyModel, type Availability, type CompanyRecord } from './company.model.js';

export interface NewCompany {
  readonly name: string;
  readonly officePhone?: string;
  readonly availability: Availability;
}

export interface CompanyUpdate {
  readonly name?: string;
  /** `null` clears the number; an absent key leaves it as it is. */
  readonly officePhone?: string | null;
  readonly availability?: Availability;
}

export interface CompanyRepository {
  create(company: NewCompany, session?: DbSession): Promise<Types.ObjectId>;
  findById(id: Types.ObjectId): Promise<CompanyRecord | null>;
  update(id: Types.ObjectId, update: CompanyUpdate): Promise<void>;
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

  async findById(id) {
    return CompanyModel.findById(id).lean<CompanyRecord>().exec();
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
};
