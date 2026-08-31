import { PlanModel, type PlanCode, type PlanRecord } from './plan.model.js';
import { PLAN_CATALOGUE } from './planCatalogue.js';

export interface PlanRepository {
  /** Every purchasable tier, in display order. */
  findActive(): Promise<readonly PlanRecord[]>;
  findByCode(code: PlanCode): Promise<PlanRecord | null>;
  /** Idempotent: inserts the seeded tiers that are missing and leaves existing ones alone. */
  seedMissing(): Promise<number>;
}

export const planRepository: PlanRepository = {
  async findActive() {
    return PlanModel.find({ active: true }).sort({ sortOrder: 1 }).lean<PlanRecord[]>().exec();
  },

  async findByCode(code) {
    return PlanModel.findOne({ code }).lean<PlanRecord>().exec();
  },

  /**
   * Existing documents are left untouched on purpose. Every limit is a data edit by design, so a
   * redeploy must not overwrite a price somebody changed in the database.
   */
  async seedMissing() {
    let inserted = 0;

    for (const seed of PLAN_CATALOGUE) {
      const result = await PlanModel.updateOne(
        { code: seed.code },
        {
          $setOnInsert: {
            code: seed.code,
            sortOrder: seed.sortOrder,
            active: true,
            prices: seed.prices,
            interval: 'month',
            limits: seed.limits,
            provisional: true,
          },
        },
        { upsert: true },
      ).exec();

      if (result.upsertedCount === 1) inserted += 1;
    }

    return inserted;
  },
};
