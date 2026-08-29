import Joi from 'joi';

import { COMPANY_POSITIONS, type CompanyPosition } from './companyMembership.model.js';

const MAX_FULL_NAME_LENGTH = 200;

export interface CreateInvitationBody {
  readonly fullName: string;
  readonly companyPosition: CompanyPosition;
}

/**
 * The two values an employee's self-registration is matched on, and only those. No email, phone or
 * one-time code is asked for: none is part of the approved matching model.
 */
export const createInvitationBodySchema = Joi.object<CreateInvitationBody>({
  fullName: Joi.string().trim().min(1).max(MAX_FULL_NAME_LENGTH).required(),
  companyPosition: Joi.string()
    .valid(...COMPANY_POSITIONS)
    .required(),
});
