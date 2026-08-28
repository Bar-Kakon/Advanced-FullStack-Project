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
  },
  { timestamps: true },
);

export const CompanyModel = model('Company', companySchema);
