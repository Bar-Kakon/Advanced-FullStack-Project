import { Schema, model, type Types } from 'mongoose';

export const AVAILABILITY_STATUSES = ['open', 'limited', 'closed'] as const;

export type Availability = (typeof AVAILABILITY_STATUSES)[number];

/**
 * The business a contractor operates through. `availability` lives here rather than on each person
 * because it is the organization that decides whether it is taking new work — ten employees under
 * one contractor must not each hold their own copy of that answer.
 *
 * There is deliberately no owner field: ownership is recorded once, as `users.companyStanding`.
 */
export interface CompanyRecord {
  readonly _id: Types.ObjectId;
  readonly name: string;
  readonly officePhone?: string;
  readonly availability: Availability;
  /** When the business finished employee setup. Absent means it has not happened. */
  readonly employeeSetupCompletedAt?: Date;
}

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    officePhone: { type: String, trim: true },
    availability: {
      type: String,
      enum: AVAILABILITY_STATUSES,
      default: 'open',
      required: true,
    },

    // On the COMPANY, because that is what was set up: a second manager joining later must not be
    // walked through the step again. No default and no backfill — absent means it has not happened.
    employeeSetupCompletedAt: { type: Date },
  },
  { timestamps: true },
);

export const CompanyModel = model('Company', companySchema);
