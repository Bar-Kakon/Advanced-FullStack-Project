import type { Plan, PlanCode, PlanLimits } from '../../api/billing.types';
import type { Strings } from '../../i18n/strings.types';

/**
 * Turning stored limits into the words the comparison table shows.
 *
 * Every value here is derived from the catalogue rather than written per tier, so a limit changed
 * in the database changes the screen. Nothing is hard-coded per plan code — that is what would let
 * the table and the enforcement drift apart.
 */

const BYTES_PER_MB = 1024 * 1024;

/** The one place `null` becomes a word, so no row invents its own way of saying unlimited. */
export const countLabel = (value: number | null, t: Strings): string =>
  value === null ? t.subscriptions.compare.unlimited : String(value);

export const megabytes = (bytes: number, t: Strings): string =>
  t.subscriptions.compare.megabytes.replace('{n}', String(Math.round(bytes / BYTES_PER_MB)));

/**
 * Audit retention as a person reads it: a short window in days, a long one in months, and complete
 * when nothing is filtered out. Entries are never deleted — this describes how far back they are
 * readable.
 */
export const historyLabel = (days: number | null, t: Strings): string => {
  if (days === null) return t.subscriptions.compare.complete;
  if (days < 60) return t.subscriptions.compare.lastDays.replace('{n}', String(days));
  return t.subscriptions.compare.months.replace('{n}', String(Math.round(days / 30)));
};

/** Two booleans decide one row, so the three channel answers stay a single vocabulary. */
export const channelsLabel = (limits: PlanLimits, t: Strings): string => {
  if (limits.notificationDigest) return t.subscriptions.channels.inAppEmailAndDigest;
  if (limits.emailNotifications) return t.subscriptions.channels.inAppAndEmail;
  return t.subscriptions.channels.inApp;
};

export interface ComparisonRow {
  readonly key: keyof Strings['subscriptions']['rows'];
  readonly label: string;
  /** A string renders as text; a boolean renders as the included / not-included mark. */
  readonly values: readonly (string | boolean)[];
}

/**
 * Every row that differs between the tiers, in the order the approved screen shows them.
 *
 * The visual-simulation row is deliberately absent: it metered architectural visualization, which
 * the product removed. Version history is absent too — work plans are append-only, so every
 * version is kept on every plan, and the row moved to the included-in-every-plan section.
 */
export const comparisonRows = (plans: readonly Plan[], t: Strings): readonly ComparisonRow[] => {
  const rows = t.subscriptions.rows;
  const limits = plans.map((plan) => plan.limits);

  return [
    { key: 'activeProjects', label: rows.activeProjects, values: limits.map((l) => countLabel(l.activeProjects, t)) },
    { key: 'activeDelegations', label: rows.activeDelegations, values: limits.map((l) => countLabel(l.activeDelegations, t)) },
    { key: 'privateExecutionLayer', label: rows.privateExecutionLayer, values: limits.map((l) => l.privateExecutionLayer) },
    { key: 'agreementForm', label: rows.agreementForm, values: limits.map((l) => l.agreementForm) },
    { key: 'moderatedThreads', label: rows.moderatedThreads, values: limits.map((l) => l.moderatedThreads) },
    { key: 'muteControls', label: rows.muteControls, values: limits.map((l) => l.muteControls) },
    { key: 'fileMaxBytes', label: rows.fileMaxBytes, values: limits.map((l) => megabytes(l.fileMaxBytes, t)) },
    { key: 'auditRetentionDays', label: rows.auditRetentionDays, values: limits.map((l) => historyLabel(l.auditRetentionDays, t)) },
    { key: 'notificationChannels', label: rows.notificationChannels, values: limits.map((l) => channelsLabel(l, t)) },
    { key: 'connections', label: rows.connections, values: limits.map((l) => countLabel(l.connections, t)) },
    { key: 'supportTier', label: rows.supportTier, values: limits.map((l) => t.subscriptions.support[l.supportTier]) },
  ];
};

/** The shekel price. Currency does not follow the interface language — see the decision log. */
export const priceLabel = (plan: Plan, t: Strings): { amount: string; cycle: string } => {
  const row = plan.prices.find((price) => price.currency === 'ILS');
  const amount = (row?.amountMinor ?? 0) / 100;

  return amount === 0
    ? { amount: t.subscriptions.freePrice, cycle: t.subscriptions.forever }
    : { amount: `₪${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`, cycle: t.subscriptions.perMonth };
};

export interface Highlight {
  readonly label: string;
  readonly value: string;
  /** A capability the tier is the first to include, which the card marks. */
  readonly flagship: boolean;
}

/**
 * The short overview on a card: the numbers that move between tiers, plus whichever capabilities
 * this tier is the first to unlock.
 *
 * Derived from the catalogue and the shared row labels rather than written per plan, so a card can
 * never promise something the comparison table below it contradicts.
 */
export const highlights = (plan: Plan, plans: readonly Plan[], t: Strings): readonly Highlight[] => {
  const rows = t.subscriptions.rows;
  const l = plan.limits;
  const below = plans.filter((other) => other.sortOrder < plan.sortOrder);
  // First to include it: no lower tier has it.
  const isNew = (key: 'privateExecutionLayer' | 'agreementForm' | 'moderatedThreads' | 'muteControls'): boolean =>
    l[key] && !below.some((other) => other.limits[key]);

  const capabilities: readonly Highlight[] = (
    [
      ['privateExecutionLayer', rows.privateExecutionLayer],
      ['agreementForm', rows.agreementForm],
      ['moderatedThreads', rows.moderatedThreads],
      ['muteControls', rows.muteControls],
    ] as const
  )
    .filter(([key]) => isNew(key))
    .map(([, label]) => ({ label, value: t.subscriptions.compare.included, flagship: true }));

  return [
    { label: rows.activeProjects, value: countLabel(l.activeProjects, t), flagship: false },
    { label: rows.activeDelegations, value: countLabel(l.activeDelegations, t), flagship: false },
    { label: rows.connections, value: countLabel(l.connections, t), flagship: false },
    ...capabilities,
  ];
};

const ORDER: readonly PlanCode[] = ['free', 'basic', 'premium'];

/** Whether moving to `target` is a purchase or a scheduled step down. */
export const isUpgrade = (from: PlanCode, target: PlanCode): boolean =>
  ORDER.indexOf(target) > ORDER.indexOf(from);