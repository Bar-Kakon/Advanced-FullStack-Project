import { Schema, model, type Types } from 'mongoose';

/** The three tiers, as approved. Language-neutral codes: the label is translated at render. */
export const PLAN_CODES = ['free', 'basic', 'premium'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const CURRENCIES = ['ILS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const SUPPORT_TIERS = ['community', 'email', 'priority'] as const;
export type SupportTier = (typeof SUPPORT_TIERS)[number];

export interface PlanPrice {
  readonly currency: Currency;
  /**
   * Minor units — agorot and cents — as an integer. Floating-point money is a rounding bug that
   * only shows up in aggregate, long after anyone remembers why.
   */
  readonly amountMinor: number;
  /**
   * Per row rather than per plan: the Hebrew site quotes VAT-inclusive prices while the USD price
   * is quoted before local tax. Without this the two numbers silently mean different things.
   */
  readonly taxIncluded: boolean;
}

/**
 * Every numeric limit a quota check reads, and every capability flag.
 *
 * `null` means unlimited — never `0`, which collides with a genuine limit of zero, and never a
 * sentinel such as 999999, which turns an unlimited plan into a defect that appears only for the
 * heaviest user.
 *
 * Nothing in the coordination loop is priced. There is no limit on opening or answering a date
 * change, on creating a task, or on joining a project: the platform only works when every party on
 * a job is in it. Every limit here is capacity, storage, history or convenience.
 */
export interface PlanLimits {
  /** Projects the user's business OWNS. Participation in other people's is never limited. */
  readonly activeProjects: number | null;
  readonly tasksPerProject: number | null;
  readonly membersPerProject: number | null;
  readonly connections: number | null;
  readonly fileMaxBytes: number;
  readonly auditRetentionDays: number | null;
  /** Confidential delegations open AT ONCE — a concurrency limit, not a gate on the feature. */
  readonly activeDelegations: number | null;
  readonly moderatedThreads: boolean;
  readonly muteControls: boolean;
  readonly agreementForm: boolean;
  readonly notificationDigest: boolean;
  /**
   * Configuring WHEN a notification class is delivered. It never gates whether a blocking notice
   * appears in-app, which is free on every tier — Premium buys control, not access.
   */
  readonly notificationTimingControls: boolean;
  readonly privateExecutionLayer: boolean;
  readonly emailNotifications: boolean;
  readonly supportTier: SupportTier;
}

export type PlanLimitKey = keyof PlanLimits;

/** The numeric limits, separated at the type level so a boolean can never be compared to a count. */
export type NumericLimitKey = {
  [K in PlanLimitKey]: PlanLimits[K] extends number | null ? K : never;
}[PlanLimitKey];

/** The on/off capabilities, for the same reason. */
export type BooleanLimitKey = {
  [K in PlanLimitKey]: PlanLimits[K] extends boolean ? K : never;
}[PlanLimitKey];

/** What one payment provider calls this tier, and the currency it was registered in. */
export interface ProviderPlanBinding {
  readonly productId: string;
  readonly planId: string;
  readonly currency: Currency;
}

/**
 * The provider's own identifiers for a tier, keyed by provider name.
 *
 * `null` means the tier has not been registered with that provider, which is the state of every
 * document until the provisioning script runs and the permanent state of Free.
 */
export interface ProviderPlans {
  readonly paypal: ProviderPlanBinding | null;
}

export interface PlanRecord {
  readonly _id: Types.ObjectId;
  readonly code: PlanCode;
  readonly sortOrder: number;
  readonly active: boolean;
  readonly prices: readonly PlanPrice[];
  readonly interval: 'month';
  readonly limits: PlanLimits;
  /** Absent on documents seeded before this field existed, which a lean read does not default. */
  readonly providerPlans?: ProviderPlans;
  /** True while the tier definition is a working assumption rather than decided product. */
  readonly provisional: boolean;
}

const priceSchema = new Schema(
  {
    currency: { type: String, enum: CURRENCIES, required: true },
    amountMinor: { type: Number, required: true, min: 0 },
    taxIncluded: { type: Boolean, required: true },
  },
  { _id: false },
);

const limitsSchema = new Schema(
  {
    activeProjects: { type: Number, default: null },
    tasksPerProject: { type: Number, default: null },
    membersPerProject: { type: Number, default: null },
    connections: { type: Number, default: null },
    fileMaxBytes: { type: Number, required: true },
    auditRetentionDays: { type: Number, default: null },
    activeDelegations: { type: Number, default: null },
    moderatedThreads: { type: Boolean, required: true },
    muteControls: { type: Boolean, required: true },
    agreementForm: { type: Boolean, required: true },
    notificationDigest: { type: Boolean, required: true },
    notificationTimingControls: { type: Boolean, required: true, default: false },
    privateExecutionLayer: { type: Boolean, required: true },
    emailNotifications: { type: Boolean, required: true },
    supportTier: { type: String, enum: SUPPORT_TIERS, required: true },
  },
  { _id: false },
);

const providerPlanSchema = new Schema(
  {
    productId: { type: String, required: true, trim: true },
    planId: { type: String, required: true, trim: true },
    currency: { type: String, enum: CURRENCIES, required: true },
  },
  { _id: false },
);

const providerPlansSchema = new Schema(
  { paypal: { type: providerPlanSchema, default: null } },
  { _id: false },
);

const planSchema = new Schema(
  {
    code: { type: String, enum: PLAN_CODES, required: true, unique: true },
    sortOrder: { type: Number, required: true },
    // A retired tier stays here because historical subscriptions still reference it. It is only
    // hidden from the pricing screen.
    active: { type: Boolean, default: true, required: true },
    prices: { type: [priceSchema], required: true },
    interval: { type: String, enum: ['month'], default: 'month', required: true },
    limits: { type: limitsSchema, required: true },
    providerPlans: { type: providerPlansSchema, default: () => ({ paypal: null }) },
    provisional: { type: Boolean, default: true, required: true },
  },
  { timestamps: true },
);

// Covers the only list query this collection serves, already sorted.
planSchema.index({ active: 1, sortOrder: 1 });

export const PlanModel = model('Plan', planSchema);
