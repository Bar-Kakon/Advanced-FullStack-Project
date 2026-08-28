import type { Types } from 'mongoose';

import { CompanyModel, type Availability } from './company.model.js';

export interface NewCompany {
  readonly name: string;
  readonly officePhone?: string;
  readonly availability: Availability;
}

export interface CompanyRepository {
  create(company: NewCompany): Promise<Types.ObjectId>;
  deleteById(id: Types.ObjectId): Promise<void>;
}

/**
 * `deleteById` exists to undo a company this same request created, nothing else. Register writes two
 * documents and a standalone mongod has no transactions, so the compensating delete is what keeps a
 * failed signup from leaving an orphan behind.
 */
export const companyRepository: CompanyRepository = {
  async create(company) {
    const created = await CompanyModel.create(company);
    return created._id;
  },

  async deleteById(id) {
    await CompanyModel.deleteOne({ _id: id }).exec();
  },
};
