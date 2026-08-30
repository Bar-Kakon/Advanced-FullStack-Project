import { Types } from 'mongoose';

import {
  CompanyCalendarVersionModel,
  type CompanyCalendarVersionRecord,
} from './companyCalendarVersion.model.js';
import { DEFAULT_WORKING_CALENDAR, type WorkingCalendarConfig } from './workingCalendar.types.js';

export interface CompanyCalendarRepository {
  findCurrent(company: Types.ObjectId): Promise<CompanyCalendarVersionRecord | null>;
  findById(id: Types.ObjectId): Promise<CompanyCalendarVersionRecord | null>;
  listVersions(company: Types.ObjectId): Promise<CompanyCalendarVersionRecord[]>;
  append(
    company: Types.ObjectId,
    config: WorkingCalendarConfig,
    createdBy: Types.ObjectId,
  ): Promise<CompanyCalendarVersionRecord>;
}

const DUPLICATE_KEY_CODE = 11000;

export const companyCalendarRepository: CompanyCalendarRepository = {
  async findCurrent(company) {
    return CompanyCalendarVersionModel.findOne({ company })
      .sort({ version: -1 })
      .lean<CompanyCalendarVersionRecord>()
      .exec();
  },

  async findById(id) {
    return CompanyCalendarVersionModel.findById(id).lean<CompanyCalendarVersionRecord>().exec();
  },

  async listVersions(company) {
    return CompanyCalendarVersionModel.find({ company })
      .sort({ version: 1 })
      .lean<CompanyCalendarVersionRecord[]>()
      .exec();
  },

  /**
   * Appends the next version. The unique index decides the number under concurrency: a loser
   * retries against the version that actually won rather than overwriting it.
   */
  async append(company, config, createdBy) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await this.findCurrent(company);
      const version = (latest?.version ?? 0) + 1;
      try {
        const created = new CompanyCalendarVersionModel({ company, version, config, createdBy });
        await created.save();
        return created.toObject() as CompanyCalendarVersionRecord;
      } catch (error) {
        if ((error as { code?: number }).code !== DUPLICATE_KEY_CODE) throw error;
      }
    }
    throw new Error('Could not append a company calendar version after repeated contention.');
  },
};

/** A company with no calendar yet behaves as though it holds the default, never as an error. */
export const configOrDefault = (
  version: CompanyCalendarVersionRecord | null,
): WorkingCalendarConfig => version?.config ?? DEFAULT_WORKING_CALENDAR;
