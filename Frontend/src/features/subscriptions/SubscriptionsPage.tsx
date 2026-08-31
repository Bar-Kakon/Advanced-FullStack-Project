import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { PlanCard } from './components/PlanCard';
import { PlanComparison } from './components/PlanComparison';
import { useSubscriptions } from './useSubscriptions';
import profileCss from '../profile/profile.css?inline';
import subscriptionsCss from './subscriptions.css?inline';

/** The account's own dates, in the interface language rather than the browser's. */
const formatDate = (iso: string, lang: 'he' | 'en'): string =>
  new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/**
 * The Subscriptions screen.
 *
 * Three reconciliations recorded in the decision log: the visual
 * simulation rows and the weekly usage strip are gone with the feature they metered, the project
 * labels follow the current My projects wording, and dependencies are named between stages.
 *
 * Nothing here decides an entitlement. The current plan is read from the server and re-read after
 * every change; an upgrade leaves for the provider's own page and activates nothing on return,
 * because only the provider's confirmed callback to the server can do that.
 */
export const SubscriptionsPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  // profile.css carries the palette tokens and the app shell every authenticated screen shares.
  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'subscriptions.css', css: subscriptionsCss },
  );
  useDocumentTitle(t.subscriptions.documentTitle);

  const { plans, current, loading, pending, error, reload, upgrade, scheduleChange, keepPlan } =
    useSubscriptions();

  const s = t.subscriptions;
  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';
  const subscription = current?.subscription ?? null;

  const periodNote = (): string | null => {
    if (subscription === null) return null;
    const date = formatDate(subscription.currentPeriodEnd, lang);

    if (subscription.status === 'past_due') return s.period.pastDue;
    if (subscription.cancelAtPeriodEnd) return s.period.canceled.replace('{date}', date);
    if (subscription.scheduledPlanCode !== null) {
      return s.period.scheduled
        .replace('{date}', date)
        .replace('{plan}', s.planNames[subscription.scheduledPlanCode]);
    }
    return s.period.renews.replace('{date}', date);
  };

  const note = periodNote();
  // Provisional is the honest word for every price and limit on this screen, and the catalogue
  // says so itself rather than the claim being written into the copy.
  const provisional = plans.some((plan) => plan.provisional);

  return (
    <>
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="plans">
        <header className="plans__head">
          <h1 className="plans__title">{s.title}</h1>
          <p className="plans__sub">{s.lede}</p>
        </header>

        {error === null ? null : <FormAlert message={error} />}

        {loading ? (
          <p className="plans__state" role="status">{s.loading}</p>
        ) : plans.length === 0 ? (
          <p className="plans__state">
            {s.loadFailed}{' '}
            <button type="button" className="link-button" onClick={() => void reload()}>
              {s.retry}
            </button>
          </p>
        ) : (
          <>
            {note === null ? null : (
              <section className="period" aria-label={s.title}>
                <p className="period__main">{note}</p>
                {subscription !== null && subscription.scheduledPlanCode !== null ? (
                  <button type="button" className="link-button" onClick={() => void keepPlan()}>
                    {s.period.keepPlan}
                  </button>
                ) : null}
              </section>
            )}

            {/* Said once, plainly, rather than repeated as a tooltip on every disabled button. */}
            {current !== null && !current.checkoutAvailable ? (
              <p className="plans__unavailable">{s.checkoutUnavailable}</p>
            ) : null}

            <ul className="plan-grid">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.code}
                  plan={plan}
                  allPlans={plans}
                  currentPlanCode={current?.planCode ?? 'free'}
                  checkoutAvailable={current?.checkoutAvailable ?? false}
                  busy={pending === plan.code}
                  onUpgrade={(code) => void upgrade(code)}
                  onScheduleChange={(code) => void scheduleChange(code)}
                />
              ))}
            </ul>

            <PlanComparison plans={plans} />

            <section className="faq" aria-labelledby="faq-title">
              <h2 className="section-title" id="faq-title">{s.faq.title}</h2>
              {s.faq.items.map((item) => (
                <details className="faq__item" key={item.q}>
                  <summary className="faq__q">{item.q}</summary>
                  <p className="faq__a">{item.a}</p>
                </details>
              ))}
            </section>

            <p className="plans__note">{s.note}</p>
            {provisional ? <p className="plans__note plans__note--soft">{s.provisional}</p> : null}
          </>
        )}
      </main>
    </>
  );
};