import type { Plan } from '../../../api/billing.types';
import { useLanguage } from '../../../i18n/useLanguage';
import { comparisonRows } from '../planPresentation';

/**
 * The differences between the tiers, and the capabilities that are the same on all of them.
 *
 * Every cell is derived from the catalogue the server sent, so a limit edited in the database
 * changes this table. Nothing is written per plan, which is what keeps the table and the
 * enforcement from drifting apart.
 *
 * Both tables scroll inside their own container rather than widening the page, which is what keeps
 * a three-column comparison usable on a phone held on a building site.
 */
export const PlanComparison = ({ plans }: { plans: readonly Plan[] }) => {
  const { t } = useLanguage();
  const s = t.subscriptions;
  const rows = comparisonRows(plans, t);

  const mark = (included: boolean) => (
    <span
      className={`mark ${included ? 'mark--yes' : 'mark--no'}`}
      role="img"
      aria-label={included ? s.compare.included : s.compare.notIncluded}
    />
  );

  return (
    <>
      <section className="compare" aria-labelledby="compare-title">
        <h2 className="section-title" id="compare-title">{s.compare.title}</h2>
        <p className="compare__lede">{s.compare.lede}</p>

        <div className="compare__scroll">
          <table className="compare__table">
            <thead>
              <tr>
                <th scope="col" className="compare__feature-col">{s.compare.capability}</th>
                {plans.map((plan) => (
                  <th key={plan.code} scope="col" className={plan.code === 'basic' ? 'is-featured' : undefined}>
                    {s.planNames[plan.code]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, index) => (
                    <td
                      key={plans[index]?.code ?? index}
                      className={plans[index]?.code === 'basic' ? 'is-featured' : undefined}
                    >
                      {typeof value === 'boolean' ? mark(value) : <bdi>{value}</bdi>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="compare compare--common" aria-labelledby="common-title">
        <h2 className="section-title" id="common-title">{s.common.title}</h2>
        <p className="compare__lede">{s.common.lede}</p>

        <div className="compare__scroll">
          <table className="compare__table">
            <thead>
              <tr>
                <th scope="col" className="compare__feature-col">{s.compare.capability}</th>
                <th scope="col">{s.common.everyPlan}</th>
              </tr>
            </thead>
            <tbody>
              {s.common.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};