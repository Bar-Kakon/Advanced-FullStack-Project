import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { CompanyModel, type Availability } from './company.model.js';

export interface NewCompany {
  readonly name: string;
  readonly officePhone?: string;
  readonly availability: Availability;
}

export interface CompanyRepository {
  create(company: NewCompany, session?: DbSession): Promise<Types.ObjectId>;
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
};
