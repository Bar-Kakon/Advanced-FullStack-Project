import { useCallback, useEffect, useState } from 'react';

import {
  classifyBillingError,
  fetchCurrentPlan,
  fetchPlans,
  keepCurrentPlan,
  schedulePlanChange,
  startCheckout,
  type BillingFailure,
} from '../../api/billing.api';
import type { CurrentPlan, Plan, PlanCode } from '../../api/billing.types';
import { useLanguage } from '../../i18n/useLanguage';

/**
 * The screen's data and the three things it can ask for.
 *
 * Nothing here decides an entitlement. `current` is re-read from the server after every change, so
 * what the screen shows is what the server believes rather than what this code assumed — and an
 * upgrade in particular changes nothing until the payment provider confirms it, which happens on a
 * callback this browser never sees.
 */
export const useSubscriptions = () => {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [current, setCurrent] = useState<CurrentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PlanCode | null>(null);
  const [failure, setFailure] = useState<BillingFailure | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setFailure(null);
    try {
      const [catalogue, mine] = await Promise.all([fetchPlans(), fetchCurrentPlan()]);
      setPlans(catalogue.plans);
      setCurrent(mine);
    } catch (error) {
      setFailure(classifyBillingError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Leaves for the provider's own payment page. Coming back does not activate anything: the
   * account moves only when the provider confirms the payment to the server directly.
   */
  const upgrade = useCallback(async (planCode: PlanCode): Promise<void> => {
    setPending(planCode);
    setFailure(null);
    try {
      const { redirectUrl } = await startCheckout(planCode);
      window.location.assign(redirectUrl);
    } catch (error) {
      setFailure(classifyBillingError(error));
      setPending(null);
    }
  }, []);

  /** Downgrade and cancellation are the same call: cancelling schedules a change to Free. */
  const scheduleChange = useCallback(
    async (planCode: PlanCode): Promise<void> => {
      setPending(planCode);
      setFailure(null);
      try {
        await schedulePlanChange(planCode);
        setCurrent(await fetchCurrentPlan());
      } catch (error) {
        setFailure(classifyBillingError(error));
      } finally {
        setPending(null);
      }
    },
    [],
  );

  const keepPlan = useCallback(async (): Promise<void> => {
    setFailure(null);
    try {
      await keepCurrentPlan();
      setCurrent(await fetchCurrentPlan());
    } catch (error) {
      setFailure(classifyBillingError(error));
    }
  }, []);

  const errors = t.subscriptions.errors;
  const error =
    failure === 'ALREADY_ON_PLAN' ? errors.alreadyOnPlan
    : failure === 'NOT_PURCHASABLE' ? errors.notPurchasable
    : failure === 'NO_ACTIVE_SUBSCRIPTION' ? errors.noActiveSubscription
    : failure === 'PROVIDER_NOT_CONFIGURED' ? errors.providerNotConfigured
    : failure === 'CHECKOUT_FAILED' ? errors.checkoutFailed
    : failure === 'NETWORK' ? errors.network
    : failure ? errors.unknown
    : null;

  return { plans, current, loading, pending, error, reload: load, upgrade, scheduleChange, keepPlan };
};