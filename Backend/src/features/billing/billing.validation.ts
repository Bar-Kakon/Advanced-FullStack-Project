import Joi from 'joi';

import { PLAN_CODES, type PlanCode } from './plan.model.js';

/**
 * A plan code and nothing else.
 *
 * There is deliberately no amount, no currency and no period on either of these. The price is read
 * from the catalogue on the server, so a client that posts one is not merely refused — it has
 * nowhere to put it, and `validateRequest` strips unknown keys before the handler runs.
 */
export interface PlanSelectionBody {
  readonly planCode: PlanCode;
}

export const planSelectionBodySchema = Joi.object<PlanSelectionBody>({
  planCode: Joi.string()
    .valid(...PLAN_CODES)
    .required(),
});
