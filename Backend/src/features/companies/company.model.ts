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
  /**
   * When this business finished setting up its staff, whether by inviting somebody or by saying it
   * did not want to. Absent means neither has happened yet.
   */
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

    /*
     * The durable answer to "has this business been through employee setup", and it lives on the
     * COMPANY because that is what was set up. Putting it on the person would make it a fact about
     * whoever happened to sign up first, so a second manager joining later would be walked through
     * the step again for a company whose staff already exists.
     *
     * A date rather than a boolean: it says the same thing and also says when, which a support
     * question about a company that claims it never saw the step cannot otherwise answer. There is
     * no default and no backfill — absent means it has not happened, which is true of every company
     * created before this field existed.
     */
    employeeSetupCompletedAt: { type: Date },
  },
  { timestamps: true },
);

export const CompanyModel = model('Company', companySchema);
