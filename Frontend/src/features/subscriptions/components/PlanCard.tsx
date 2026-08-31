import { ButtonSpinner } from '../../../components/ButtonSpinner';
import type { Plan, PlanCode } from '../../../api/billing.types';
import { useLanguage } from '../../../i18n/useLanguage';
import { highlights, isUpgrade, priceLabel } from '../planPresentation';

/**
 * One tier.
 *
 * The control it draws is decided by two facts and nothing else: which plan the person is on, and
 * whether this deployment can take a payment at all. When it cannot, the card says so in words
 * instead of rendering a button that would fail — a dead control presented as a working one is the
 * thing this screen must not do.
 */
export const PlanCard = ({
  plan,
  allPlans,
  currentPlanCode,
  checkoutAvailable,
  busy,
  onUpgrade,
  onScheduleChange,
}: {
  plan: Plan;
  /** The whole catalogue, so the card can say which capabilities THIS tier is the first to add. */
  allPlans: readonly Plan[];
  currentPlanCode: PlanCode;
  checkoutAvailable: boolean;
  busy: boolean;
  onUpgrade: (planCode: PlanCode) => void;
  onScheduleChange: (planCode: PlanCode) => void;
}) => {
  const { t } = useLanguage();
  const s = t.subscriptions;
  const isCurrent = plan.code === currentPlanCode;
  const upgrade = isUpgrade(currentPlanCode, plan.code);
  const { amount, cycle } = priceLabel(plan, t);
  const name = s.planNames[plan.code];

  return (
    <li
      className={`plan-card${isCurrent ? ' plan-card--current' : ''}${plan.code === 'basic' ? ' plan-card--featured' : ''}`}
    >
      {isCurrent ? (
        <span className="plan-card__flag">{s.currentFlag}</span>
      ) : plan.code === 'basic' ? (
        <span className="plan-card__flag plan-card__flag--pop">{s.popularFlag}</span>
      ) : null}

      <h2 className="plan-card__name">{name}</h2>
      <p className="plan-card__tagline">{s.taglines[plan.code]}</p>

      <p className="plan-card__price">
        <bdi className="plan-card__amount">{amount}</bdi>
        <span className="plan-card__cycle">{cycle}</span>
      </p>

      <ul className="feat-list">
        {highlights(plan, allPlans, t).map((item) => (
          <li className={`feat${item.flagship ? ' feat--star' : ''}`} key={item.label}>
            {item.label}: <bdi>{item.value}</bdi>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button type="button" className="btn btn--muted btn--full" disabled>
          {s.currentPlan}
        </button>
      ) : upgrade ? (
        // Checkout is the only path to a paid tier, so with no provider there is nothing to press.
        checkoutAvailable ? (
          <button
            type="button"
            className="btn btn--primary btn--full"
            disabled={busy}
            onClick={() => onUpgrade(plan.code)}
          >
            {s.upgradeTo.replace('{plan}', name)}
            {busy ? <ButtonSpinner /> : null}
          </button>
        ) : (
          <p className="plan-card__unavailable">{s.checkoutUnavailableShort}</p>
        )
      ) : (
        // Stepping down needs no provider: it is scheduled locally and takes effect at the end of
        // the period already paid for.
        <button
          type="button"
          className="btn btn--ghost btn--full"
          disabled={busy}
          onClick={() => onScheduleChange(plan.code)}
        >
          {(plan.code === 'free' ? s.cancelPlan : s.downgradeTo).replace('{plan}', name)}
          {busy ? <ButtonSpinner /> : null}
        </button>
      )}
    </li>
  );
};