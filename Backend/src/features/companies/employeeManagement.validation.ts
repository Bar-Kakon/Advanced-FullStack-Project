import Joi from 'joi';

import { COMPANY_PERMISSIONS, COMPANY_POSITIONS, type CompanyPosition } from './companyMembership.model.js';

export interface SetPermissionsBody {
  readonly permissions: readonly (typeof COMPANY_PERMISSIONS)[number][];
}

const OBJECT_ID = Joi.string().hex().length(24);

export interface DepartureArrangementsBody {
  readonly commissions: readonly {
    taskId: string;
    arrangement: 'owner_only' | 'transferred' | 'shared';
    trackeeUserId?: string;
  }[];
  readonly assigned: readonly {
    taskId: string;
    action: 'transfer' | 'await_reassignment';
    assigneeUserId?: string;
  }[];
}

export const departureArrangementsBodySchema = Joi.object<DepartureArrangementsBody>({
  commissions: Joi.array()
    .items(
      Joi.object({
        taskId: OBJECT_ID.required(),
        arrangement: Joi.string().valid('owner_only', 'transferred', 'shared').required(),
        trackeeUserId: OBJECT_ID.optional(),
      }),
    )
    .max(200)
    .default([]),
  assigned: Joi.array()
    .items(
      Joi.object({
        taskId: OBJECT_ID.required(),
        action: Joi.string().valid('transfer', 'await_reassignment').required(),
        assigneeUserId: OBJECT_ID.optional(),
      }),
    )
    .max(200)
    .default([]),
});

export interface OffboardBody {
  readonly arrangements?: DepartureArrangementsBody;
}

export const offboardBodySchema = Joi.object<OffboardBody>({
  arrangements: departureArrangementsBodySchema.optional(),
});

export interface ClaimSeatBody {
  readonly companyName: string;
  readonly companyPosition: CompanyPosition;
}

export const claimSeatBodySchema = Joi.object<ClaimSeatBody>({
  companyName: Joi.string().trim().min(1).max(200).required(),
  companyPosition: Joi.string()
    .valid(...COMPANY_POSITIONS)
    .required(),
});

export interface DepartureDefaultsBody {
  readonly commissioned?: {
    arrangement: 'owner_only' | 'transferred' | 'shared';
    trackeeUserId?: string;
  };
  readonly assigned?: { assigneeUserId?: string };
}

export const departureDefaultsBodySchema = Joi.object<DepartureDefaultsBody>({
  commissioned: Joi.object({
    arrangement: Joi.string().valid('owner_only', 'transferred', 'shared').required(),
    trackeeUserId: OBJECT_ID.optional(),
  }).optional(),
  assigned: Joi.object({ assigneeUserId: OBJECT_ID.optional() }).optional(),
}).min(1);

/** The closed vocabulary and nothing else: an unknown code is a 400, never a silent escalation. */
export const setPermissionsBodySchema = Joi.object<SetPermissionsBody>({
  permissions: Joi.array()
    .items(Joi.string().valid(...COMPANY_PERMISSIONS))
    .unique()
    .max(COMPANY_PERMISSIONS.length)
    .required(),
});


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
